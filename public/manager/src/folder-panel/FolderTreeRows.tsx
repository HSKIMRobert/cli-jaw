import type { FolderPanelEntry, FolderPanelRowDecoration } from './folder-panel-types';
import { FOLDER_PANEL_DRAG_MIME, encodeFolderPanelDragPayload } from './folder-drag-payload';
import { isDescendantPath } from './folder-panel-state';

type FolderTreeRowsProps = {
    entries: FolderPanelEntry[];
    depth: number;
    expanded: Set<string>;
    childrenCache: Map<string, FolderPanelEntry[]>;
    selectedPath: string | null;
    selectedFilePath?: string | null | undefined;
    decorationsByPath: Map<string, FolderPanelRowDecoration>;
    dropTargetPath: string | null;
    draggedEntry: FolderPanelEntry | null;
    canUseNativeActions: boolean;
    setDraggedEntry: (entry: FolderPanelEntry | null) => void;
    setDropTargetPath: (path: string | null) => void;
    requestMove: (sourceEntry: FolderPanelEntry, targetEntry: FolderPanelEntry) => void;
    handleEntryKeyDown: (event: React.KeyboardEvent, entry: FolderPanelEntry) => void;
    selectAndActivateEntry: (entry: FolderPanelEntry, mode?: 'primary' | 'preview-only') => void;
    openContextMenu: (entry: FolderPanelEntry, x: number, y: number) => void;
};

export function FolderTreeRows(props: FolderTreeRowsProps) {
    return (
        <>
            {props.entries.map(entry => (
                <div key={entry.path}>
                    {(() => {
                        const decoration = props.decorationsByPath.get(entry.path);
                        return (
                    <div
                        className={[
                            'folder-entry',
                            `folder-entry-${entry.kind}`,
                            decoration?.className ?? '',
                            props.selectedPath === entry.path ? 'is-selected' : '',
                            props.dropTargetPath === entry.path ? 'is-drop-target' : '',
                            props.draggedEntry?.path === entry.path ? 'is-dragging' : '',
                        ].filter(Boolean).join(' ')}
                        role="treeitem"
                        aria-selected={entry.kind === 'file' && entry.path === props.selectedFilePath}
                        draggable={props.canUseNativeActions}
                        onDragStart={(event) => {
                            if (!props.canUseNativeActions) return;
                            props.setDraggedEntry(entry);
                            event.dataTransfer.effectAllowed = 'copyMove';
                            event.dataTransfer.setData(FOLDER_PANEL_DRAG_MIME, encodeFolderPanelDragPayload(entry));
                            event.dataTransfer.setData('text/plain', entry.path);
                        }}
                        onDragEnd={() => {
                            props.setDraggedEntry(null);
                            props.setDropTargetPath(null);
                        }}
                        onDragOver={(event) => {
                            if (!props.draggedEntry || entry.kind !== 'directory') return;
                            if (props.draggedEntry.path === entry.path) return;
                            if (props.draggedEntry.kind === 'directory' && isDescendantPath(props.draggedEntry.path, entry.path)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            props.setDropTargetPath(entry.path);
                        }}
                        onDragLeave={() => {
                            if (props.dropTargetPath === entry.path) props.setDropTargetPath(null);
                        }}
                        onDrop={(event) => {
                            if (!props.draggedEntry || entry.kind !== 'directory') return;
                            event.preventDefault();
                            props.setDropTargetPath(null);
                            props.requestMove(props.draggedEntry, entry);
                        }}
                    >
                        {props.depth > 0 && (
                            <span className="folder-indent" aria-hidden="true">
                                {Array.from({ length: props.depth }, (_, level) => (
                                    <span key={level} className="folder-indent-guide" />
                                ))}
                            </span>
                        )}
                        <button
                            type="button"
                            className="folder-entry-btn"
                            onKeyDown={(event) => props.handleEntryKeyDown(event, entry)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                props.openContextMenu(entry, event.clientX, event.clientY);
                            }}
                            onClick={() => props.selectAndActivateEntry(entry)}
                        >
                            <span className="folder-entry-icon">
                                {entry.kind === 'directory' ? (props.expanded.has(entry.path) ? '▾' : '▸') : '·'}
                            </span>
                            <span className="folder-entry-name">{entry.name}</span>
                            {decoration?.label && (
                                <span className="folder-entry-git-badge" title={decoration.title} aria-label={decoration.title ?? decoration.label}>
                                    {decoration.label}
                                </span>
                            )}
                        </button>
                    </div>
                        );
                    })()}
                    {entry.kind === 'directory' && props.expanded.has(entry.path) && props.childrenCache.has(entry.path) && (
                        <FolderTreeRows
                            {...props}
                            entries={props.childrenCache.get(entry.path)!}
                            depth={props.depth + 1}
                        />
                    )}
                </div>
            ))}
        </>
    );
}
