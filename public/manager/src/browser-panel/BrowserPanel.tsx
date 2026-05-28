import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { getDesktop, isElectron } from '../panels/desktop-bridge';
import './browser-panel.css';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const DEFAULT_BROWSER_URL = 'https://example.com';

type ElectronWebviewElement = HTMLElement & {
    src: string;
    reload: () => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    goBack: () => void;
    goForward: () => void;
    getURL?: () => string;
};

type BrowserOpenPayload = {
    url: string;
    disposition: 'current-tab' | 'new-tab';
};

type ElectronWebviewEvent = Event & {
    url?: string;
    title?: string;
    errorCode?: number;
    errorDescription?: string;
    isMainFrame?: boolean;
    details?: {
        reason?: string;
    };
};

type BrowserTabState = {
    id: string;
    url: string;
    inputUrl: string;
    title: string;
    blocked: boolean;
    loading: boolean;
    error: string | null;
    canGoBack: boolean;
    canGoForward: boolean;
};

function isPrivateHost(hostname: string): boolean {
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
}

function bareHostname(target: string): string {
    const authority = target.split(/[/?#]/, 1)[0] ?? '';
    if (authority.startsWith('[')) {
        const end = authority.indexOf(']');
        return end > 0 ? authority.slice(1, end).toLowerCase() : authority.toLowerCase();
    }
    return authority.split(':', 1)[0]?.toLowerCase() ?? '';
}

function shouldDefaultToHttp(target: string): boolean {
    const authority = target.split(/[/?#]/, 1)[0] ?? '';
    const host = bareHostname(target);
    if (!host) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.local') || isPrivateHost(host)) return true;
    return /:\d+$/.test(authority);
}

function normalizeUrl(target: string): string | null {
    const trimmed = target.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `${shouldDefaultToHttp(trimmed) ? 'http' : 'https'}://${trimmed}`;
}

function isRestrictedBrowserHost(hostname: string): boolean {
    return BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.local') || isPrivateHost(hostname);
}

function isUrlAllowed(target: string, desktop: boolean): boolean {
    try {
        const parsed = new URL(target);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        if (desktop) return true;
        if (isRestrictedBrowserHost(parsed.hostname)) return false;
        if (parsed.origin === window.location.origin) return false;
        return true;
    } catch {
        return false;
    }
}

function titleFromUrl(target: string): string {
    try {
        const parsed = new URL(target);
        return parsed.hostname.replace(/^www\./, '') || 'Browser';
    } catch {
        return 'Browser';
    }
}

function createBrowserTab(id: string, target = DEFAULT_BROWSER_URL): BrowserTabState {
    return {
        id,
        url: target,
        inputUrl: target,
        title: titleFromUrl(target),
        blocked: false,
        loading: false,
        error: null,
        canGoBack: false,
        canGoForward: false,
    };
}

export function BrowserPanel() {
    const desktop = isElectron();
    const initialTab = useRef<BrowserTabState>(createBrowserTab('browser-tab-1'));
    const nextTabIndex = useRef(2);
    const [tabs, setTabs] = useState<BrowserTabState[]>(() => [initialTab.current]);
    const [activeTabId, setActiveTabId] = useState(initialTab.current.id);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const editingTabIdRef = useRef<string | null>(null);
    const webviewRefs = useRef<Map<string, ElectronWebviewElement>>(new Map());
    const webviewCleanupRefs = useRef<Map<string, () => void>>(new Map());

    const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? initialTab.current;

    const updateTab = useCallback((id: string, patch: Partial<BrowserTabState>) => {
        setTabs(current => current.map(tab => tab.id === id ? { ...tab, ...patch } : tab));
    }, []);

    const refreshNavState = useCallback((tabId: string) => {
        const webview = webviewRefs.current.get(tabId);
        if (!webview) return;
        try {
            const patch: Partial<BrowserTabState> = {
                canGoBack: webview.canGoBack(),
                canGoForward: webview.canGoForward(),
            };
            const current = webview.getURL?.();
            if (current && isUrlAllowed(current, desktop)) {
                patch.url = current;
                patch.title = titleFromUrl(current);
                if (editingTabIdRef.current !== tabId) {
                    patch.inputUrl = current;
                }
            }
            updateTab(tabId, patch);
        } catch {
            // webview may not be ready yet
        }
    }, [desktop, updateTab]);

    const attachWebviewEvents = useCallback((tabId: string, webview: ElectronWebviewElement) => {
        if (!desktop) return () => {};
        const handleStart = () => {
            updateTab(tabId, { loading: true, error: null });
        };
        const handleStop = () => {
            updateTab(tabId, { loading: false });
            refreshNavState(tabId);
        };
        const handleNavigate = (event: Event) => {
            const nextUrl = (event as ElectronWebviewEvent).url;
            if (nextUrl && isUrlAllowed(nextUrl, desktop)) {
                const patch: Partial<BrowserTabState> = {
                    url: nextUrl,
                    title: titleFromUrl(nextUrl),
                };
                if (editingTabIdRef.current !== tabId) {
                    patch.inputUrl = nextUrl;
                }
                updateTab(tabId, patch);
            }
            refreshNavState(tabId);
        };
        const handleTitle = (event: Event) => {
            const nextTitle = (event as ElectronWebviewEvent).title?.trim();
            if (nextTitle) updateTab(tabId, { title: nextTitle });
        };
        const handleFail = (event: Event) => {
            const failure = event as ElectronWebviewEvent;
            if (failure.isMainFrame === false) return;
            updateTab(tabId, {
                loading: false,
                error: failure.errorDescription ?? `Navigation failed (${failure.errorCode ?? 'unknown'})`,
            });
            refreshNavState(tabId);
        };
        const handleRenderGone = (event: Event) => {
            const reason = (event as ElectronWebviewEvent).details?.reason ?? 'gone';
            updateTab(tabId, {
                loading: false,
                error: `Browser tab process ${reason}. Reload this tab or open a new tab.`,
            });
        };
        const handleDomReady = () => refreshNavState(tabId);
        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-navigate', handleNavigate);
        webview.addEventListener('did-navigate-in-page', handleNavigate);
        webview.addEventListener('page-title-updated', handleTitle);
        webview.addEventListener('did-fail-load', handleFail);
        webview.addEventListener('render-process-gone', handleRenderGone);
        webview.addEventListener('dom-ready', handleDomReady);
        return () => {
            webview.removeEventListener('did-start-loading', handleStart);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-navigate', handleNavigate);
            webview.removeEventListener('did-navigate-in-page', handleNavigate);
            webview.removeEventListener('page-title-updated', handleTitle);
            webview.removeEventListener('did-fail-load', handleFail);
            webview.removeEventListener('render-process-gone', handleRenderGone);
            webview.removeEventListener('dom-ready', handleDomReady);
        };
    }, [desktop, refreshNavState, updateTab]);

    const setWebviewRef = useCallback((id: string, node: Element | null) => {
        webviewCleanupRefs.current.get(id)?.();
        webviewCleanupRefs.current.delete(id);
        if (!node) {
            webviewRefs.current.delete(id);
            return;
        }
        const webview = node as ElectronWebviewElement;
        webviewRefs.current.set(id, webview);
        webviewCleanupRefs.current.set(id, attachWebviewEvents(id, webview));
        refreshNavState(id);
    }, [attachWebviewEvents, refreshNavState]);

    useEffect(() => () => {
        for (const cleanup of webviewCleanupRefs.current.values()) cleanup();
        webviewCleanupRefs.current.clear();
        webviewRefs.current.clear();
    }, []);

    const blockedUrlMessage = useCallback(() => (
        desktop ? 'Only http and https URLs are supported.' : 'Local, private, and same-origin URLs are blocked.'
    ), [desktop]);

    const openUrlInTab = useCallback((tabId: string, rawTarget: string) => {
        const target = normalizeUrl(rawTarget);
        if (!target) return;
        if (!isUrlAllowed(target, desktop)) {
            updateTab(tabId, {
                blocked: true,
                inputUrl: rawTarget,
                error: blockedUrlMessage(),
            });
            return;
        }
        updateTab(tabId, {
            blocked: false,
            error: null,
            inputUrl: target,
            url: target,
            title: titleFromUrl(target),
        });
    }, [blockedUrlMessage, desktop, updateTab]);

    const addTab = useCallback((rawTarget = DEFAULT_BROWSER_URL) => {
        const target = normalizeUrl(rawTarget) ?? DEFAULT_BROWSER_URL;
        const allowed = isUrlAllowed(target, desktop);
        const tab = createBrowserTab(`browser-tab-${nextTabIndex.current++}`, allowed ? target : DEFAULT_BROWSER_URL);
        if (!allowed) {
            tab.blocked = true;
            tab.inputUrl = rawTarget;
            tab.error = blockedUrlMessage();
        }
        setTabs(current => [...current, tab]);
        setActiveTabId(tab.id);
    }, [blockedUrlMessage, desktop]);

    const closeTab = useCallback((id: string) => {
        setTabs(current => {
            if (current.length <= 1) {
                const replacement = createBrowserTab(`browser-tab-${nextTabIndex.current++}`);
                setActiveTabId(replacement.id);
                return [replacement];
            }
            const index = current.findIndex(tab => tab.id === id);
            const next = current.filter(tab => tab.id !== id);
            if (id === activeTabId) {
                const fallback = next[Math.max(0, index - 1)] ?? next[0];
                setActiveTabId(fallback.id);
            }
            return next;
        });
    }, [activeTabId]);

    const navigate = useCallback(() => {
        const rawTarget = inputRef.current?.value ?? activeTab.inputUrl;
        editingTabIdRef.current = null;
        openUrlInTab(activeTab.id, rawTarget);
    }, [activeTab.id, activeTab.inputUrl, openUrlInTab]);

    const markUrlEditing = useCallback(() => {
        editingTabIdRef.current = activeTab.id;
    }, [activeTab.id]);

    const clearUrlEditingSoon = useCallback(() => {
        window.setTimeout(() => {
            if (document.activeElement !== inputRef.current && editingTabIdRef.current === activeTab.id) {
                editingTabIdRef.current = null;
                refreshNavState(activeTab.id);
            }
        }, 0);
    }, [activeTab.id, refreshNavState]);

    useEffect(() => {
        return getDesktop()?.browser?.onOpenUrl?.((payload: BrowserOpenPayload) => {
            if (payload.disposition === 'current-tab') {
                openUrlInTab(activeTabId, payload.url);
            } else {
                addTab(payload.url);
            }
        });
    }, [activeTabId, addTab, openUrlInTab]);

    if (!desktop) {
        return (
            <div className="browser-panel browser-unavailable">
                Browser preview requires the Electron desktop app.
            </div>
        );
    }

    return (
        <div className="browser-panel">
            <div className="browser-tab-strip" aria-label="Browser tabs">
                {tabs.map(tab => (
                    <div key={tab.id} className={`browser-tab-item${tab.id === activeTab.id ? ' is-active' : ''}`}>
                        <button
                            type="button"
                            className="browser-tab"
                            aria-label={`Switch to ${tab.title}`}
                            aria-pressed={tab.id === activeTab.id}
                            onClick={() => setActiveTabId(tab.id)}
                            title={tab.title}
                        >
                            <span className="browser-tab-title">{tab.loading ? 'Loading...' : tab.title}</span>
                        </button>
                        <button
                            type="button"
                            className="browser-tab-close"
                            aria-label={`Close ${tab.title}`}
                            title="Close tab"
                            onClick={() => closeTab(tab.id)}
                        >
                            ×
                        </button>
                    </div>
                ))}
                <button type="button" className="browser-tab-add" aria-label="New browser tab" title="New tab" onClick={() => addTab()}>+</button>
            </div>
            <div className="browser-toolbar">
                <button type="button" className="browser-nav-btn" aria-label="Back" disabled={!activeTab.canGoBack} onClick={() => webviewRefs.current.get(activeTab.id)?.goBack()}>‹</button>
                <button type="button" className="browser-nav-btn" aria-label="Forward" disabled={!activeTab.canGoForward} onClick={() => webviewRefs.current.get(activeTab.id)?.goForward()}>›</button>
                <button type="button" className="browser-nav-btn" aria-label="Reload" onClick={() => webviewRefs.current.get(activeTab.id)?.reload()}>↻</button>
                <input
                    ref={inputRef}
                    className="browser-url-input"
                    type="text"
                    value={activeTab.inputUrl}
                    onFocus={markUrlEditing}
                    onBlur={clearUrlEditingSoon}
                    onChange={event => {
                        editingTabIdRef.current = activeTab.id;
                        updateTab(activeTab.id, { inputUrl: event.target.value });
                    }}
                    onKeyDown={event => { if (event.key === 'Enter') navigate(); }}
                    aria-label="URL"
                />
                <button type="button" className="browser-go-btn" onClick={navigate}>Go</button>
            </div>
            {(activeTab.blocked || activeTab.error || activeTab.loading) && (
                <div className={`browser-status${activeTab.error ? ' is-error' : ''}`}>
                    {activeTab.error ?? (activeTab.loading ? 'Loading...' : 'Blocked')}
                </div>
            )}
            <div className="browser-webview-stack">
                {tabs.map(tab => (
                    <div key={tab.id} className={`browser-webview-host${tab.id === activeTab.id ? ' is-active' : ''}`} aria-hidden={tab.id !== activeTab.id}>
                        {createElement('webview', {
                            ref: (node: Element | null) => setWebviewRef(tab.id, node),
                            className: 'browser-webview',
                            src: tab.url,
                            partition: 'persist:cli-jaw-browser',
                            allowpopups: true,
                            webpreferences: 'contextIsolation=yes,sandbox=yes,nodeIntegration=no',
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
