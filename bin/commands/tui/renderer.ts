/**
 * TUI rendering: prompt, block separators, footer.
 */
import { getComposerDisplayText, getDisplayCursorOffset } from '../../../src/cli/tui/composer.js';
import { closeAutocomplete } from '../../../src/cli/tui/overlay.js';
import { visualWidth, cursorScreenPos } from '../../../src/cli/tui/renderers.js';
import { resolveShellLayout, setupScrollRegion } from '../../../src/cli/tui/shell.js';
import { c, hrLine, getRows, type TuiContext } from './types.js';
import { renderStatusLine } from '../../../src/cli/tui/jawcode-render.js';

const contPrefixFor = () => `  ${c.dim}\u00B7 ${c.reset}`;

/** Count wrapped visual rows for the composer block (line-mode). */
export function computeComposerVisualRows(
    displayText: string,
    cols: number,
    promptPrefix: string,
    contPrefix = contPrefixFor(),
): number {
    const lines = displayText.split('\n');
    let totalRows = 0;
    for (let i = 0; i < lines.length; i++) {
        const prefix = i === 0 ? promptPrefix : contPrefix;
        const rendered = prefix + (lines[i] ?? '');
        totalRows += Math.max(1, Math.ceil(visualWidth(rendered) / cols));
    }
    return Math.max(1, totalRows);
}

function clearTerminalRows(rows: number, cursorRow: number): void {
    const safeRows = Math.max(1, rows);
    const atRow = Math.max(0, Math.min(cursorRow, safeRows - 1));
    if (atRow > 0) process.stdout.write(`\x1b[${atRow}A`);
    process.stdout.write('\r');
    for (let i = 0; i < safeRows; i++) {
        process.stdout.write('\x1b[2K');
        if (i < safeRows - 1) process.stdout.write('\x1b[1B');
    }
    if (safeRows > 1) process.stdout.write(`\x1b[${safeRows - 1}A`);
    process.stdout.write('\r');
}

/** Erase the on-screen composer block and reset row tracking (line-mode). */
export function clearPromptBlock(ctx: TuiContext, rows = ctx.prevLineCount): void {
    if (ctx.displayMode === 'fullscreen') return;
    clearTerminalRows(Math.max(1, rows), ctx.promptCursorRow);
    ctx.prevLineCount = 1;
    ctx.promptCursorRow = 0;
    setupScrollRegion(
        ctx.footer,
        `  ${c.dim}${hrLine()}${c.reset}`,
        resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes),
    );
}

export function rebuildFooter(ctx: TuiContext): void {
    const elapsed = ctx.streamState !== 'idle' && ctx.turnStartedAt > 0
        ? Date.now() - ctx.turnStartedAt
        : undefined;
    const stateLabel = ctx.streamState === 'responding' ? 'responding…' : ctx.streamState === 'tool' ? 'working…' : 'idle';
    ctx.footer = renderStatusLine({
        model: ctx.info?.model,
        engine: ctx.label,
        engineAccent: ctx.accent,
        state: stateLabel,
        elapsed: elapsed && elapsed > 0 ? `${(elapsed / 1000).toFixed(1)}s` : undefined,
        bgtask: ctx.bgtaskCount,
        cwd: ctx.info?.workingDir,
    });
    ctx.promptPrefix = `  ${ctx.accent}${c.bold}\u276F${c.reset} `;
    if (ctx.displayMode === 'fullscreen') return;
    setupScrollRegion(
        ctx.footer,
        `  ${c.dim}${hrLine()}${c.reset}`,
        resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes),
    );
}

export function renderBlockSeparator(): void {
    process.stdout.write('\n');
    console.log(`  ${c.dim}${hrLine()}${c.reset}`);
}

export function renderAssistantTurnStart(): void {
    process.stdout.write('\n  ');
}

export function showPrompt(ctx: TuiContext): void {
    closeAutocomplete(ctx.store.autocomplete, (chunk) => process.stdout.write(chunk));
    ctx.prevLineCount = 1;
    ctx.promptCursorRow = 0;
    process.stdout.write(ctx.promptPrefix);
}

export function openPromptBlock(ctx: TuiContext): void {
    if (ctx.displayMode === 'fullscreen') {
        ctx.inputActive = true;
        ctx.requestFrame?.();
        return;
    }
    renderBlockSeparator();
    showPrompt(ctx);
}

export function reopenPromptLine(ctx: TuiContext): void {
    process.stdout.write('\n');
    showPrompt(ctx);
}

export function redrawPromptLine(ctx: TuiContext): void {
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    const cols = process.stdout.columns || 80;
    const oldRows = Math.max(1, ctx.prevLineCount);
    const displayText = getComposerDisplayText(ctx.store.composer);
    const contPrefix = contPrefixFor();
    const totalRows = computeComposerVisualRows(displayText, cols, ctx.promptPrefix, contPrefix);
    const clearRows = Math.max(oldRows, totalRows);

    clearTerminalRows(clearRows, ctx.promptCursorRow);

    const lines = displayText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const prefix = i === 0 ? ctx.promptPrefix : contPrefix;
        const rendered = prefix + lines[i]!;
        process.stdout.write(rendered);
        if (i < lines.length - 1) process.stdout.write('\n');
    }
    ctx.prevLineCount = totalRows;

    const pos = cursorScreenPos(
        displayText,
        getDisplayCursorOffset(ctx.store.composer),
        visualWidth(ctx.promptPrefix),
        visualWidth(contPrefix),
        cols,
    );
    const up = (totalRows - 1) - pos.row;
    if (up > 0) process.stdout.write(`\x1b[${up}A`);
    process.stdout.write('\r');
    if (pos.col > 0) process.stdout.write(`\x1b[${pos.col}C`);
    ctx.promptCursorRow = pos.row;
}
