type FolderPanelToolbarProps = {
    canPickRoot: boolean;
    label: string;
    rootPath: string | null;
    gitSummary?: {
        available: boolean;
        loading: boolean;
        error: string | null;
        branch: string | null;
        head: string | null;
        dirty: boolean;
    } | undefined;
    onPickFolder: () => void;
    onRefresh: () => void;
};

function rootLabel(rootPath: string | null): string {
    if (rootPath === null) return 'Open Folder';
    return rootPath.split('/').pop() || rootPath;
}

export function FolderPanelToolbar(props: FolderPanelToolbarProps) {
    const gitLabel = props.gitSummary?.loading
        ? 'Git ...'
        : props.gitSummary?.available
            ? `${props.gitSummary.branch ?? props.gitSummary.head ?? 'detached'} / ${props.gitSummary.dirty ? 'dirty' : 'clean'}`
            : props.gitSummary?.error
                ? 'Git unavailable'
                : null;
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
            {gitLabel && (
                <span className={props.gitSummary?.error ? 'folder-git-summary is-error' : 'folder-git-summary'} title={props.gitSummary?.error ?? undefined}>
                    {gitLabel}
                </span>
            )}
            {props.rootPath !== null && (
                <button type="button" className="folder-refresh" onClick={props.onRefresh} aria-label="Refresh folder">
                    ↻
                </button>
            )}
        </div>
    );
}
