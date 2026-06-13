import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getInteractive,
    initJawcodeTui,
    isInitialized,
    renderMarkdownJawcode,
} from '../../src/cli/tui/jawcode-render.ts';

test('renderMarkdownJawcode renders headings without exported getMarkdownTheme', async () => {
    await initJawcodeTui();
    assert.equal(isInitialized(), true);
    assert.equal(typeof getInteractive().getMarkdownTheme, 'undefined');

    const lines = renderMarkdownJawcode('# Hello', 80);
    assert.ok(lines.length > 0);
    assert.ok(lines.join('\n').includes('Hello'));
});

test('renderMarkdownJawcode renders common markdown blocks', async () => {
    await initJawcodeTui();
    const lines = renderMarkdownJawcode('## Title\n\n- one\n- two\n\n```ts\nconst x = 1;\n```', 80);
    const out = lines.join('\n');
    assert.ok(out.includes('Title'));
    assert.ok(out.includes('one'));
    assert.ok(out.includes('const x = 1'));
});

test('renderMarkdownJawcode can be called repeatedly after one initialization', async () => {
    await initJawcodeTui();
    const first = renderMarkdownJawcode('plain text', 80);
    const second = renderMarkdownJawcode('plain text', 80);
    assert.deepEqual(second, first);
});
