import { useEffect, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import './doc-panel.css';

function getFileBridge(): Pick<FolderBridgeApi, 'readFile'> | null {
    return getDesktop()?.folder ?? null;
}

export function DocPanel(props: { filePath?: string | undefined }) {
    const bridge = getFileBridge();
    const [content, setContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [binary, setBinary] = useState(false);

    useEffect(() => {
        if (!bridge || !props.filePath) {
            setContent('');
            setError(null);
            return;
        }
        void (async () => {
            const result = await bridge.readFile(props.filePath!);
            if (result.ok && result.content !== undefined) {
                if (result.binary) {
                    setBinary(true);
                    setContent('');
                } else {
                    setBinary(false);
                    setContent(result.content);
                }
                setError(null);
            } else {
                setError(result.error ?? 'Failed to read file');
            }
        })();
    }, [bridge, props.filePath]);

    if (!bridge) {
        return <div className="doc-panel doc-unavailable">Document view requires Electron desktop app</div>;
    }

    if (!props.filePath) {
        return <div className="doc-panel doc-empty">Open Folders and select a file to preview it here.</div>;
    }

    if (error) {
        return <div className="doc-panel doc-error">{error}</div>;
    }

    if (binary) {
        return <div className="doc-panel doc-binary">Binary file — cannot preview</div>;
    }

    return (
        <div className="doc-panel">
            <div className="doc-toolbar">
                <span className="doc-file-name">{props.filePath.split('/').pop()}</span>
            </div>
            <div className="doc-content">
                <pre className="doc-pre"><code>{content}</code></pre>
            </div>
        </div>
    );
}
