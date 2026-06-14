import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');

test('fullscreen user transcript renderer splits embedded newlines into frame rows', () => {
    assert.match(source, /const lines = item\.displayText\.split\('\\n'\);/);
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
    assert.match(source, /const toolDetail = item\.detail \?\? toolRest\.join/);
    assert.match(source, /item\.status === 'error'/);
    assert.match(source, /item\.status === 'done' \? 'done'/);
    assert.doesNotMatch(source, /item\.status === 'done' \|\| item\.collapsed/);
});

test('fullscreen completed tool expansion is latest-tool and newline-safe', () => {
    assert.match(source, /toggleLatestToolExpansion\(ctx\.store\.transcript\)/);
    assert.match(source, /const detailLines = toolDetail\.split\('\\n'\)/);
    assert.match(source, /expandedDone/);
    assert.match(source, /rows\.push\(`\$\{gutter\}\$\{c\.dim\}│ /);
});
