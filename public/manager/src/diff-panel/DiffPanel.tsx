import { useCallback, useEffect, useState } from 'react';
import { getDesktop, type DiffBridgeApi } from '../panels/desktop-bridge';
import './diff-panel.css';

type DiffFileSummary = {
    path: string;
    status: string;
    insertions: number;
    deletions: number;
};

function getDiffBridge(): DiffBridgeApi | null {
    return getDesktop()?.diff ?? null;
}

export function DiffPanel() {
    const bridge = getDiffBridge();
    const [repoRoot, setRepoRoot] = useState<string | null>(null);
    const [files, setFiles] = useState<DiffFileSummary[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [diffContent, setDiffContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const loadRepo = useCallback(async () => {
        if (!bridge) return;
        const desktop = getDesktop();
        const home = desktop?.getHomePath?.() ?? '/tmp';
        const result = await bridge.getRepoRoot(home);
        if (result.ok && result.root) {
            setRepoRoot(result.root);
            const summary = await bridge.getDiffSummary(result.root);
            if (summary.ok && summary.files) setFiles(summary.files);
            else setError(summary.error ?? 'Failed to get diff summary');
        } else {
            setError(result.error ?? 'No git repository found');
        }
    }, [bridge]);

    useEffect(() => { void loadRepo(); }, [loadRepo]);

    useEffect(() => {
        if (!bridge || !repoRoot || !selectedFile) return;
        void (async () => {
            const result = await bridge.getFileDiff(repoRoot, selectedFile);
            if (result.ok && result.diff) setDiffContent(result.diff);
            else setDiffContent(`Error: ${result.error ?? 'unknown'}`);
        })();
    }, [bridge, repoRoot, selectedFile]);

    if (!bridge) {
        return <div className="diff-panel diff-unavailable">Diff viewer requires Electron desktop app</div>;
    }

    return (
        <div className="diff-panel">
            <div className="diff-toolbar">
                <span className="diff-repo-label">{repoRoot ?? 'No repo'}</span>
                <button type="button" className="diff-refresh" onClick={() => void loadRepo()}>↻</button>
            </div>
            {error && <div className="diff-error">{error}</div>}
            <div className="diff-body">
                <div className="diff-file-list">
                    {files.map(f => (
                        <button key={f.path} type="button"
                            className={`diff-file-item ${f.path === selectedFile ? 'is-selected' : ''} diff-status-${f.status}`}
                            onClick={() => setSelectedFile(f.path)}>
                            <span className="diff-file-name">{f.path}</span>
                            <span className="diff-file-stats">
                                {f.insertions > 0 && <span className="diff-ins">+{f.insertions}</span>}
                                {f.deletions > 0 && <span className="diff-del">-{f.deletions}</span>}
                            </span>
                        </button>
                    ))}
                    {files.length === 0 && !error && <div className="diff-empty">No changes</div>}
                </div>
                <div className="diff-content">
                    <pre className="diff-pre">{diffContent}</pre>
                </div>
            </div>
        </div>
    );
}
