import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTranscriptState,
    appendUserItem,
    startAssistantItem,
    appendToActiveAssistant,
    appendAssistantTurnText,
    finalizeAssistant,
    finalizeStreamingAssistants,
    assistantTextSinceLastUser,
    appendThinkingTurnText,
    appendStatusItem,
    clearEphemeralStatus,
    appendToolItem,
} from '../../src/cli/tui/transcript.ts';

test('appendUserItem adds user transcript entry', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hello', 'hello');
    assert.equal(state.items.length, 1);
    const item = state.items[0]!;
    assert.equal(item.type, 'user');
    if (item.type === 'user') {
        assert.equal(item.displayText, 'hello');
        assert.equal(item.submitText, 'hello');
    }
});

test('assistant chunk flow: start → append → finalize', () => {
    const state = createTranscriptState();
    startAssistantItem(state);
    assert.equal(state.items.length, 1);
    const item = state.items[0]!;
    assert.equal(item.type, 'assistant');
    if (item.type === 'assistant') {
        assert.equal(item.streaming, true);
        assert.equal(item.text, '');
    }

    appendToActiveAssistant(state, 'Hello ');
    appendToActiveAssistant(state, 'world');
    if (item.type === 'assistant') {
        assert.equal(item.text, 'Hello world');
        assert.equal(item.streaming, true);
    }

    finalizeAssistant(state);
    if (item.type === 'assistant') {
        assert.equal(item.streaming, false);
    }
});

test('appendToActiveAssistant returns false when no active assistant', () => {
    const state = createTranscriptState();
    assert.equal(appendToActiveAssistant(state, 'chunk'), false);
    appendUserItem(state, 'hi', 'hi');
    assert.equal(appendToActiveAssistant(state, 'chunk'), false);
});

test('appendToActiveAssistant returns false after finalize', () => {
    const state = createTranscriptState();
    startAssistantItem(state);
    finalizeAssistant(state);
    assert.equal(appendToActiveAssistant(state, 'chunk'), false);
});

test('appendAssistantTurnText starts a new assistant after intervening tool rows', async () => {
    const { appendToolItem } = await import('../../src/cli/tui/transcript.ts');
    const state = createTranscriptState();
    startAssistantItem(state);
    appendToActiveAssistant(state, 'before tools\n');
    appendToolItem(state, '🔧 Bash echo 1');

    assert.equal(appendAssistantTurnText(state, 'after tools', 'main'), true);
    assert.equal(state.items.length, 3);
    assert.equal(state.items[2]!.type, 'assistant');
    if (state.items[2]!.type === 'assistant') {
        assert.equal(state.items[2]!.text, 'after tools');
        assert.equal(state.items[2]!.streaming, true);
    }
});

test('assistantTextSinceLastUser joins split assistant text around tools', async () => {
    const state = createTranscriptState();
    appendUserItem(state, 'run tools', 'run tools');
    startAssistantItem(state);
    appendToActiveAssistant(state, 'a');
    appendToolItem(state, '🔧 Bash echo 1');
    appendAssistantTurnText(state, 'c');

    assert.equal(assistantTextSinceLastUser(state), 'ac');
});

test('finalizeStreamingAssistants finalizes assistant rows split by tools', async () => {
    const state = createTranscriptState();
    startAssistantItem(state);
    appendToActiveAssistant(state, 'a');
    appendToolItem(state, '🔧 Bash echo 1');
    appendAssistantTurnText(state, 'c');

    assert.equal(finalizeStreamingAssistants(state), true);
    const assistantRows = state.items.filter((item) => item.type === 'assistant');
    assert.equal(assistantRows.length, 2);
    assert.ok(assistantRows.every((item) => item.type === 'assistant' && item.streaming === false));
});

test('thinking rows do not count as assistant final text', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hello', 'hello');
    appendThinkingTurnText(state, 'internal reasoning\nstep two', 'main');

    assert.equal(assistantTextSinceLastUser(state), '');
    assert.equal(finalizeStreamingAssistants(state), true);
    const item = state.items[1]!;
    assert.equal(item.type, 'thinking');
    if (item.type === 'thinking') {
        assert.equal(item.streaming, false);
        assert.equal(item.collapsed, true);
    }
});

test('assistant final text starts after thinking rows', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hello', 'hello');
    appendThinkingTurnText(state, 'internal reasoning', 'main');
    appendAssistantTurnText(state, 'Hello!', 'main');

    assert.equal(assistantTextSinceLastUser(state), 'Hello!');
    assert.equal(state.items.map((item) => item.type).join(','), 'user,thinking,assistant');
});

test('thinking can appear between same-turn tool rows', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'run tools', 'run tools');
    appendToolItem(state, 'Bash echo 1', { status: 'done', stepRef: 'tool-1' });
    appendThinkingTurnText(state, 'Planning tool calls', 'main');
    appendThinkingTurnText(state, '\nExecuting tool calls', 'main');
    appendToolItem(state, 'Read file', { status: 'done', stepRef: 'tool-2' });

    assert.equal(state.items.map((item) => item.type).join(','), 'user,tool,thinking,tool');
    const thinking = state.items[2]!;
    assert.equal(thinking.type, 'thinking');
    if (thinking.type === 'thinking') {
        assert.equal(thinking.text, 'Planning tool calls\nExecuting tool calls');
        assert.equal(thinking.streaming, true);
    }
});

test('new thinking after a tool does not merge into an earlier thinking block', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'run tools', 'run tools');
    appendThinkingTurnText(state, 'first thought', 'main');
    appendToolItem(state, 'Bash echo 1', { status: 'done', stepRef: 'tool-1' });
    appendThinkingTurnText(state, 'second thought', 'main');

    assert.equal(state.items.map((item) => item.type).join(','), 'user,thinking,tool,thinking');
    const first = state.items[1]!;
    const second = state.items[3]!;
    assert.equal(first.type, 'thinking');
    assert.equal(second.type, 'thinking');
    if (first.type === 'thinking' && second.type === 'thinking') {
        assert.equal(first.text, 'first thought');
        assert.equal(second.text, 'second thought');
    }
});

test('late thinking is inserted before same-turn final assistant text', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hello', 'hello');
    appendAssistantTurnText(state, 'Final answer', 'main');
    appendThinkingTurnText(state, 'Internal plan', 'main');

    assert.equal(state.items.map((item) => item.type).join(','), 'user,thinking,assistant');
});

test('agent_done with text but no prior chunks', () => {
    const state = createTranscriptState();
    startAssistantItem(state);
    appendToActiveAssistant(state, 'full response');
    finalizeAssistant(state);
    const item = state.items[0]!;
    if (item.type === 'assistant') {
        assert.equal(item.text, 'full response');
        assert.equal(item.streaming, false);
    }
});

test('ephemeral status replaces previous status', () => {
    const state = createTranscriptState();
    appendStatusItem(state, 'working...');
    assert.equal(state.items.length, 1);
    appendStatusItem(state, 'tool: read');
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0]!.type, 'status');
    if (state.items[0]!.type === 'status') {
        assert.equal(state.items[0]!.text, 'tool: read');
    }
});

test('clearEphemeralStatus removes trailing status', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hi', 'hi');
    appendStatusItem(state, 'working...');
    assert.equal(state.items.length, 2);
    clearEphemeralStatus(state);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0]!.type, 'user');
});

test('clearEphemeralStatus removes non-trailing status rows', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hi', 'hi');
    appendStatusItem(state, 'working...');
    appendAssistantTurnText(state, 'hello', 'main');

    assert.equal(state.items.map((item) => item.type).join(','), 'user,status,assistant');
    clearEphemeralStatus(state);
    assert.equal(state.items.map((item) => item.type).join(','), 'user,assistant');
});

test('clearEphemeralStatus does nothing when last item is not status', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'hi', 'hi');
    clearEphemeralStatus(state);
    assert.equal(state.items.length, 1);
});

test('full conversation flow', () => {
    const state = createTranscriptState();
    // User sends
    appendUserItem(state, 'hello', 'hello');
    // Status updates
    appendStatusItem(state, 'agent working...');
    appendStatusItem(state, 'read file.ts');
    // Assistant starts
    clearEphemeralStatus(state);
    startAssistantItem(state);
    appendToActiveAssistant(state, 'Hi! ');
    appendToActiveAssistant(state, 'How can I help?');
    finalizeAssistant(state);

    assert.equal(state.items.length, 2);
    assert.equal(state.items[0]!.type, 'user');
    assert.equal(state.items[1]!.type, 'assistant');
    if (state.items[1]!.type === 'assistant') {
        assert.equal(state.items[1]!.text, 'Hi! How can I help?');
        assert.equal(state.items[1]!.streaming, false);
    }
});

test('user item with paste (display differs from submit)', () => {
    const state = createTranscriptState();
    appendUserItem(state, 'fix this [Pasted text #1 +5 lines]', 'fix this\nline1\nline2\nline3\nline4\nline5');
    const item = state.items[0]!;
    if (item.type === 'user') {
        assert.equal(item.displayText, 'fix this [Pasted text #1 +5 lines]');
        assert.equal(item.submitText.includes('\n'), true);
    }
});
