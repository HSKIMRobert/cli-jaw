import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDesktop, type DiffBridgeApi, type DiffOptions, type DiffResolvedRoot } from '../panels/desktop-bridge';
import type { DashboardDiffMode, DashboardInstance, DashboardRegistryUi } from '../types';
import { buildDiffRootCandidates } from './diff-root-candidates';
import './diff-panel.css';

type DiffFileSummary = {
    path: string;
    status: string;
    insertions: number;
    deletions: number;
};

type DiffSettings = Pick<DashboardRegistryUi,
    'diffRootPolicy' | 'diffPinnedRootByPort' | 'diffDefaultMode' | 'diffBaseRef' | 'diffIncludeUntracked'
>;

type DiffPanelProps = {
    selectedInstance: DashboardInstance | null;
    settings: DiffSettings;
    onSettingsPatch?: (patch: Partial<DashboardRegistryUi>) => void;
};

const DIFF_MODES: DashboardDiffMode[] = ['unstaged', 'staged', 'head', 'base'];

function getDiffLineClass(line: string): string {
    if (line.startsWith('@@')) return 'diff-line-hunk';
    if (line.startsWith('diff ') || line.startsWith('index ')) return 'diff-line-meta';
    if (line.startsWith('--- ') || line.startsWith('+++ ')) return 'diff-line-meta';
    if (line.startsWith('+')) return 'diff-line-add';
    if (line.startsWith('-')) return 'diff-line-del';
    return '';
}

function renderDiffLines(text: string): ReactNode {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
        const cls = getDiffLineClass(line);
        return <span key={i} className={`diff-line${cls ? ` ${cls}` : ''}`}>{line}{'\n'}</span>;
    });
}

function getDiffBridge(): DiffBridgeApi | null {
    return getDesktop()?.diff ?? null;
}

function diffOptions(settings: DiffSettings): DiffOptions {
    const options: DiffOptions = {
        mode: settings.diffDefaultMode,
        includeUntracked: settings.diffIncludeUntracked,
    };
    if (settings.diffDefaultMode === 'base') options.ref = settings.diffBaseRef.trim() || 'HEAD';
    return options;
}

function rootTitle(root: DiffResolvedRoot): string {
    const suffix = root.branch ?? root.head ?? 'detached';
    return `${root.label}: ${root.root} (${suffix}${root.dirty ? ', dirty' : ''})`;
}

export function DiffPanel(props: DiffPanelProps) {
    const bridge = getDiffBridge();
    const [repoCandidates, setRepoCandidates] = useState<DiffResolvedRoot[]>([]);
    const [repoRoot, setRepoRoot] = useState<string | null>(null);
    const [files, setFiles] = useState<DiffFileSummary[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [diffContent, setDiffContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const selectedInstanceKey = `${props.selectedInstance?.port ?? 'none'}:${props.selectedInstance?.workingDir ?? ''}:${props.selectedInstance?.projectDirs?.join('\0') ?? ''}`;
    const options = useMemo(() => diffOptions(props.settings), [
        props.settings.diffDefaultMode,
        props.settings.diffBaseRef,
        props.settings.diffIncludeUntracked,
    ]);
    const selectedRoot = repoCandidates.find(candidate => candidate.root === repoRoot) ?? null;

    const loadRepoCandidates = useCallback(async () => {
        if (!bridge) return;
        const desktop = getDesktop();
        const home = desktop?.getHomePath?.() || '/tmp';
        const candidates = buildDiffRootCandidates(props.selectedInstance, home, {
            diffRootPolicy: props.settings.diffRootPolicy,
            diffPinnedRootByPort: props.settings.diffPinnedRootByPort,
        });
        const result = await bridge.getRepoCandidates(candidates);
        if (!result.ok) {
            setError(result.error ?? 'Failed to resolve git repositories');
            return;
        }
        const roots = result.candidates ?? [];
        setRepoCandidates(roots);
        setRepoRoot(current => current && roots.some(root => root.root === current) ? current : roots[0]?.root ?? null);
        if (roots.length === 0) setError('No git repository found from the selected instance roots.');
        else setError(null);
    }, [bridge, selectedInstanceKey, props.settings.diffRootPolicy, props.settings.diffPinnedRootByPort]);

    const loadSummary = useCallback(async () => {
        if (!bridge || !repoRoot) return;
        const result = await bridge.getDiffSummary(repoRoot, options);
        if (result.ok && result.files) {
            setFiles(result.files);
            setSelectedFile(current => current && result.files?.some(file => file.path === current) ? current : result.files?.[0]?.path ?? null);
            setError(null);
        } else {
            setFiles([]);
            setSelectedFile(null);
            setError(result.error ?? 'Failed to get diff summary');
        }
    }, [bridge, options, repoRoot]);

    useEffect(() => { void loadRepoCandidates(); }, [loadRepoCandidates]);
    useEffect(() => { void loadSummary(); }, [loadSummary]);

    useEffect(() => {
        if (!bridge || !repoRoot || !selectedFile) {
            setDiffContent('');
            return;
        }
        void (async () => {
            const result = await bridge.getFileDiff(repoRoot, selectedFile, options);
            if (result.ok && result.diff !== undefined) setDiffContent(result.diff || 'No textual diff for this file.');
            else setDiffContent(`Error: ${result.error ?? 'unknown'}`);
        })();
    }, [bridge, options, repoRoot, selectedFile]);

    function handleRootChange(root: string): void {
        setRepoRoot(root);
        setSelectedFile(null);
        const port = props.selectedInstance?.port;
        if (port == null) return;
        props.onSettingsPatch?.({
            diffPinnedRootByPort: {
                ...props.settings.diffPinnedRootByPort,
                [String(port)]: root,
            },
        });
    }

    function handleModeChange(mode: DashboardDiffMode): void {
        props.onSettingsPatch?.({ diffDefaultMode: mode });
    }

    if (!bridge) {
        return <div className="diff-panel diff-unavailable">Diff viewer requires Electron desktop app</div>;
    }

    return (
        <div className="diff-panel">
            <div className="diff-toolbar">
                <select
                    className="diff-root-select"
                    value={repoRoot ?? ''}
                    aria-label="Git repository root"
                    onChange={(event) => handleRootChange(event.currentTarget.value)}
                >
                    {repoCandidates.map(candidate => (
                        <option key={candidate.root} value={candidate.root}>{rootTitle(candidate)}</option>
                    ))}
                    {repoCandidates.length === 0 && <option value="">No repo</option>}
                </select>
                <span className="diff-head-chip">{selectedRoot?.branch ?? selectedRoot?.head ?? 'no repo'}</span>
                <button type="button" className="diff-refresh" onClick={() => void loadRepoCandidates()}>Refresh</button>
            </div>
            <div className="diff-toolbar diff-options">
                <div className="diff-mode-group" aria-label="Diff mode">
                    {DIFF_MODES.map(mode => (
                        <button
                            key={mode}
                            type="button"
                            className={`diff-mode-button${props.settings.diffDefaultMode === mode ? ' is-active' : ''}`}
                            aria-pressed={props.settings.diffDefaultMode === mode}
                            onClick={() => handleModeChange(mode)}
                        >
                            {mode === 'head' ? 'HEAD' : mode === 'base' ? 'Base' : mode}
                        </button>
                    ))}
                </div>
                <input
                    className="diff-ref-input"
                    type="text"
                    value={props.settings.diffBaseRef}
                    aria-label="Base ref"
                    disabled={props.settings.diffDefaultMode !== 'base'}
                    onChange={(event) => props.onSettingsPatch?.({ diffBaseRef: event.currentTarget.value })}
                />
                <label className="diff-untracked-toggle">
                    <input
                        type="checkbox"
                        checked={props.settings.diffIncludeUntracked}
                        onChange={(event) => props.onSettingsPatch?.({ diffIncludeUntracked: event.currentTarget.checked })}
                    />
                    <span>untracked</span>
                </label>
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
                                {f.status === 'untracked' && <span className="diff-ins">new</span>}
                            </span>
                        </button>
                    ))}
                    {files.length === 0 && !error && <div className="diff-empty">No changes</div>}
                </div>
                <div className="diff-content">
                    <pre className="diff-pre">{renderDiffLines(diffContent)}</pre>
                </div>
            </div>
        </div>
    );
}
