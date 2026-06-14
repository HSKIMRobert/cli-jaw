import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTranscriptState, appendToolItem, appendStatusItem, clearEphemeralStatus,
    toggleToolExpansion,
} from '../../src/cli/tui/transcript.ts';

test('appendToolItem adds a persistent tool item', () => {
    const s = createTranscriptState();
    appendToolItem(s, '🔧 Edit src/x.ts');
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0]!.type, 'tool');
    assert.equal((s.items[0] as { text: string }).text, '🔧 Edit src/x.ts');
});

test('tool items accumulate and are never replaced (unlike status)', () => {
    const s = createTranscriptState();
    appendToolItem(s, 'a');
    appendToolItem(s, 'b');
    appendToolItem(s, 'c');
    assert.equal(s.items.length, 3);
    assert.deepEqual(s.items.map(i => (i as { text: string }).text), ['a', 'b', 'c']);
});

test('tool item with same stepRef updates in place instead of duplicating', () => {
    const s = createTranscriptState();
    appendToolItem(s, '🔧 Bash echo 1', { stepRef: 'tool-1', status: 'running', detail: 'echo 1' });
    appendToolItem(s, '🔧 Bash', { stepRef: 'tool-1', status: 'done' });

    assert.equal(s.items.length, 1);
    assert.equal(s.items[0]!.type, 'tool');
    if (s.items[0]!.type === 'tool') {
        assert.equal(s.items[0]!.text, '🔧 Bash echo 1');
        assert.equal(s.items[0]!.stepRef, 'tool-1');
        assert.equal(s.items[0]!.status, 'done');
        assert.equal(s.items[0]!.collapsed, true);
        assert.equal(s.items[0]!.detail, 'echo 1');
    }
});

test('clearEphemeralStatus does NOT remove a trailing tool item', () => {
    const s = createTranscriptState();
    appendToolItem(s, 'tool line');
    clearEphemeralStatus(s);
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0]!.type, 'tool');
});

test('ws-handler order: clearEphemeralStatus before appendToolItem drops the transient status', () => {
    const s = createTranscriptState();
    appendStatusItem(s, 'agent working...'); // transient running spinner
    assert.equal(s.items.length, 1);
    // simulate the agent_tool handler sequence
    clearEphemeralStatus(s);
    appendToolItem(s, '🔧 Bash npm test');
    assert.equal(s.items.length, 1, 'transient status must not leak alongside the tool cell');
    assert.equal(s.items[0]!.type, 'tool');
});

test('status still replaces only the trailing status after tool items', () => {
    const s = createTranscriptState();
    appendToolItem(s, 'tool');
    appendStatusItem(s, 'status 1');
    appendStatusItem(s, 'status 2'); // replaces status 1
    assert.equal(s.items.length, 2);
    assert.equal(s.items[0]!.type, 'tool');
    assert.equal(s.items[1]!.type, 'status');
    assert.equal((s.items[1] as { text: string }).text, 'status 2');
});

test('toggleToolExpansion toggles all tool rows as a full sweep', () => {
    const s = createTranscriptState();
    assert.equal(toggleToolExpansion(s), false);

    appendToolItem(s, '🔧 Bash first', { stepRef: 'first', status: 'done', detail: 'first detail' });
    appendStatusItem(s, 'transient status');
    appendToolItem(s, '🔧 Bash second', { stepRef: 'second', status: 'done', detail: 'second detail' });

    assert.equal(toggleToolExpansion(s), true);

    const first = s.items[0]!;
    const status = s.items[1]!;
    const second = s.items[2]!;
    assert.equal(first.type, 'tool');
    assert.equal(status.type, 'status');
    assert.equal(second.type, 'tool');
    if (first.type === 'tool' && second.type === 'tool') {
        assert.equal(first.collapsed, false);
        assert.equal(second.collapsed, false);
    }

    assert.equal(toggleToolExpansion(s), true);
    if (first.type === 'tool' && second.type === 'tool') {
        assert.equal(first.collapsed, true);
        assert.equal(second.collapsed, true);
    }
});
