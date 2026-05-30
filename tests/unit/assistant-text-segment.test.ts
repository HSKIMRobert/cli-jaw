import test from 'node:test';
import assert from 'node:assert/strict';
import {
    appendAssistantTextSegment,
    formatAssistantTextSegment,
    formatPostToolAssistantLead,
    resolveSpawnOutputText,
} from '../../src/agent/events/helpers.ts';
import type { SpawnContext } from '../../src/types/agent.ts';

function baseCtx(overrides: Partial<SpawnContext> = {}): SpawnContext {
    return {
        fullText: '',
        traceLog: [],
        toolLog: [],
        seenToolKeys: new Set<string>(),
        hasClaudeStreamEvents: false,
        sessionId: null,
        cost: null,
        turns: null,
        duration: null,
        tokens: null,
        stderrBuf: '',
        ...overrides,
    };
}

test('formatAssistantTextSegment prefixes later segments with newline bullet', () => {
    const ctx = baseCtx();
    assert.equal(formatAssistantTextSegment(ctx, 'first'), 'first');
    assert.equal(formatAssistantTextSegment(ctx, 'second'), '\n- second');
});

test('appendAssistantTextSegment writes to liveOutputText when present', () => {
    const ctx = baseCtx({ liveOutputText: '', fullText: 'raw stdout noise\n' });
    assert.equal(appendAssistantTextSegment(ctx, 'hello'), 'hello');
    assert.equal(appendAssistantTextSegment(ctx, 'world'), '\n- world');
    assert.equal(ctx.liveOutputText, 'hello\n- world');
    assert.equal(ctx.fullText, 'raw stdout noise\n');
});

test('first assistant text after tools uses bullet lead when stream is still empty', () => {
    assert.equal(formatPostToolAssistantLead('Done.'), '- Done.');
});

test('resolveSpawnOutputText prefers longest plain-text preview source', () => {
    const ctx = {
        fullText: 'raw tool noise',
        liveOutputText: '- Done with details',
        kiroDisplayedText: 'Done with details',
        toolLog: [],
        traceLog: [],
        seenToolKeys: new Set<string>(),
        hasClaudeStreamEvents: false,
        sessionId: null,
        cost: null,
        turns: null,
        duration: null,
        tokens: null,
        stderrBuf: '',
    };
    assert.equal(resolveSpawnOutputText(ctx), '- Done with details');
});
