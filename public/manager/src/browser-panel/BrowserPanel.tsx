import { useCallback, useRef, useState } from 'react';
import { isElectron } from '../panels/desktop-bridge';
import './browser-panel.css';

export function BrowserPanel() {
    const [url, setUrl] = useState('https://google.com');
    const [inputUrl, setInputUrl] = useState(url);
    const webviewRef = useRef<HTMLWebViewElement | null>(null);

    const electronMode = isElectron();

    const navigate = useCallback(() => {
        let target = inputUrl.trim();
        if (!target) return;
        if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
        setUrl(target);
    }, [inputUrl]);

    if (!electronMode) {
        return <div className="browser-panel browser-unavailable">Browser requires Electron desktop app</div>;
    }

    return (
        <div className="browser-panel">
            <div className="browser-toolbar">
                <button type="button" className="browser-nav-btn" aria-label="Back"
                    onClick={() => (webviewRef.current as unknown as { goBack?: () => void })?.goBack?.()}>←</button>
                <button type="button" className="browser-nav-btn" aria-label="Forward"
                    onClick={() => (webviewRef.current as unknown as { goForward?: () => void })?.goForward?.()}>→</button>
                <button type="button" className="browser-nav-btn" aria-label="Reload"
                    onClick={() => (webviewRef.current as unknown as { reload?: () => void })?.reload?.()}>↻</button>
                <input className="browser-url-input" type="text" value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(); }}
                    aria-label="URL" />
            </div>
            <webview
                ref={webviewRef as React.Ref<HTMLWebViewElement>}
                className="browser-webview"
                src={url}
                partition="persist:browser-panel"
            />
        </div>
    );
}
