import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import type { IDisposable, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getTerminalBridge } from './terminal-bridge';
import './terminal.css';

type TermTab = {
    id: string;
    shell: string;
    cwd: string;
};

type RuntimeTerminal = {
    term: Terminal;
    fit: FitAddon;
    disposables: IDisposable[];
    opened: boolean;
};

function createAccessibilityInputBridge(id: string, node: HTMLDivElement, bridge: NonNullable<ReturnType<typeof getTerminalBridge>>): IDisposable {
    const flushTextareaValue = () => {
        const textarea = node.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea');
        if (!textarea) return;
        textarea.setAttribute('aria-label', 'Terminal input');
        const value = textarea.value;
        if (!value) return;
        textarea.value = '';
        void bridge.write(id, value.replace(/\r?\n/g, '\r'));
    };
    const interval = window.setInterval(flushTextareaValue, 120);
    flushTextareaValue();
    return {
        dispose: () => window.clearInterval(interval),
    };
}

function readTheme(): ITheme {
    return {
        background: '#0b1020',
        foreground: '#e5edf8',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.22)',
        black: '#0f172a',
        brightBlack: '#475569',
        red: '#ef4444',
        brightRed: '#f87171',
        green: '#22c55e',
        brightGreen: '#4ade80',
        yellow: '#eab308',
        brightYellow: '#facc15',
        blue: '#3b82f6',
        brightBlue: '#60a5fa',
        magenta: '#d946ef',
        brightMagenta: '#e879f9',
        cyan: '#06b6d4',
        brightCyan: '#22d3ee',
        white: '#e5e7eb',
        brightWhite: '#f8fafc',
    };
}

export function TerminalPanel() {
    const bridge = getTerminalBridge();
    const [tabs, setTabs] = useState<TermTab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const runtimesRef = useRef<Map<string, RuntimeTerminal>>(new Map());
    const pendingOutputRef = useRef<Map<string, string>>(new Map());
    const tabsRef = useRef<TermTab[]>(tabs);
    const activeIdRef = useRef<string | null>(activeId);
    const autoCreatedRef = useRef(false);

    tabsRef.current = tabs;
    activeIdRef.current = activeId;

    const fitTerminal = useCallback((id: string) => {
        const runtime = runtimesRef.current.get(id);
        if (!bridge || !runtime?.opened) return;
        try {
            runtime.fit.fit();
            void bridge.resize(id, runtime.term.cols, runtime.term.rows);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [bridge]);

    const disposeRuntime = useCallback((id: string) => {
        const runtime = runtimesRef.current.get(id);
        if (!runtime) return;
        for (const disposable of runtime.disposables) {
            try { disposable.dispose(); } catch { /* ignore */ }
        }
        try { runtime.term.dispose(); } catch { /* ignore */ }
        runtimesRef.current.delete(id);
        pendingOutputRef.current.delete(id);
    }, []);

    const createRuntime = useCallback((id: string) => {
        if (!bridge || runtimesRef.current.has(id)) return;
        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 12,
            lineHeight: 1.22,
            scrollback: 10_000,
            convertEol: false,
            theme: readTheme(),
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        const disposables = [
            term.onData(data => { void bridge.write(id, data); }),
            term.onResize(({ cols, rows }) => { void bridge.resize(id, cols, rows); }),
        ];
        runtimesRef.current.set(id, { term, fit, disposables, opened: false });
        const pending = pendingOutputRef.current.get(id);
        if (pending) {
            term.write(pending);
            pendingOutputRef.current.delete(id);
        }
    }, [bridge]);

    const createSession = useCallback(async () => {
        if (!bridge) return;
        setIsCreating(true);
        try {
            const result = await bridge.create({ cols: 80, rows: 24 });
            if (!result.ok || !result.id) {
                setError(result.error ?? 'Failed to start terminal session');
                return;
            }
            createRuntime(result.id);
            const tab: TermTab = { id: result.id, shell: result.shell ?? 'sh', cwd: result.cwd ?? '~' };
            setError(null);
            setTabs(prev => [...prev, tab]);
            setActiveId(result.id);
            window.setTimeout(() => {
                fitTerminal(result.id!);
                runtimesRef.current.get(result.id!)?.term.focus();
            }, 0);
        } finally {
            setIsCreating(false);
        }
    }, [bridge, createRuntime, fitTerminal]);

    const closeSession = useCallback((id: string) => {
        if (!bridge) return;
        void bridge.kill(id);
        disposeRuntime(id);
        setTabs(prev => {
            const next = prev.filter(tab => tab.id !== id);
            setActiveId(current => current === id ? (next[0]?.id ?? null) : current);
            return next;
        });
    }, [bridge, disposeRuntime]);

    const attachHost = useCallback((id: string, node: HTMLDivElement | null) => {
        if (!node || !bridge) return;
        const runtime = runtimesRef.current.get(id);
        if (!runtime || runtime.opened) return;
        runtime.term.open(node);
        runtime.opened = true;
        runtime.disposables.push(createAccessibilityInputBridge(id, node, bridge));
        fitTerminal(id);
        if (activeIdRef.current === id) runtime.term.focus();
    }, [bridge, fitTerminal]);

    useEffect(() => {
        if (!bridge) return;
        if (tabs.length === 0 && !autoCreatedRef.current) {
            autoCreatedRef.current = true;
            void createSession();
        }
    }, [bridge, tabs.length, createSession]);

    useEffect(() => {
        if (!bridge) return;
        const offData = bridge.onData((id, data) => {
            const runtime = runtimesRef.current.get(id);
            if (runtime) {
                runtime.term.write(data);
                return;
            }
            pendingOutputRef.current.set(id, `${pendingOutputRef.current.get(id) ?? ''}${data}`);
        });
        const offExit = bridge.onExit((id, code) => {
            const runtime = runtimesRef.current.get(id);
            runtime?.term.writeln(`\r\n[process exited with code ${code ?? 'unknown'}]`);
            disposeRuntime(id);
            setTabs(prev => prev.filter(tab => tab.id !== id));
            setActiveId(prev => prev === id ? (tabsRef.current.find(tab => tab.id !== id)?.id ?? null) : prev);
        });
        return () => {
            offData();
            offExit();
            for (const tab of tabsRef.current) {
                void bridge.kill(tab.id);
            }
            for (const id of Array.from(runtimesRef.current.keys())) {
                disposeRuntime(id);
            }
        };
    }, [bridge, disposeRuntime]);

    useEffect(() => {
        if (!activeId) return;
        window.setTimeout(() => {
            fitTerminal(activeId);
            runtimesRef.current.get(activeId)?.term.focus();
        }, 0);
    }, [activeId, fitTerminal]);

    useEffect(() => {
        if (!panelRef.current || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            const id = activeIdRef.current;
            if (id) fitTerminal(id);
        });
        observer.observe(panelRef.current);
        return () => observer.disconnect();
    }, [fitTerminal]);

    if (!bridge) {
        return <div className="terminal-panel terminal-unavailable">Terminal requires Electron desktop app</div>;
    }

    const activeTab = tabs.find(tab => tab.id === activeId);
    const statusText = activeTab?.cwd ?? (isCreating ? 'Starting shell...' : 'No terminal sessions');

    return (
        <div className="terminal-panel" ref={panelRef}>
            <div className="terminal-tab-bar">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={`terminal-tab-item ${tab.id === activeId ? 'is-active' : ''}`}
                    >
                        <button
                            type="button"
                            className="terminal-tab"
                            onClick={() => setActiveId(tab.id)}
                        >
                            {tab.shell.split('/').pop()}
                        </button>
                        <button
                            type="button"
                            className="terminal-tab-close"
                            aria-label={`Close ${tab.shell.split('/').pop() ?? 'terminal'} session`}
                            title="Close terminal session"
                            onClick={() => closeSession(tab.id)}
                        >
                            ×
                        </button>
                    </div>
                ))}
                <button type="button" className="terminal-tab terminal-new-tab" aria-label="New terminal" disabled={isCreating} onClick={() => void createSession()}>+</button>
                <span className="terminal-status">{statusText}</span>
            </div>
            <div className="terminal-xterm-host" aria-label="Terminal output">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        ref={node => attachHost(tab.id, node)}
                        className={`terminal-xterm-surface${tab.id === activeId ? ' is-active' : ''}`}
                        onPointerDown={() => runtimesRef.current.get(tab.id)?.term.focus()}
                    />
                ))}
                {tabs.length === 0 && (
                    <div className="terminal-empty">
                        <button type="button" disabled={isCreating} onClick={() => void createSession()}>New terminal</button>
                    </div>
                )}
            </div>
            {error && <div className="terminal-error" role="status">{error}</div>}
        </div>
    );
}
