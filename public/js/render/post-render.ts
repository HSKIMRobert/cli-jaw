// ── Batched post-render scheduler ──
import { renderMermaidBlocks } from './mermaid.js';
import { rehighlightAll } from './highlight.js';
import { bindDiagramZoom } from './svg-actions.js';
import { linkifyFilePathsWithNotesRoot } from './file-links.js';
import { hydrateElicitationBlocks } from '../features/elicitation.js';
import { hydrateSearchResultsBlocks } from './search-results.js';
import { hydrateComposeBlocks } from './compose-block.js';
import { hydrateDataframeBlocks } from './dataframe.js';
import { hydrateChartJsonBlocks } from './chart-json.js';
import { hydrateLinkPreviewCards } from './link-preview.js';

let postRenderRAF: number | null = null;
let postRenderTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePostRender(): void {
    if (postRenderTimer) clearTimeout(postRenderTimer);
    if (postRenderRAF) { cancelAnimationFrame(postRenderRAF); postRenderRAF = null; }
    postRenderTimer = setTimeout(() => {
        postRenderTimer = null;
        postRenderRAF = requestAnimationFrame(() => {
            postRenderRAF = null;
            renderMermaidBlocks();
            rehighlightAll();
            bindDiagramZoom();
            const msgContainer = document.getElementById('chatMessages');
            if (msgContainer) {
                hydrateElicitationBlocks(msgContainer);
                hydrateSearchResultsBlocks(msgContainer);
                hydrateComposeBlocks(msgContainer);
                hydrateDataframeBlocks(msgContainer);
                hydrateChartJsonBlocks(msgContainer);
                hydrateLinkPreviewCards(msgContainer);
                void linkifyFilePathsWithNotesRoot(msgContainer);
            }
        });
    }, 100);
}

export function cancelPostRender(): void {
    if (postRenderTimer) {
        clearTimeout(postRenderTimer);
        postRenderTimer = null;
    }
    if (postRenderRAF) {
        cancelAnimationFrame(postRenderRAF);
        postRenderRAF = null;
    }
}
