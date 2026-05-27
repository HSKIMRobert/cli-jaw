import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { isElectron } from '../panels/desktop-bridge';
import './browser-panel.css';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

type ElectronWebviewElement = HTMLElement & {
    src: string;
    reload: () => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    goBack: () => void;
    goForward: () => void;
    getURL?: () => string;
};

type ElectronWebviewEvent = Event & {
    url?: string;
    errorCode?: number;
    errorDescription?: string;
    isMainFrame?: boolean;
};

function isPrivateHost(hostname: string): boolean {
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
}

function normalizeUrl(target: string): string | null {
    const trimmed = target.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isSafeUrl(target: string): boolean {
    try {
        const parsed = new URL(target);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
        if (parsed.hostname.endsWith('.local')) return false;
        if (isPrivateHost(parsed.hostname)) return false;
        if (parsed.origin === window.location.origin) return false;
        return true;
    } catch {
        return false;
    }
}

export function BrowserPanel() {
    const desktop = isElectron();
    const [url, setUrl] = useState('https://example.com');
    const [inputUrl, setInputUrl] = useState(url);
    const [blocked, setBlocked] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const webviewRef = useRef<ElectronWebviewElement | null>(null);

    const refreshNavState = useCallback(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        try {
            setCanGoBack(webview.canGoBack());
            setCanGoForward(webview.canGoForward());
            const current = webview.getURL?.();
            if (current && isSafeUrl(current)) {
                setUrl(current);
                setInputUrl(current);
            }
        } catch {
            // webview may not be ready yet
        }
    }, []);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!desktop || !webview) return;
        const handleStart = () => {
            setLoading(true);
            setError(null);
        };
        const handleStop = () => {
            setLoading(false);
            refreshNavState();
        };
        const handleNavigate = (event: Event) => {
            const nextUrl = (event as ElectronWebviewEvent).url;
            if (nextUrl && isSafeUrl(nextUrl)) {
                setUrl(nextUrl);
                setInputUrl(nextUrl);
            }
            refreshNavState();
        };
        const handleFail = (event: Event) => {
            const failure = event as ElectronWebviewEvent;
            if (failure.isMainFrame === false) return;
            setLoading(false);
            setError(failure.errorDescription ?? `Navigation failed (${failure.errorCode ?? 'unknown'})`);
            refreshNavState();
        };
        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-navigate', handleNavigate);
        webview.addEventListener('did-navigate-in-page', handleNavigate);
        webview.addEventListener('did-fail-load', handleFail);
        webview.addEventListener('dom-ready', refreshNavState);
        return () => {
            webview.removeEventListener('did-start-loading', handleStart);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-navigate', handleNavigate);
            webview.removeEventListener('did-navigate-in-page', handleNavigate);
            webview.removeEventListener('did-fail-load', handleFail);
            webview.removeEventListener('dom-ready', refreshNavState);
        };
    }, [desktop, refreshNavState, url]);

    const navigate = useCallback(() => {
        const target = normalizeUrl(inputUrl);
        if (!target) return;
        if (!isSafeUrl(target)) {
            setBlocked(true);
            setError('Local, private, and same-origin URLs are blocked.');
            return;
        }
        setBlocked(false);
        setError(null);
        setUrl(target);
    }, [inputUrl]);

    if (!desktop) {
        return (
            <div className="browser-panel browser-unavailable">
                Browser preview requires the Electron desktop app.
            </div>
        );
    }

    return (
        <div className="browser-panel">
            <div className="browser-toolbar">
                <button type="button" className="browser-nav-btn" aria-label="Back" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()}>‹</button>
                <button type="button" className="browser-nav-btn" aria-label="Forward" disabled={!canGoForward} onClick={() => webviewRef.current?.goForward()}>›</button>
                <button type="button" className="browser-nav-btn" aria-label="Reload" onClick={() => webviewRef.current?.reload()}>↻</button>
                <input
                    className="browser-url-input"
                    type="text"
                    value={inputUrl}
                    onChange={event => setInputUrl(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') navigate(); }}
                    aria-label="URL"
                />
                <button type="button" className="browser-go-btn" onClick={navigate}>Go</button>
            </div>
            {(blocked || error || loading) && (
                <div className={`browser-status${error ? ' is-error' : ''}`}>
                    {error ?? (loading ? 'Loading...' : 'Blocked')}
                </div>
            )}
            {createElement('webview', {
                ref: webviewRef,
                className: 'browser-webview',
                src: url,
                partition: 'persist:cli-jaw-browser',
                webpreferences: 'contextIsolation=yes,sandbox=yes,nodeIntegration=no',
            })}
        </div>
    );
}
