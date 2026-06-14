import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import type { NotesTreeEntry } from '../notes/notes-types';
import { copyText } from '../clipboard/copy-text';
import { createElectronFolderSource, createNotesVaultFolderSource, type FolderPanelEntry } from './folder-sources';
import { FolderPanelToolbar } from './FolderPanelToolbar';
import { FolderWorktreeOpsDialog } from './FolderWorktreeOpsDialog';
import { FolderTreeRows } from './FolderTreeRows';
import { dropCachedBranches, isDescendantPath, parentPath, relativeFolderPath } from './folder-panel-state';
import { runWorktreeOperation as runWorktreeOperationClient } from './folder-worktree-ops-client';
import type { GitWorktreeOperation } from './folder-worktree-types';
import { useFolderGitStatus } from './use-folder-git-status';
import { useGitWorktrees } from './use-git-worktrees';
import './folder-panel.css';

function getFolderBridge(): FolderBridgeApi | null {
    return getDesktop()?.folder ?? null;
}

type FolderPanelProps = {
    selectedFilePath?: string | null | undefined;
    externalRootPath?: string | null | undefined;
    notesTree?: NotesTreeEntry[] | undefined;
    notesRoot?: string | null | undefined;
    onRootChange?: ((path: string | null) => void) | undefined;
    onPreviewFile?: ((path: string) => void) | undefined;
};

export function FolderPanel(props: FolderPanelProps) {
    const bridge = getFolderBridge();
    const initialRootResolvedRef = useRef(false);
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
    const [gitRefreshToken, setGitRefreshToken] = useState(0);
    const [worktreeOpsOpen, setWorktreeOpsOpen] = useState(false);
    const [worktreeOperationBusy, setWorktreeOperationBusy] = useState(false);

    const loadDir = useCallback(async (dirPath: string) => {
        try {
            const nextEntries = await source.listDir(dirPath);
            setEntries(nextEntries);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [source]);

    const openFolderRoot = useCallback(async (
        nextRoot: string,
        options: { registerGitWorktree?: boolean; repoRoot?: string | null } = {},
    ) => {
        try {
            if (options.registerGitWorktree) {
                if (!rootPath) throw new Error('Current folder root required');
                await source.registerGitWorktreeRoot?.(rootPath, options.repoRoot ?? undefined, nextRoot);
            }
            if (rootPath && source.unwatchDir) void source.unwatchDir(rootPath);
            props.onRootChange?.(nextRoot);
            setRootPath(nextRoot);
            setExpanded(new Set());
            setChildrenCache(new Map());
            setSelectedPath(null);
            setError(null);
            await loadDir(nextRoot);
            setGitRefreshToken(token => token + 1);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [loadDir, props, rootPath, source]);

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
        try {
            const picked = await source.pickRoot();
            if (picked) await openFolderRoot(picked);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [openFolderRoot, source]);

    useEffect(() => {
        if (initialRootResolvedRef.current || rootPath !== null || props.externalRootPath) return;
        let cancelled = false;
        void (async () => {
            const nextRoot = await source.getInitialRoot();
            if (cancelled) return;
            initialRootResolvedRef.current = true;
            setRootPath(nextRoot);
            if (nextRoot !== null) await loadDir(nextRoot);
        })();
        return () => { cancelled = true; };
    }, [loadDir, props.externalRootPath, rootPath, source]);

    useEffect(() => {
        const externalRoot = props.externalRootPath;
        if (!externalRoot || externalRoot === rootPath) return;
        void openFolderRoot(externalRoot);
    }, [openFolderRoot, props.externalRootPath, rootPath]);

    useEffect(() => {
        if (!source.watchDir || !source.onDirChange || rootPath === null) return;
        void source.watchDir(rootPath);
        const unsub = source.onDirChange(() => {
            void loadDir(rootPath);
            setGitRefreshToken(token => token + 1);
        });
        return () => {
            unsub();
            void source.unwatchDir?.(rootPath);
        };
    }, [source, rootPath, loadDir]);

    const gitStatus = useFolderGitStatus({
        rootPath,
        enabled: source.kind === 'electron-folder',
        refreshToken: gitRefreshToken,
    });
    const worktreeState = useGitWorktrees({
        folderPanelRoot: rootPath,
        repoRoot: gitStatus.repoRoot,
        enabled: source.kind === 'electron-folder' && gitStatus.available,
        refreshToken: gitRefreshToken,
    });

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
        setChildrenCache(prev => dropCachedBranches(prev, [sourceParent, targetPath]));
        await loadDir(rootPath);
        if (expanded.has(sourceParent)) await loadChildren(sourceParent, { force: true });
        if (expanded.has(targetPath)) await loadChildren(targetPath, { force: true });
        setGitRefreshToken(token => token + 1);
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

    const openWorktreeRoot = useCallback(async (path: string) => {
        await openFolderRoot(path, { registerGitWorktree: true, repoRoot: worktreeState.repoRoot });
    }, [openFolderRoot, worktreeState.repoRoot]);

    const copyWorktreePath = useCallback(async (path: string) => {
        const result = await copyText(path);
        if (result.ok) {
            setActionStatus('Copied worktree path');
            setError(null);
        } else {
            setError(result.error ?? 'Failed to copy worktree path');
        }
    }, []);

    const revealWorktreePath = useCallback(async (path: string) => {
        if (!rootPath || !source.registerGitWorktreeRoot || !source.revealPath) return;
        try {
            await source.registerGitWorktreeRoot(rootPath, worktreeState.repoRoot ?? undefined, path);
            await source.revealPath(path);
            setActionStatus('Opened worktree in Finder');
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [rootPath, source, worktreeState.repoRoot]);

    const runWorktreeOperation = useCallback(async (operation: GitWorktreeOperation) => {
        if (!rootPath) return;
        setWorktreeOperationBusy(true);
        try {
            const result = await runWorktreeOperationClient({
                folderPanelRoot: rootPath,
                repoRoot: worktreeState.repoRoot,
                operation,
                confirmed: true,
            });
            if (!result.ok) throw new Error(result.error ?? 'Git operation failed');
            setActionStatus(result.preview?.label ?? 'Git worktree operation completed');
            setError(null);
            setWorktreeOpsOpen(false);
            worktreeState.refresh();
            setGitRefreshToken(token => token + 1);
            if (rootPath !== null) await loadDir(rootPath);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setWorktreeOperationBusy(false);
        }
    }, [loadDir, rootPath, worktreeState]);

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

    return (
        <div className="folder-panel">
            <FolderPanelToolbar
                canPickRoot={source.canPickRoot}
                label={source.label}
                rootPath={rootPath}
                onPickFolder={() => void pickFolder()}
                onRefresh={() => {
                    if (rootPath !== null) {
                        void loadDir(rootPath);
                        setGitRefreshToken(token => token + 1);
                        worktreeState.refresh();
                    }
                }}
                gitSummary={source.kind === 'electron-folder' ? gitStatus : undefined}
                worktreeSummary={source.kind === 'electron-folder' ? worktreeState : undefined}
                onOpenWorktree={path => void openWorktreeRoot(path)}
                onCopyWorktreePath={path => void copyWorktreePath(path)}
                onRevealWorktreePath={path => void revealWorktreePath(path)}
                onOpenWorktreeOps={() => setWorktreeOpsOpen(true)}
            />
            {rootPath !== null && (
                <div className="folder-action-row" aria-label="Folder actions">
                    <button type="button" className="folder-action-btn" disabled={!selectedEntry} onClick={() => void copySelectedPath('absolute')}>Copy</button>
                    <button type="button" className="folder-action-btn" disabled={!selectedEntry} onClick={() => void copySelectedPath('relative')}>Relative</button>
                    <button type="button" className="folder-action-btn" disabled={!selectedEntry || !source.revealPath} onClick={() => void revealSelectedPath()}>Finder</button>
                </div>
            )}
            {error && <div className="folder-error">{error}</div>}
            {actionStatus && !error && <div className="folder-status">{actionStatus}</div>}
            {worktreeOpsOpen && rootPath !== null && (
                <FolderWorktreeOpsDialog
                    folderPanelRoot={rootPath}
                    repoRoot={worktreeState.repoRoot}
                    worktrees={worktreeState.worktrees}
                    busy={worktreeOperationBusy}
                    onRun={operation => void runWorktreeOperation(operation)}
                    onClose={() => setWorktreeOpsOpen(false)}
                />
            )}
            <div className={rootPath === null ? 'folder-tree folder-empty-root' : 'folder-tree'} role="tree">
                <FolderTreeRows
                    entries={entries}
                    depth={0}
                    expanded={expanded}
                    childrenCache={childrenCache}
                    selectedPath={selectedPath}
                    selectedFilePath={props.selectedFilePath}
                    decorationsByPath={gitStatus.decorationsByPath}
                    dropTargetPath={dropTargetPath}
                    draggedEntry={draggedEntry}
                    canUseNativeActions={canUseNativeActions}
                    setDraggedEntry={setDraggedEntry}
                    setDropTargetPath={setDropTargetPath}
                    requestMove={requestMove}
                    handleEntryKeyDown={handleEntryKeyDown}
                    selectAndActivateEntry={selectAndActivateEntry}
                    openContextMenu={(entry, x, y) => {
                        setSelectedPath(entry.path);
                        setContextMenu({ entry, x, y });
                    }}
                />
                {rootPath === null && !error && (
                    <div className="folder-empty-root__content">Choose a folder to browse files.</div>
                )}
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
