import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');

test('fullscreen user transcript renderer splits embedded newlines into frame rows', () => {
    assert.match(source, /item\.displayText\.split\('\\n'\)\.flatMap/);
    assert.match(source, /wrapTextToCols\(line, w - 3\)/);
    assert.match(source, /return lines\.map\(\(line, index\) =>/);
});

test('fullscreen thinking renderer returns labeled rows without embedded newline templates', () => {
    const thinkBlock = source.slice(
        source.indexOf('if (thinkMatch)'),
        source.indexOf('const mdText = item.text'),
    );
    assert.ok(thinkBlock.includes('...(agentLabel ?'));
    assert.doesNotMatch(thinkBlock, /return \[`.*\\n.*`\]/s);
});

test('fullscreen tool renderer uses transcript status and detail fields', () => {
    assert.match(source, /function parseToolText\(text: string\)/);
    assert.match(source, /LEADING_TOOL_GLYPH/);
    assert.match(source, /const toolDetail = item\.detail \?\? parsed\.detail/);
    assert.match(source, /item\.status === 'error'/);
    assert.match(source, /item\.status === 'done' \? 'done'/);
    assert.doesNotMatch(source, /item\.status === 'done' \|\| item\.collapsed/);
});

test('fullscreen completed tool expansion is full-sweep and newline-safe', () => {
    assert.match(source, /toggleToolExpansion\(ctx\.store\.transcript\)/);
    assert.match(source, /const detailLines = toolDetail\.split\('\\n'\)/);
    assert.match(source, /wrapTextToCols\(line, detailWidth\)/);
    assert.match(source, /expandedDone/);
    assert.match(source, /const detailPrefix = `\$\{gutter\}\$\{c\.dim\}│ /);
    assert.match(source, /rows\.push\(`\$\{detailPrefix\}\$\{clipTextToCols\(line, detailWidth\)\}/);
});

test('fullscreen live tool handling keeps running tools out of committed transcript', () => {
    assert.match(source, /renderLiveToolRows\(ctx, cols/);
    assert.match(source, /const state = ctx\.store\.transcript/);
    assert.match(source, /listLiveToolItems\(state\)/);
    assert.match(source, /state\.liveToolsExpanded/);
    assert.match(source, /liveRows/);
});

test('fullscreen default mouse tracking is copy-friendly and opt-in', () => {
    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
    assert.doesNotMatch(source, /screen\.enter\(\);\s*screen\.enableMouse\(\);/);
});
