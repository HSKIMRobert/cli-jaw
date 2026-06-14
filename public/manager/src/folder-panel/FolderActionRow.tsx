type FolderActionRowProps = {
    hasSelection: boolean;
    canReveal: boolean;
    onCopyPath: () => void;
    onCopyRelativePath: () => void;
    onReveal: () => void;
};

export function FolderActionRow(props: FolderActionRowProps) {
    return (
        <div className="folder-action-row" aria-label="Folder actions">
            <button type="button" className="folder-action-btn" disabled={!props.hasSelection} onClick={props.onCopyPath}>Copy</button>
            <button type="button" className="folder-action-btn" disabled={!props.hasSelection} onClick={props.onCopyRelativePath}>Relative</button>
            <button type="button" className="folder-action-btn" disabled={!props.hasSelection || !props.canReveal} onClick={props.onReveal}>Finder</button>
        </div>
    );
}
