import { useCallback, useRef, useState } from 'react';
import './browser-panel.css';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function isSafeUrl(target: string): boolean {
    try {
        const parsed = new URL(target);
        if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
        if (parsed.hostname.endsWith('.local')) return false;
        if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) return false;
        if (parsed.origin === window.location.origin) return false;
        return true;
    } catch {
        return false;
    }
}

export function BrowserPanel() {
    const [url, setUrl] = useState('https://google.com');
    const [inputUrl, setInputUrl] = useState(url);
    const [blocked, setBlocked] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const navigate = useCallback(() => {
        let target = inputUrl.trim();
        if (!target) return;
        if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
        if (!isSafeUrl(target)) {
            setBlocked(true);
            return;
        }
        setBlocked(false);
        setUrl(target);
    }, [inputUrl]);

    return (
        <div className="browser-panel">
            <div className="browser-toolbar">
                <button type="button" className="browser-nav-btn" aria-label="Reload"
                    onClick={() => {
                        if (iframeRef.current) iframeRef.current.src = url;
                    }}>↻</button>
                <input className="browser-url-input" type="text" value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(); }}
                    aria-label="URL" />
            </div>
            {blocked && <div className="browser-blocked">Local/same-origin URLs are blocked for security</div>}
            <iframe
                ref={iframeRef}
                className="browser-webview"
                src={url}
                sandbox="allow-scripts allow-forms allow-popups"
                title="Embedded browser"
            />
        </div>
    );
}
