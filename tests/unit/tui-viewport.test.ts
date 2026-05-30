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
