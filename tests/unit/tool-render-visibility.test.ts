import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiSrc = readFileSync(join(__dirname, '../../public/js/ui.ts'), 'utf8');
const processBlockSrc = readFileSync(join(__dirname, '../../public/js/features/process-block.ts'), 'utf8');
const processBlockDomSrc = readFileSync(join(__dirname, '../../public/js/features/process-block-dom.ts'), 'utf8');

test('live process blocks are placed after message content so bottom-follow keeps tools visible', () => {
    const showIdx = uiSrc.indexOf('export function showProcessStep');
    const hydrateIdx = uiSrc.indexOf('export function hydrateActiveRun');
    const appendIdx = uiSrc.indexOf('export function appendAgentText');
    const showBlock = uiSrc.slice(showIdx, hydrateIdx);
    const hydrateBlock = uiSrc.slice(hydrateIdx, appendIdx);

    assert.ok(showBlock.includes("normalizeAgentToolBlocks(agentDiv, 'after-content')"), 'live agent_tool events should preserve bottom-visible tool placement');
    assert.ok(showBlock.includes("createProcessBlock(body, 'after-content')"), 'new live process blocks should mount below streamed content');
    assert.ok(hydrateBlock.includes("normalizeAgentToolBlocks(state.currentAgentDiv, 'after-content')"), 'active-run hydration should preserve bottom-visible placement');
    assert.ok(hydrateBlock.includes("createProcessBlock(body, 'after-content')"), 'rehydrated active-run tools should mount below streamed content');
});

test('finalized process blocks still normalize before content for historical messages', () => {
    const finalizeIdx = uiSrc.indexOf('export function finalizeAgent');
    const finalizeBlock = uiSrc.slice(finalizeIdx, finalizeIdx + 1800);

    assert.ok(finalizeBlock.includes('normalizeAgentToolBlocks(state.currentAgentDiv)'), 'finalize should use the default historical placement');
    assert.ok(!finalizeBlock.includes("normalizeAgentToolBlocks(state.currentAgentDiv, 'after-content')"), 'finalized messages should not keep live-only placement');
});

test('process block helpers support explicit before/after content placement', () => {
    assert.ok(processBlockSrc.includes("placement: 'before-content' | 'after-content' = 'before-content'"), 'createProcessBlock should expose explicit placement');
    assert.ok(processBlockSrc.includes("content && placement === 'after-content'"), 'createProcessBlock should support mounting after content');
    assert.ok(processBlockSrc.includes('content.after(el)'), 'after-content placement should put the tool block after message content');

    assert.ok(processBlockDomSrc.includes("type ToolBlockPlacement = 'before-content' | 'after-content'"), 'DOM normalizer should model both placements');
    assert.ok(processBlockDomSrc.includes("placement: ToolBlockPlacement = 'before-content'"), 'DOM normalizer should default to historical placement');
    assert.ok(processBlockDomSrc.includes("placement === 'after-content'"), 'DOM normalizer should preserve live after-content placement');
});
