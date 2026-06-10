import { useEffect, useState } from 'react';
import { getDesktop, type FolderBridgeApi } from '../panels/desktop-bridge';
import { MarkdownRenderer } from '../notes/rendering/MarkdownRenderer';
import { CodeBlock } from '../notes/rendering/CodeBlock';
import { fetchNoteFile } from '../notes/notes-api';
import './doc-panel.css';

const EXT_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'cpp',
    css: 'css', html: 'html', xml: 'xml', json: 'json',
    yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash', sql: 'sql',
};

function getFileLanguage(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext ? EXT_LANG[ext] ?? null : null;
}

function isMarkdown(filePath: string): boolean {
    return /\.(md|mdx)$/i.test(filePath);
}

function getFileBridge(): Pick<FolderBridgeApi, 'readFile' | 'getDefaultRoot'> | null {
    return getDesktop()?.folder ?? null;
}

function isNotesRelativePath(filePath: string): boolean {
    return !filePath.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(filePath);
}

function DocContent(props: { filePath: string; content: string }) {
    if (isMarkdown(props.filePath)) {
        return (
            <article className="notes-preview doc-markdown">
                <MarkdownRenderer markdown={props.content} />
            </article>
        );
    }
    const lang = getFileLanguage(props.filePath);
    if (lang) {
        return <CodeBlock code={props.content} language={lang} />;
    }
    return <pre className="doc-pre"><code>{props.content}</code></pre>;
}

export function DocPanel(props: { filePath?: string | undefined }) {
    const bridge = getFileBridge();
    const [content, setContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [binary, setBinary] = useState(false);
    const [truncated, setTruncated] = useState(false);

    useEffect(() => {
        if (!props.filePath) {
            setContent('');
            setError(null);
            setTruncated(false);
            return;
        }
        const filePath = props.filePath;
        let cancelled = false;
        void (async () => {
            if (bridge) {
                let result = await bridge.readFile(filePath);
                // Cold start: allowed roots are seeded by FolderPanel/getDefaultRoot.
                // If a doc link arrives before that, seed once and retry once.
                if (!result.ok && result.error?.includes('path not allowed')) {
                    await bridge.getDefaultRoot();
                    if (cancelled) return;
                    result = await bridge.readFile(filePath);
                }
                if (cancelled) return;
                if (result.ok && result.content !== undefined) {
                    setBinary(result.binary === true);
                    setTruncated(result.truncated === true && result.binary !== true);
                    setContent(result.binary || result.truncated ? '' : result.content);
                    setError(null);
                } else {
                    setError(result.error ?? 'Failed to read file');
                }
                return;
            }
            if (!isNotesRelativePath(filePath)) {
                if (!cancelled) setError('Document preview for arbitrary local files requires Electron desktop app');
                return;
            }
            try {
                const note = await fetchNoteFile(filePath);
                if (cancelled) return;
                setBinary(false);
                setTruncated(false);
                setContent(note.content);
                setError(null);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, [bridge, props.filePath]);

    if (!props.filePath) {
        return <div className="doc-panel doc-empty">Open Folders and select a file to preview it here.</div>;
    }

    if (error) {
        return <div className="doc-panel doc-error">{error}</div>;
    }

    if (binary) {
        return <div className="doc-panel doc-binary">Binary file — cannot preview</div>;
    }

    if (truncated) {
        return <div className="doc-panel doc-binary">File too large to preview (512KB cap) — open it in an editor instead.</div>;
    }

    return (
        <div className="doc-panel">
            <div className="doc-toolbar">
                <span className="doc-file-name" title={props.filePath}>{props.filePath.split('/').pop()}</span>
                <button
                    type="button"
                    className="doc-copy-path"
                    title="Copy full path"
                    onClick={() => {
                        void navigator.clipboard.writeText(props.filePath!).then(() => {
                            const btn = document.querySelector('.doc-copy-path');
                            if (btn) { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Path'; }, 1200); }
                        });
                    }}
                >
                    Path
                </button>
            </div>
            <div className="doc-content">
                <DocContent filePath={props.filePath} content={content} />
            </div>
        </div>
    );
}
