import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFrame, renderTranscriptItem } from '../../bin/commands/tui/fullscreen-mode.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';
import { createTuiStore } from '../../src/cli/tui/store.ts';
import { appendTextToComposer } from '../../src/cli/tui/composer.ts';
import { appendAssistantTurnText, appendThinkingTurnText, appendToolItem, appendUserItem, finalizeStreamingAssistants } from '../../src/cli/tui/transcript.ts';
import { Viewport } from '../../src/cli/tui/render/viewport.ts';
import { VIEWPORT_FILL } from '../../src/cli/tui/render/frame.ts';
import { solveLayout } from '../../src/cli/tui/render/layout.ts';
import { renderStatusBar } from '../../src/cli/tui/jawcode-bridge.ts';

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
        tuiConfig: { theme: 'dark', fullscreen: true, pasteCollapseLines: 2, pasteCollapseChars: 160, keymapPreset: 'default', diffStyle: 'summary' },
        settingsSnapshot: { showReasoning: false, tui: { theme: 'dark', fullscreen: true } },
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

function expandViewportFill(rows: string[], height: number): string[] {
    const idx = rows.indexOf(VIEWPORT_FILL);
    if (idx === -1) return rows;
    const expanded = [...rows];
    expanded.splice(idx, 1, ...new Array(Math.max(0, height - (rows.length - 1))).fill(''));
    return expanded;
}

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
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
        assert.match(expanded[regions.statusLine.y - 1] ?? '', /\x1b\[(36|46)m/);
        assert.match(expanded[regions.statusLine.y - 1] ?? '', /test-model|jwc/);
        assert.match(expanded[regions.statusLine.y - 1] ?? '', /\/quit/);
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
        assert.match(expanded[regions.statusLine.y - 1] ?? '', /\/quit/);
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

test('fullscreen composeFrame renders slash surface without replacing transcript rows', () => {
    withTerminalSize(96, 28, () => {
        const ctx = makeCtx();
        appendAssistantTurnText(ctx.store.transcript, 'Transcript stays visible.', 'main');
        finalizeStreamingAssistants(ctx.store.transcript);
        ctx.store.autocomplete.open = true;
        ctx.store.autocomplete.stage = 'command';
        ctx.store.autocomplete.items = [
            { name: 'settings', desc: 'Open settings' },
            { name: 'model', desc: 'View/change model' },
        ];
        ctx.store.autocomplete.visibleRows = 2;
        ctx.store.autocomplete.selected = 0;

        const frame = composeFrame(ctx, new Viewport());
        const expanded = expandViewportFill(frame.rows, 28);
        const regions = solveLayout(96, 28, 1, { commandSurfaceLines: 2 });
        const joined = stripAnsi(expanded.join('\n'));

        const transcriptRegion = stripAnsi(expanded
            .slice(regions.transcript.y - 1, regions.statusLine.y - 1)
            .join('\n'));
        assert.match(transcriptRegion, /Transcript stays visible/);
        assert.match(stripAnsi(expanded[regions.statusLine.y - 1] ?? ''), /\/quit/);
        assert.match(stripAnsi(expanded[regions.commandSurface.y - 1] ?? ''), /\/settings/);
        assert.match(expanded[regions.commandSurface.y - 1] ?? '', /\x1b\[7m/);
        assert.match(expanded[regions.composer.y - 2] ?? '', /┌/);
        assert.match(expanded[regions.help.y - 1] ?? '', /shortcuts/);
        assert.doesNotMatch(joined, /Context/);
        assert.equal(frame.rows.some(row => row.includes('\n')), false);
    });
});

test('fullscreen composeFrame renders Appearance settings MVP in main content region', () => {
    withTerminalSize(96, 28, () => {
        const ctx = makeCtx();
        ctx.store.overlay.settingsOpen = true;

        const frame = composeFrame(ctx, new Viewport());
        const expanded = expandViewportFill(frame.rows, 28);
        const regions = solveLayout(96, 28, 1);
        const main = stripAnsi(expanded.slice(regions.transcript.y - 1, regions.statusLine.y - 1).join('\n'));

        assert.match(main, /Settings: Appearance/);
        assert.match(main, /Preview:/);
        assert.match(main, /Theme\s+dark/);
        assert.match(main, /Fullscreen Default\s+enabled/);
        assert.match(main, /Thinking Visibility\s+off/);
        assert.match(main, /Compact Density\s+normal/);
        assert.match(main, /Markdown Renderer/);
        assert.match(main, /Tool Rows/);
        assert.match(main, /Composer Pin/);
        assert.match(main, /Enter\/Space to change/);
        assert.doesNotMatch(main, /Context/);
        assert.match(stripAnsi(expanded[regions.statusLine.y - 1] ?? ''), /\/quit/);
        assert.match(expanded[regions.composer.y - 2] ?? '', /┌/);
        assert.match(expanded[regions.help.y - 1] ?? '', /shortcuts/);
        assert.equal(frame.cursorPos, undefined);
    });
});

test('fullscreen expanded tool detail wraps long output into physical frame rows', () => {
    withTerminalSize(64, 28, () => {
        const ctx = makeCtx();
        appendToolItem(ctx.store.transcript, '🔧 Bash long', {
            stepRef: 'long',
            status: 'done',
            detail: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz',
        });
        const tool = ctx.store.transcript.items[0]!;
        assert.equal(tool.type, 'tool');
        if (tool.type === 'tool') tool.collapsed = false;

        const frame = composeFrame(ctx, new Viewport());
        assert.equal(frame.rows.some(row => row.includes('\n')), false);
        const expanded = expandViewportFill(frame.rows, 28);
        const regions = solveLayout(64, 28, 1);
        const main = stripAnsi(expanded.slice(regions.transcript.y - 1, regions.statusLine.y - 1).join('\n'));

        assert.match(main, /abcdef/);
        assert.match(main, /012345/);
        assert.match(main, /uvwxyz/);
        assert.match(expanded[regions.statusLine.y - 1] ?? '', /\/quit/);
        assert.match(expanded[regions.composer.y - 2] ?? '', /┌/);
        assert.match(expanded[regions.help.y - 1] ?? '', /shortcuts/);
    });
});

test('fullscreen expanded tool detail applies a physical row cap', () => {
    const rows = renderTranscriptItem({
        type: 'tool',
        text: '🔧 Bash capped',
        timestamp: 0,
        status: 'done',
        collapsed: false,
        detail: 'x'.repeat(1000),
    }, 50);
    const plain = stripAnsi(rows.join('\n'));
    const detailRows = plain.split('\n').filter(line => line.includes('│'));

    assert.equal(rows.some(row => row.includes('\n')), false);
    assert.equal(detailRows.length, 14);
    assert.match(plain, /└ … \+\d+ lines/);
});
