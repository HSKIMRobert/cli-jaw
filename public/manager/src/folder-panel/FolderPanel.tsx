import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import type { NotesTreeEntry } from '../notes/notes-types';
import { createElectronFolderSource, createNotesVaultFolderSource, type FolderPanelEntry } from './folder-sources';
import './folder-panel.css';

function getFolderBridge(): FolderBridgeApi | null {
    return getDesktop()?.folder ?? null;
}

type FolderPanelProps = {
    selectedFilePath?: string | null | undefined;
    externalRootPath?: string | null | undefined;
    notesTree?: NotesTreeEntry[] | undefined;
    notesRoot?: string | null | undefined;
    onPreviewFile?: ((path: string) => void) | undefined;
};

export function FolderPanel(props: FolderPanelProps) {
    const bridge = getFolderBridge();
    const source = useMemo(
        () => bridge ? createElectronFolderSource(bridge) : createNotesVaultFolderSource(props.notesTree ?? [], props.notesRoot ?? null),
        [bridge, props.notesRoot, props.notesTree],
    );
    const [rootPath, setRootPath] = useState<string | null>(null);
    const [entries, setEntries] = useState<FolderPanelEntry[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [childrenCache, setChildrenCache] = useState<Map<string, FolderPanelEntry[]>>(new Map());
    const [error, setError] = useState<string | null>(null);

    const loadDir = useCallback(async (dirPath: string) => {
        try {
            const nextEntries = await source.listDir(dirPath);
            setEntries(nextEntries);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [source]);

    const loadChildren = useCallback(async (dirPath: string) => {
        if (childrenCache.has(dirPath)) return;
        try {
            const nextEntries = await source.listDir(dirPath);
            setChildrenCache(prev => new Map(prev).set(dirPath, nextEntries));
        } catch (err) {
            setError((err as Error).message);
        }
    }, [childrenCache, source]);

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
        if (!source.pickRoot) return;
        const picked = await source.pickRoot();
        if (picked) {
            if (rootPath && source.unwatchDir) void source.unwatchDir(rootPath);
            setRootPath(picked);
            setExpanded(new Set());
            setChildrenCache(new Map());
            await loadDir(picked);
        }
    }, [loadDir, rootPath, source]);

    useEffect(() => {
        if (rootPath !== null || props.externalRootPath) return;
        let cancelled = false;
        void (async () => {
            const nextRoot = await source.getDefaultRoot();
            if (cancelled) return;
            setRootPath(nextRoot);
            await loadDir(nextRoot);
        })();
        return () => { cancelled = true; };
    }, [loadDir, props.externalRootPath, rootPath, source]);

    useEffect(() => {
        const externalRoot = props.externalRootPath;
        if (!externalRoot || externalRoot === rootPath) return;
        if (rootPath && source.unwatchDir) void source.unwatchDir(rootPath);
        setRootPath(externalRoot);
        setExpanded(new Set());
        setChildrenCache(new Map());
        void loadDir(externalRoot);
    }, [loadDir, props.externalRootPath, rootPath, source]);

    useEffect(() => {
        if (!source.watchDir || !source.onDirChange || rootPath === null) return;
        void source.watchDir(rootPath);
        const unsub = source.onDirChange(() => {
            void loadDir(rootPath);
        });
        return () => {
            unsub();
            void source.unwatchDir?.(rootPath);
        };
    }, [source, rootPath, loadDir]);

    function renderEntries(items: FolderPanelEntry[], depth: number): React.ReactNode[] {
        return items.map(entry => (
            <div key={entry.path}>
                <div
                    className={`folder-entry folder-entry-${entry.kind}`}
                    role="treeitem"
                    aria-selected={entry.kind === 'file' && entry.path === props.selectedFilePath}
                >
                    {depth > 0 && (
                        <span className="folder-indent" aria-hidden="true">
                            {Array.from({ length: depth }, (_, level) => (
                                <span key={level} className="folder-indent-guide" />
                            ))}
                        </span>
                    )}
                    <button type="button" className="folder-entry-btn"
                        onClick={() => {
                            if (entry.kind === 'directory') toggleExpand(entry.path);
                            else props.onPreviewFile?.(entry.path);
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

    return (
        <div className="folder-panel">
            <div className="folder-toolbar">
                <button type="button" className="folder-pick-btn" onClick={() => void pickFolder()} disabled={!source.canPickRoot}>
                    {source.canPickRoot ? (rootPath ? rootPath.split('/').pop() : 'Pick folder...') : source.label}
                </button>
                {rootPath !== null && (
                    <button type="button" className="folder-refresh" onClick={() => void loadDir(rootPath)}>↻</button>
                )}
            </div>
            {error && <div className="folder-error">{error}</div>}
            <div className="folder-tree" role="tree">
                {renderEntries(entries, 0)}
                {entries.length === 0 && !error && rootPath !== null && (
                    <div className="folder-empty">{source.kind === 'notes-vault' ? 'No notes in vault' : 'Empty directory'}</div>
                )}
            </div>
        </div>
    );
}
