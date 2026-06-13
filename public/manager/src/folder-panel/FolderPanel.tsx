import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import type { NotesTreeEntry } from '../notes/notes-types';
import { copyText } from '../clipboard/copy-text';
import { FOLDER_PANEL_DRAG_MIME, encodeFolderPanelDragPayload } from './folder-drag-payload';
import { createElectronFolderSource, createNotesVaultFolderSource, type FolderPanelEntry } from './folder-sources';
import './folder-panel.css';

function getFolderBridge(): FolderBridgeApi | null {
    return getDesktop()?.folder ?? null;
}

function parentPath(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx > 0 ? path.slice(0, idx) : '/';
}

function isDescendantPath(parent: string, child: string): boolean {
    return child === parent || child.startsWith(`${parent}/`);
}

function relativeFolderPath(root: string | null, path: string): string {
    if (!root) return path;
    const base = root.endsWith('/') ? root : `${root}/`;
    return path.startsWith(base) ? path.slice(base.length) : path;
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
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [draggedEntry, setDraggedEntry] = useState<FolderPanelEntry | null>(null);
    const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
    const [pendingMove, setPendingMove] = useState<{ source: FolderPanelEntry; target: FolderPanelEntry } | null>(null);
    const [isMoving, setIsMoving] = useState(false);
    const [skipInternalMoveConfirm, setSkipInternalMoveConfirm] = useState(false);
    const [skipMoveConfirmChecked, setSkipMoveConfirmChecked] = useState(false);
    const [actionStatus, setActionStatus] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ entry: FolderPanelEntry; x: number; y: number } | null>(null);

    const loadDir = useCallback(async (dirPath: string) => {
        try {
            const nextEntries = await source.listDir(dirPath);
            setEntries(nextEntries);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [source]);

    const loadChildren = useCallback(async (dirPath: string, options: { force?: boolean } = {}) => {
        if (!options.force && childrenCache.has(dirPath)) return;
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
            setSelectedPath(null);
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
        setSelectedPath(null);
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

    const allEntries = useMemo(() => {
        const flattened = [...entries];
        for (const children of childrenCache.values()) flattened.push(...children);
        return flattened;
    }, [childrenCache, entries]);
    const selectedEntry = allEntries.find(entry => entry.path === selectedPath) ?? null;
    const canUseNativeActions = source.kind === 'electron-folder';

    const refreshAfterMove = useCallback(async (sourcePath: string, targetPath: string) => {
        if (!rootPath) return;
        const sourceParent = parentPath(sourcePath);
        setChildrenCache(prev => {
            const next = new Map(prev);
            next.delete(sourceParent);
            next.delete(targetPath);
            return next;
        });
        await loadDir(rootPath);
        if (expanded.has(sourceParent)) await loadChildren(sourceParent, { force: true });
        if (expanded.has(targetPath)) await loadChildren(targetPath, { force: true });
    }, [expanded, loadChildren, loadDir, rootPath]);

    const executeMove = useCallback(async (move: { source: FolderPanelEntry; target: FolderPanelEntry }) => {
        if (!source.movePath) return;
        setIsMoving(true);
        try {
            const result = await source.movePath(move.source.path, move.target.path);
            const movedPath = result.moved?.to ?? move.source.path;
            setSelectedPath(movedPath);
            setActionStatus(`Moved ${move.source.name}`);
            setPendingMove(null);
            await refreshAfterMove(move.source.path, move.target.path);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsMoving(false);
        }
    }, [refreshAfterMove, source]);

    const requestMove = useCallback((sourceEntry: FolderPanelEntry, targetEntry: FolderPanelEntry) => {
        if (!source.movePath || sourceEntry.path === targetEntry.path) return;
        if (sourceEntry.kind === 'directory' && isDescendantPath(sourceEntry.path, targetEntry.path)) return;
        const move = { source: sourceEntry, target: targetEntry };
        if (skipInternalMoveConfirm) {
            void executeMove(move);
            return;
        }
        setSkipMoveConfirmChecked(false);
        setPendingMove(move);
    }, [executeMove, skipInternalMoveConfirm, source.movePath]);

    const selectAndActivateEntry = useCallback((entry: FolderPanelEntry, mode: 'primary' | 'preview-only' = 'primary') => {
        setSelectedPath(entry.path);
        setContextMenu(null);
        if (entry.kind === 'directory') {
            if (mode === 'primary') toggleExpand(entry.path);
            return;
        }
        props.onPreviewFile?.(entry.path);
    }, [props, toggleExpand]);

    const copyEntryPath = useCallback(async (entry: FolderPanelEntry, kind: 'absolute' | 'relative') => {
        const value = kind === 'relative' ? relativeFolderPath(rootPath, entry.path) : entry.path;
        const result = await copyText(value);
        if (result.ok) {
            setSelectedPath(entry.path);
            setActionStatus(kind === 'relative' ? 'Copied relative path' : 'Copied path');
            setError(null);
        } else {
            setError(result.error ?? 'Failed to copy path');
        }
    }, [rootPath]);

    const revealEntryPath = useCallback(async (entry: FolderPanelEntry) => {
        if (!source.revealPath) return;
        try {
            await source.revealPath(entry.path);
            setSelectedPath(entry.path);
            setActionStatus(entry.kind === 'directory' ? 'Opened folder in Finder' : 'Revealed file in Finder');
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [source]);

    const copySelectedPath = useCallback(async (kind: 'absolute' | 'relative') => {
        if (!selectedEntry) return;
        await copyEntryPath(selectedEntry, kind);
    }, [copyEntryPath, selectedEntry]);

    const revealSelectedPath = useCallback(async () => {
        if (!selectedEntry) return;
        await revealEntryPath(selectedEntry);
    }, [revealEntryPath, selectedEntry]);

    const handleEntryKeyDown = useCallback((event: React.KeyboardEvent, entry: FolderPanelEntry) => {
        const isPrimaryModifier = event.metaKey || event.ctrlKey;
        if (isPrimaryModifier && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            event.stopPropagation();
            void copyEntryPath(entry, event.shiftKey ? 'absolute' : 'relative');
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            selectAndActivateEntry(entry);
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            if (entry.kind !== 'file') return;
            selectAndActivateEntry(entry, 'preview-only');
        }
    }, [copyEntryPath, selectAndActivateEntry]);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setContextMenu(null);
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [contextMenu]);

    function renderEntries(items: FolderPanelEntry[], depth: number): React.ReactNode[] {
        return items.map(entry => (
            <div key={entry.path}>
                <div
                    className={[
                        'folder-entry',
                        `folder-entry-${entry.kind}`,
                        selectedPath === entry.path ? 'is-selected' : '',
                        dropTargetPath === entry.path ? 'is-drop-target' : '',
                        draggedEntry?.path === entry.path ? 'is-dragging' : '',
                    ].filter(Boolean).join(' ')}
                    role="treeitem"
                    aria-selected={entry.kind === 'file' && entry.path === props.selectedFilePath}
                    draggable={canUseNativeActions}
                    onDragStart={(event) => {
                        if (!canUseNativeActions) return;
                        setDraggedEntry(entry);
                        event.dataTransfer.effectAllowed = 'copyMove';
                        event.dataTransfer.setData(FOLDER_PANEL_DRAG_MIME, encodeFolderPanelDragPayload(entry));
                        event.dataTransfer.setData('text/plain', entry.path);
                    }}
                    onDragEnd={() => {
                        setDraggedEntry(null);
                        setDropTargetPath(null);
                    }}
                    onDragOver={(event) => {
                        if (!draggedEntry || entry.kind !== 'directory') return;
                        if (draggedEntry.path === entry.path) return;
                        if (draggedEntry.kind === 'directory' && isDescendantPath(draggedEntry.path, entry.path)) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDropTargetPath(entry.path);
                    }}
                    onDragLeave={() => {
                        if (dropTargetPath === entry.path) setDropTargetPath(null);
                    }}
                    onDrop={(event) => {
                        if (!draggedEntry || entry.kind !== 'directory') return;
                        event.preventDefault();
                        setDropTargetPath(null);
                        requestMove(draggedEntry, entry);
                    }}
                >
                    {depth > 0 && (
                        <span className="folder-indent" aria-hidden="true">
                            {Array.from({ length: depth }, (_, level) => (
                                <span key={level} className="folder-indent-guide" />
                            ))}
                        </span>
                    )}
                    <button type="button" className="folder-entry-btn"
                        onKeyDown={(event) => handleEntryKeyDown(event, entry)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setSelectedPath(entry.path);
                            setContextMenu({ entry, x: event.clientX, y: event.clientY });
                        }}
                        onClick={() => {
                            selectAndActivateEntry(entry);
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
            <div className="folder-action-row" aria-label="Folder actions">
                <button type="button" className="folder-action-btn" disabled={!selectedEntry} onClick={() => void copySelectedPath('absolute')}>Copy</button>
                <button type="button" className="folder-action-btn" disabled={!selectedEntry} onClick={() => void copySelectedPath('relative')}>Relative</button>
                <button type="button" className="folder-action-btn" disabled={!selectedEntry || !source.revealPath} onClick={() => void revealSelectedPath()}>Finder</button>
            </div>
            {error && <div className="folder-error">{error}</div>}
            {actionStatus && !error && <div className="folder-status">{actionStatus}</div>}
            <div className="folder-tree" role="tree">
                {renderEntries(entries, 0)}
                {entries.length === 0 && !error && rootPath !== null && (
                    <div className="folder-empty">{source.kind === 'notes-vault' ? 'No notes in vault' : 'Empty directory'}</div>
                )}
            </div>
            {pendingMove && (
                <div className="folder-move-confirm" role="dialog" aria-label="Confirm folder move">
                    <div className="folder-move-confirm__title">Move "{pendingMove.source.name}" into "{pendingMove.target.name}"?</div>
                    <label className="folder-move-confirm__option">
                        <input
                            type="checkbox"
                            checked={skipMoveConfirmChecked}
                            onChange={event => setSkipMoveConfirmChecked(event.target.checked)}
                        />
                        Don't ask again for internal moves this session
                    </label>
                    <div className="folder-move-confirm__actions">
                        <button type="button" className="folder-action-btn" disabled={isMoving} onClick={() => setPendingMove(null)}>Cancel</button>
                        <button
                            type="button"
                            className="folder-action-btn is-primary"
                            disabled={isMoving}
                            onClick={() => {
                                if (skipMoveConfirmChecked) setSkipInternalMoveConfirm(true);
                                void executeMove(pendingMove);
                            }}
                        >
                            {isMoving ? 'Moving...' : 'Move'}
                        </button>
                    </div>
                </div>
            )}
            {contextMenu && (
                <div
                    className="folder-context-menu"
                    role="menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onPointerDown={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                >
                    <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void copyEntryPath(contextMenu.entry, 'absolute'); }}>Copy Path</button>
                    <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void copyEntryPath(contextMenu.entry, 'relative'); }}>Copy Relative Path</button>
                    <button type="button" role="menuitem" disabled={!source.revealPath} onClick={() => { setContextMenu(null); void revealEntryPath(contextMenu.entry); }}>
                        {contextMenu.entry.kind === 'directory' ? 'Open Folder' : 'Reveal in Finder'}
                    </button>
                    {rootPath && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void loadDir(rootPath); }}>Refresh</button>}
                </div>
            )}
        </div>
    );
}
