type FolderPanelToolbarProps = {
    canPickRoot: boolean;
    label: string;
    rootPath: string | null;
    onPickFolder: () => void;
    onRefresh: () => void;
};

function rootLabel(rootPath: string | null): string {
    if (rootPath === null) return 'Open Folder';
    return rootPath.split('/').pop() || rootPath;
}

export function FolderPanelToolbar(props: FolderPanelToolbarProps) {
    return (
        <div className="folder-toolbar">
            <button
                type="button"
                className="folder-pick-btn"
                onClick={props.onPickFolder}
                disabled={!props.canPickRoot}
            >
                {props.canPickRoot ? rootLabel(props.rootPath) : props.label}
            </button>
            {props.rootPath !== null && (
                <button type="button" className="folder-refresh" onClick={props.onRefresh} aria-label="Refresh folder">
                    ↻
                </button>
            )}
        </div>
    );
}
