import { useEffect, useId, useState } from 'react';
import { preprocessMermaid, sanitizeMermaidForRetry } from '../../../../js/render/mermaid-preprocess';
import { getMermaidInitConfig } from '../../../../js/render/mermaid';
import { sanitizeMermaidSvg } from '../../../../js/render/sanitize';

const WIDE_DIAGRAM_TYPES = new Set([
    'gantt', 'sequencediagram', 'timeline', 'sankey-beta',
]);

type MermaidApi = {
    initialize(config: Record<string, unknown>): void;
    render(id: string, code: string): Promise<{ svg: string }>;
};

type MermaidBlockProps = {
    code: string;
};

type MermaidState =
    | { status: 'loading' }
    | { status: 'ready'; svg: string; wide: boolean }
    | { status: 'error'; message: string };

let mermaidModule: MermaidApi | null = null;

async function loadMermaid(): Promise<MermaidApi> {
    if (!mermaidModule) {
        const module = await import('mermaid');
        mermaidModule = module.default as MermaidApi;
    }
    mermaidModule.initialize(getMermaidInitConfig());
    return mermaidModule;
}

export function MermaidBlock(props: MermaidBlockProps) {
    const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const [state, setState] = useState<MermaidState>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;

        async function renderDiagram(): Promise<void> {
            setState({ status: 'loading' });
            try {
                const mermaid = await loadMermaid();
                const code = preprocessMermaid(props.code);
                const id = `notes-mermaid-${reactId}`;
                let svg: string;
                try {
                    ({ svg } = await mermaid.render(id, code));
                } catch (firstErr: unknown) {
                    const retryCode = sanitizeMermaidForRetry(code);
                    if (!retryCode) throw firstErr;
                    ({ svg } = await mermaid.render(`${id}-retry`, retryCode));
                }
                if (!cancelled) {
                    const dtype = code.trim().split(/\s/)[0].toLowerCase();
                    setState({
                        status: 'ready',
                        svg: sanitizeMermaidSvg(svg),
                        wide: WIDE_DIAGRAM_TYPES.has(dtype),
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setState({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'Mermaid render failed',
                    });
                }
            }
        }

        void renderDiagram();
        return () => {
            cancelled = true;
        };
    }, [props.code, reactId]);

    if (state.status === 'ready') {
        return (
            <div
                className={`notes-mermaid-block is-ready${state.wide ? ' mermaid-type-wide' : ''}`}
                dangerouslySetInnerHTML={{ __html: state.svg }}
            />
        );
    }

    if (state.status === 'error') {
        return (
            <div className="notes-mermaid-block is-error">
                <strong>Mermaid render failed</strong>
                <span>{state.message}</span>
                <pre><code>{props.code}</code></pre>
            </div>
        );
    }

    return (
        <div className="notes-mermaid-block is-loading" role="status" aria-label="Diagram loading">
            Rendering diagram...
        </div>
    );
}
