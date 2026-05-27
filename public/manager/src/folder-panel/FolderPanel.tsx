import { useCallback, useEffect, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import './folder-panel.css';

type FolderEntry = {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    size: number;
};

function getFolderBridge(): FolderBridgeApi | null {
    return getDesktop()?.folder ?? null;
}

export function FolderPanel() {
    const bridge = getFolderBridge();
    const [rootPath, setRootPath] = useState<string | null>(null);
    const [entries, setEntries] = useState<FolderEntry[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const loadDir = useCallback(async (dirPath: string) => {
        if (!bridge) return;
        const result = await bridge.listDir(dirPath);
        if (result.ok && result.entries) {
            setEntries(result.entries);
            setError(null);
        } else {
            setError(result.error ?? 'Failed to list directory');
        }
    }, [bridge]);

    const pickFolder = useCallback(async () => {
        if (!bridge) return;
        const result = await bridge.pickFolder();
        if (result.ok && result.path) {
            setRootPath(result.path);
            await loadDir(result.path);
            void bridge.watchDir(result.path);
        }
    }, [bridge, loadDir]);

    useEffect(() => {
        if (!bridge || !rootPath) return;
        const unsub = bridge.onDirChange((_dirPath) => {
            void loadDir(rootPath);
        });
        return unsub;
    }, [bridge, rootPath, loadDir]);

    if (!bridge) {
        return <div className="folder-panel folder-unavailable">Folder view requires Electron desktop app</div>;
    }

    return (
        <div className="folder-panel">
            <div className="folder-toolbar">
                <button type="button" className="folder-pick-btn" onClick={() => void pickFolder()}>
                    {rootPath ? rootPath.split('/').pop() : 'Pick folder...'}
                </button>
                {rootPath && (
                    <button type="button" className="folder-refresh" onClick={() => void loadDir(rootPath)}>↻</button>
                )}
            </div>
            {error && <div className="folder-error">{error}</div>}
            <div className="folder-tree" role="tree">
                {entries.map(entry => (
                    <div key={entry.path} className={`folder-entry folder-entry-${entry.kind}`} role="treeitem">
                        <button type="button" className="folder-entry-btn"
                            onClick={() => {
                                if (entry.kind === 'directory') {
                                    setExpanded(prev => {
                                        const next = new Set(prev);
                                        if (next.has(entry.path)) next.delete(entry.path);
                                        else next.add(entry.path);
                                        return next;
                                    });
                                }
                            }}>
                            <span className="folder-entry-icon">{entry.kind === 'directory' ? (expanded.has(entry.path) ? '▾' : '▸') : '·'}</span>
                            <span className="folder-entry-name">{entry.name}</span>
                        </button>
                    </div>
                ))}
                {entries.length === 0 && !error && rootPath && (
                    <div className="folder-empty">Empty directory</div>
                )}
            </div>
        </div>
    );
}
