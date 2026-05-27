import { useCallback, useEffect, useRef, useState } from 'react';
import { getTerminalBridge } from './terminal-bridge';
import './terminal.css';

const OUTPUT_DOM_CAP = 200_000;

type TermSession = {
    id: string;
    shell: string;
    cwd: string;
};

export function TerminalPanel() {
    const bridge = getTerminalBridge();
    const [sessions, setSessions] = useState<TermSession[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const termRef = useRef<HTMLDivElement>(null);
    const cleanupRef = useRef<Array<() => void>>([]);

    const createSession = useCallback(async () => {
        if (!bridge) return;
        const result = await bridge.create();
        if (!result.ok || !result.id) return;
        const session: TermSession = { id: result.id, shell: result.shell ?? 'sh', cwd: result.cwd ?? '~' };
        setSessions(prev => [...prev, session]);
        setActiveId(result.id);
    }, [bridge]);

    useEffect(() => {
        if (!bridge) return;
        if (sessions.length === 0) void createSession();
    }, [bridge, sessions.length, createSession]);

    useEffect(() => {
        if (!bridge) return;
        const unsub1 = bridge.onData((_id, data) => {
            const el = termRef.current;
            if (!el) return;
            const pre = el.querySelector(`[data-term-id="${_id}"]`);
            if (pre) {
                pre.textContent += data;
                if ((pre.textContent?.length ?? 0) > OUTPUT_DOM_CAP) {
                    pre.textContent = pre.textContent!.slice(-OUTPUT_DOM_CAP);
                }
            }
        });
        const unsub2 = bridge.onExit((id, _code) => {
            setSessions(prev => prev.filter(s => s.id !== id));
            setActiveId(prev => prev === id ? null : prev);
        });
        cleanupRef.current = [unsub1, unsub2];
        return () => {
            cleanupRef.current.forEach(fn => fn());
            cleanupRef.current = [];
            sessions.forEach(s => { void bridge.kill(s.id); });
        };
    }, [bridge]);

    function handleInput(e: React.KeyboardEvent<HTMLDivElement>) {
        if (!bridge || !activeId) return;
        if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
            e.preventDefault();
            let data = e.key;
            if (e.key === 'Enter') data = '\r';
            else if (e.key === 'Backspace') data = '\x7f';
            else if (e.key === 'Tab') data = '\t';
            if (e.ctrlKey && e.key.length === 1) {
                data = String.fromCharCode(e.key.charCodeAt(0) - 96);
            }
            void bridge.write(activeId, data);
        }
    }

    if (!bridge) {
        return <div className="terminal-panel terminal-unavailable">Terminal requires Electron desktop app</div>;
    }

    return (
        <div className="terminal-panel">
            <div className="terminal-tab-bar">
                {sessions.map(s => (
                    <button key={s.id} type="button"
                        className={`terminal-tab ${s.id === activeId ? 'is-active' : ''}`}
                        onClick={() => setActiveId(s.id)}>
                        {s.shell.split('/').pop()}
                    </button>
                ))}
                <button type="button" className="terminal-tab terminal-new-tab" onClick={() => void createSession()}>+</button>
            </div>
            <div ref={termRef} className="terminal-output" tabIndex={0} onKeyDown={handleInput}>
                {sessions.map(s => (
                    <pre key={s.id} data-term-id={s.id}
                        className={`terminal-pre ${s.id === activeId ? '' : 'terminal-hidden'}`}
                    />
                ))}
            </div>
        </div>
    );
}
