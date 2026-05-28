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

function getFileBridge(): Pick<FolderBridgeApi, 'readFile'> | null {
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

    useEffect(() => {
        if (!props.filePath) {
            setContent('');
            setError(null);
            return;
        }
        void (async () => {
            if (bridge) {
                const result = await bridge.readFile(props.filePath!);
                if (result.ok && result.content !== undefined) {
                    if (result.binary) {
                        setBinary(true);
                        setContent('');
                    } else {
                        setBinary(false);
                        setContent(result.content);
                    }
                    setError(null);
                } else {
                    setError(result.error ?? 'Failed to read file');
                }
                return;
            }
            if (!isNotesRelativePath(props.filePath!)) {
                setError('Document preview for arbitrary local files requires Electron desktop app');
                return;
            }
            try {
                const note = await fetchNoteFile(props.filePath!);
                setBinary(false);
                setContent(note.content);
                setError(null);
            } catch (err) {
                setError((err as Error).message);
            }
        })();
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

    return (
        <div className="doc-panel">
            <div className="doc-toolbar">
                <span className="doc-file-name">{props.filePath.split('/').pop()}</span>
            </div>
            <div className="doc-content">
                <DocContent filePath={props.filePath} content={content} />
            </div>
        </div>
    );
}
