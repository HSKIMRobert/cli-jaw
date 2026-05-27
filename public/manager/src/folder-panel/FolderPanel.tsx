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
    const [childrenCache, setChildrenCache] = useState<Map<string, FolderEntry[]>>(new Map());
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

    const loadChildren = useCallback(async (dirPath: string) => {
        if (!bridge || childrenCache.has(dirPath)) return;
        const result = await bridge.listDir(dirPath);
        if (result.ok && result.entries) {
            setChildrenCache(prev => new Map(prev).set(dirPath, result.entries!));
        }
    }, [bridge, childrenCache]);

    const toggleExpand = useCallback((entryPath: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(entryPath)) {
                next.delete(entryPath);
            } else {
                next.add(entryPath);
                void loadChildren(entryPath);
            }
            return next;
        });
    }, [loadChildren]);

    const pickFolder = useCallback(async () => {
        if (!bridge) return;
        const result = await bridge.pickFolder();
        if (result.ok && result.path) {
            if (rootPath) void bridge.unwatchDir(rootPath);
            setRootPath(result.path);
            setExpanded(new Set());
            setChildrenCache(new Map());
            await loadDir(result.path);
        }
    }, [bridge, loadDir, rootPath]);

    useEffect(() => {
        if (!bridge || !rootPath) return;
        void bridge.watchDir(rootPath);
        const unsub = bridge.onDirChange(() => {
            void loadDir(rootPath);
        });
        return () => {
            unsub();
            void bridge.unwatchDir(rootPath);
        };
    }, [bridge, rootPath, loadDir]);

    function renderEntries(items: FolderEntry[], depth: number): React.ReactNode[] {
        return items.map(entry => (
            <div key={entry.path}>
                <div
                    className={`folder-entry folder-entry-${entry.kind}`}
                    role="treeitem"
                    style={{ paddingLeft: `${8 + depth * 16}px` }}
                >
                    <button type="button" className="folder-entry-btn"
                        onClick={() => {
                            if (entry.kind === 'directory') toggleExpand(entry.path);
                        }}>
                        <span className="folder-entry-icon">
                            {entry.kind === 'directory' ? (expanded.has(entry.path) ? '▾' : '▸') : '·'}
                        </span>
                        <span className="folder-entry-name">{entry.name}</span>
                    </button>
                </div>
                {entry.kind === 'directory' && expanded.has(entry.path) && childrenCache.has(entry.path) &&
                    renderEntries(childrenCache.get(entry.path)!, depth + 1)}
            </div>
        ));
    }

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
                {renderEntries(entries, 0)}
                {entries.length === 0 && !error && rootPath && (
                    <div className="folder-empty">Empty directory</div>
                )}
            </div>
        </div>
    );
}
