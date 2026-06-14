import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWsMessage } from '../../bin/commands/tui/ws-handler.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';
import { createTuiStore } from '../../src/cli/tui/store.ts';
import { renderStatusBar } from '../../src/cli/tui/jawcode-bridge.ts';

function makeCtx(): TuiContext {
    return {
        ws: { send() { /* no-op */ }, close() { /* no-op */ } },
        apiUrl: '',
        info: { cli: 'jwc', workingDir: '/tmp/project', model: 'test-model' },
        accent: '',
        label: 'jwc',
        dir: '/tmp/project',
        runtimeLocale: 'en',
        tuiConfig: { theme: 'dark', fullscreen: true, pasteCollapseLines: 2, pasteCollapseChars: 160 },
        settingsSnapshot: {},
        values: { port: '3457', raw: false, simple: false },
        isRaw: false,
        store: createTuiStore(),
        overlayBoxHeight: 0,
        inputActive: true,
        streaming: false,
        streamState: 'idle',
        bgtaskCount: 0,
        bgtaskTasks: [],
        turnStartedAt: 0,
        streamSink: null,
        commandRunning: false,
        escPending: false,
        escTimer: null,
        footerTimer: null,
        editorChordPending: false,
        prevLineCount: 1,
        promptCursorRow: 0,
        resizeTimer: null,
        ideEnabled: false,
        idePopEnabled: false,
        preFileSetQueue: [],
        chatCwd: '/tmp/project',
        isGit: false,
        detectedIde: null,
        promptPrefix: '  > ',
        footer: renderStatusBar({
            model: 'test-model',
            engine: 'jwc',
            engineAccent: '\x1b[36m',
            state: 'idle',
            cwd: '/tmp/project',
            port: 3457,
        }),
        displayMode: 'fullscreen',
        requestFrame: null,
    } as unknown as TuiContext;
}

function msg(value: Record<string, unknown>): Buffer {
    return Buffer.from(JSON.stringify(value));
}

function committedTools(ctx: TuiContext) {
    return ctx.store.transcript.items.filter(item => item.type === 'tool');
}

function assistantTexts(ctx: TuiContext): string[] {
    return ctx.store.transcript.items
        .filter(item => item.type === 'assistant')
        .map(item => item.type === 'assistant' ? item.text : '');
}

test('agent_done drains running live tools and keeps final answer after tool-only output', () => {
    const ctx = makeCtx();
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Bash', detail: 'date', status: 'running', stepRef: 's1' }));
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Read', detail: 'src/a.ts', status: 'running', stepRef: 's2' }));

    handleWsMessage(ctx, msg({ type: 'agent_done', text: 'Final answer after tools.' }));

    assert.equal(ctx.store.transcript.liveTools.length, 0);
    assert.equal(committedTools(ctx).length, 2);
    assert.deepEqual(assistantTexts(ctx), ['Final answer after tools.']);
    assert.equal(ctx.inputActive, true);
    assert.equal(ctx.streamState, 'idle');
});

test('agent_done toolLog updates duplicate stepRef detail without appending duplicate rows', () => {
    const ctx = makeCtx();
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Bash', detail: 'short', status: 'running', stepRef: 's1' }));
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Bash', detail: 'short', status: 'done', stepRef: 's1' }));

    handleWsMessage(ctx, msg({
        type: 'agent_done',
        text: 'Done.',
        toolLog: [{ icon: '🔧', label: 'Bash', detail: 'richer final output', status: 'done', stepRef: 's1' }],
    }));

    const tools = committedTools(ctx);
    assert.equal(tools.length, 1);
    const tool = tools[0]!;
    assert.equal(tool.type, 'tool');
    if (tool.type === 'tool') {
        assert.equal(tool.stepRef, 's1');
        assert.equal(tool.detail, 'richer final output');
        assert.equal(tool.status, 'done');
        assert.equal(tool.collapsed, true);
    }
});

test('agent_done appends only final suffix after streamed text around tools', () => {
    const ctx = makeCtx();
    handleWsMessage(ctx, msg({ type: 'agent_output', text: 'Partial' }));
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Bash', detail: 'echo', status: 'running', stepRef: 's1' }));

    handleWsMessage(ctx, msg({ type: 'agent_done', text: 'Partial final.' }));

    assert.equal(ctx.store.transcript.liveTools.length, 0);
    assert.equal(committedTools(ctx).length, 1);
    assert.deepEqual(assistantTexts(ctx), ['Partial', ' final.']);
    assert.equal(ctx.store.transcript.items.some(item => item.type === 'assistant' && item.streaming), false);
});

test('agent_done error drains remaining live tools as error rows', () => {
    const ctx = makeCtx();
    handleWsMessage(ctx, msg({ type: 'agent_tool', icon: '🔧', label: 'Bash', detail: 'npm test', status: 'running', stepRef: 's1' }));

    handleWsMessage(ctx, msg({ type: 'agent_done', text: 'Failed.', error: 'boom' }));

    const tool = committedTools(ctx)[0]!;
    assert.equal(tool.type, 'tool');
    if (tool.type === 'tool') {
        assert.equal(tool.status, 'error');
        assert.equal(tool.collapsed, true);
    }
    assert.deepEqual(assistantTexts(ctx), ['Failed.']);
});

