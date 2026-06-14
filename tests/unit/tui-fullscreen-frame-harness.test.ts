import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFrame } from '../../bin/commands/tui/fullscreen-mode.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';
import { createTuiStore } from '../../src/cli/tui/store.ts';
import { appendTextToComposer } from '../../src/cli/tui/composer.ts';
import { appendAssistantTurnText, appendThinkingTurnText, appendToolItem, appendUserItem, finalizeStreamingAssistants } from '../../src/cli/tui/transcript.ts';
import { Viewport } from '../../src/cli/tui/render/viewport.ts';
import { VIEWPORT_FILL } from '../../src/cli/tui/render/frame.ts';
import { solveLayout } from '../../src/cli/tui/render/layout.ts';

function withTerminalSize<T>(cols: number, rows: number, fn: () => T): T {
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: cols, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true });
    try {
        return fn();
    } finally {
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
}

function makeCtx(): TuiContext {
    return {
        ws: { send() { /* no-op */ }, close() { /* no-op */ } },
        apiUrl: '',
        info: { cli: 'jwc', workingDir: '/tmp/project', model: 'test-model' },
        accent: '',
        label: 'jwc',
        dir: '/tmp/project',
        runtimeLocale: 'en',
        tuiConfig: { pasteCollapseLines: 2, pasteCollapseChars: 160 },
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
        footer: '  test footer',
        displayMode: 'fullscreen',
        requestFrame: null,
    } as unknown as TuiContext;
}

function expandViewportFill(rows: string[], height: number): string[] {
    const idx = rows.indexOf(VIEWPORT_FILL);
    if (idx === -1) return rows;
    const expanded = [...rows];
    expanded.splice(idx, 1, ...new Array(Math.max(0, height - (rows.length - 1))).fill(''));
    return expanded;
}

test('fullscreen composeFrame keeps frame rows newline-free and input pinned', () => {
    withTerminalSize(96, 28, () => {
        const ctx = makeCtx();
        appendUserItem(ctx.store.transcript, 'run\nwith two lines', 'run\nwith two lines');
        appendThinkingTurnText(ctx.store.transcript, 'thinking line 1\nthinking line 2', 'main');
        appendToolItem(ctx.store.transcript, '🔧 Bash npm test', {
            stepRef: 'bash-1',
            status: 'done',
            detail: 'line 1\nline 2\nline 3',
        });
        appendAssistantTurnText(ctx.store.transcript, 'Final answer after tools.', 'main');
        finalizeStreamingAssistants(ctx.store.transcript);

        const frame = composeFrame(ctx, new Viewport());
        assert.equal(frame.rows[0], VIEWPORT_FILL);
        assert.equal(frame.rows.some(row => row.includes('\n')), false);

        const expanded = expandViewportFill(frame.rows, 28);
        const regions = solveLayout(96, 28, 1);
        assert.equal(expanded.length, 28);
        assert.equal(expanded[regions.statusLine.y - 1], '  test footer');
        assert.match(expanded[regions.composer.y - 2] ?? '', /┌/);
        assert.match(expanded[regions.composer.y - 1] ?? '', /Type your message/);
        assert.match(expanded[regions.help.y - 1] ?? '', /shortcuts/);
        assert.deepEqual(frame.cursorPos, { row: regions.composer.y - 1, col: 4 });
    });
});

test('fullscreen composeFrame stays bottom-pinned after composer text changes', () => {
    withTerminalSize(80, 24, () => {
        const ctx = makeCtx();
        appendAssistantTurnText(ctx.store.transcript, 'Ready.', 'main');
        finalizeStreamingAssistants(ctx.store.transcript);
        appendTextToComposer(ctx.store.composer, 'next message');

        const frame = composeFrame(ctx, new Viewport());
        assert.equal(frame.rows.some(row => row.includes('\n')), false);
        const expanded = expandViewportFill(frame.rows, 24);
        const regions = solveLayout(80, 24, 1);
        assert.equal(expanded[regions.statusLine.y - 1], '  test footer');
        assert.match(expanded[regions.composer.y - 1] ?? '', /next message/);
        assert.match(expanded[regions.help.y - 1] ?? '', /shortcuts/);
        assert.equal(frame.cursorPos?.row, regions.composer.y - 1);
        assert.ok((frame.cursorPos?.col ?? 0) > 4);
    });
});

test('fullscreen composeFrame keeps composer cluster fixed after first message', () => {
    withTerminalSize(80, 24, () => {
        const ctx = makeCtx();
        ctx.welcomeLines = ['Welcome to jaw chat'];

        const regions = solveLayout(80, 24, 1);
        const before = expandViewportFill(composeFrame(ctx, new Viewport()).rows, 24);
        appendUserItem(ctx.store.transcript, 'hello', 'hello');
        const after = expandViewportFill(composeFrame(ctx, new Viewport()).rows, 24);

        assert.match(before[regions.transcript.y - 1] ?? '', /Welcome to jaw chat/);
        assert.match(after[regions.transcript.y - 1] ?? '', /hello/);
        assert.equal(before[regions.statusLine.y - 1], after[regions.statusLine.y - 1]);
        assert.equal(before[regions.composer.y - 2], after[regions.composer.y - 2]);
        assert.equal(before[regions.composer.y - 1], after[regions.composer.y - 1]);
        assert.equal(before[regions.help.y - 1], after[regions.help.y - 1]);
    });
});
