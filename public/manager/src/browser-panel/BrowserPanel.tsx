import { useCallback, useRef, useState } from 'react';
import './browser-panel.css';

export function BrowserPanel() {
    const [url, setUrl] = useState('https://google.com');
    const [inputUrl, setInputUrl] = useState(url);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const navigate = useCallback(() => {
        let target = inputUrl.trim();
        if (!target) return;
        if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
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
            <iframe
                ref={iframeRef}
                className="browser-webview"
                src={url}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title="Embedded browser"
            />
        </div>
    );
}
