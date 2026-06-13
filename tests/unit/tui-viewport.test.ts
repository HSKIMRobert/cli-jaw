import test from 'node:test';
import assert from 'node:assert/strict';
import { Viewport } from '../../src/cli/tui/render/viewport.ts';
import type { TranscriptItem } from '../../src/cli/tui/transcript.ts';

const render = (item: TranscriptItem) => [item.type === 'user' ? `u:${(item as { displayText: string }).displayText}` : item.type];

test('Viewport followTail keeps scroll at bottom', () => {
    const v = new Viewport();
    v.setItems([
        { type: 'user', displayText: 'a', submitText: 'a', timestamp: 0 },
        { type: 'user', displayText: 'b', submitText: 'b', timestamp: 1 },
    ], render);
    v.scrollBy(-5, 1);
    assert.notEqual(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'u:b');
    v.followTail(true, 1);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'u:b');
});

test('Viewport tail-follow bottom-aligns short transcript', () => {
    const v = new Viewport();
    v.setItems([
        { type: 'user', displayText: 'hello', submitText: 'hello', timestamp: 0 },
    ], render, 4);

    assert.deepEqual(
        v.composeRegion({ x: 1, y: 1, width: 40, height: 4 }),
        ['', '', '', 'u:hello'],
    );
});

test('Viewport rerenders same-length user content changes', () => {
    const v = new Viewport();
    v.setItems([{ type: 'user', displayText: 'abc', submitText: 'abc', timestamp: 0 }], render);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'u:abc');

    v.setItems([{ type: 'user', displayText: 'xyz', submitText: 'xyz', timestamp: 1 }], render);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'u:xyz');
});

test('Viewport rerenders same-length assistant content changes', () => {
    const v = new Viewport();
    const renderAssistant = (item: TranscriptItem) => [item.type === 'assistant' ? `a:${item.text}` : item.type];
    v.setItems([{ type: 'assistant', text: 'foo', streaming: true, timestamp: 0 }], renderAssistant);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'a:foo');

    v.setItems([{ type: 'assistant', text: 'bar', streaming: true, timestamp: 1 }], renderAssistant);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'a:bar');
});

test('Viewport rerenders same-length tool content changes', () => {
    const v = new Viewport();
    const renderTool = (item: TranscriptItem) => [item.type === 'tool' ? `t:${item.text}` : item.type];
    v.setItems([{ type: 'tool', text: 'Read a', collapsed: false, timestamp: 0 }], renderTool);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 't:Read a');

    v.setItems([{ type: 'tool', text: 'Edit b', collapsed: false, timestamp: 1 }], renderTool);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 't:Edit b');
});

test('Viewport width changes rerender cells', () => {
    const v = new Viewport();
    const renderWithWidth = (item: TranscriptItem, width: number) => [`${item.type}:${width}`];
    v.setItems([{ type: 'user', displayText: 'same', submitText: 'same', timestamp: 0 }], renderWithWidth);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'user:80');

    v.setWidth(42);
    v.setItems([{ type: 'user', displayText: 'same', submitText: 'same', timestamp: 0 }], renderWithWidth);
    assert.equal(v.composeRegion({ x: 1, y: 1, width: 40, height: 1 })[0], 'user:42');
});
