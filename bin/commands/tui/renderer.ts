/**
 * TUI rendering: prompt, block separators, footer.
 */
import { getComposerDisplayText, getDisplayCursorOffset } from '../../../src/cli/tui/composer.js';
import { closeAutocomplete } from '../../../src/cli/tui/overlay.js';
import { visualWidth, cursorScreenPos } from '../../../src/cli/tui/renderers.js';
import { resolveShellLayout, setupScrollRegion } from '../../../src/cli/tui/shell.js';
import { c, hrLine, getRows, type TuiContext } from './types.js';

export function rebuildFooter(ctx: TuiContext): void {
    ctx.footer = `  ${c.dim}${ctx.accent}${ctx.label}${c.reset}${c.dim}  |  /quit  |  /clear${c.reset}`;
    ctx.promptPrefix = `  ${ctx.accent}\u276F${c.reset} `;
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
    renderBlockSeparator();
    showPrompt(ctx);
}

export function reopenPromptLine(ctx: TuiContext): void {
    process.stdout.write('\n');
    showPrompt(ctx);
}

export function redrawPromptLine(ctx: TuiContext): void {
    const cols = process.stdout.columns || 80;
    const rows = Math.max(1, ctx.prevLineCount);
    // The terminal cursor may be left mid-block (row promptCursorRow) by a prior
    // mid-line render, so move to the top of the block before clearing.
    const atRow = Math.max(0, Math.min(ctx.promptCursorRow, rows - 1));
    if (atRow > 0) process.stdout.write(`\x1b[${atRow}A`);
    process.stdout.write('\r');
    for (let i = 0; i < rows; i++) {
        process.stdout.write('\x1b[2K');
        if (i < rows - 1) process.stdout.write('\x1b[1B');
    }
    if (rows > 1) process.stdout.write(`\x1b[${rows - 1}A`);
    process.stdout.write('\r');

    const displayText = getComposerDisplayText(ctx.store.composer);
    const lines = displayText.split('\n');
    const contPrefix = `  ${c.dim}\u00B7 ${c.reset}`;
    let totalRows = 0;
    for (let i = 0; i < lines.length; i++) {
        const prefix = i === 0 ? ctx.promptPrefix : contPrefix;
        const rendered = prefix + lines[i]!;
        process.stdout.write(rendered);
        if (i < lines.length - 1) process.stdout.write('\n');
        totalRows += Math.max(1, Math.ceil(visualWidth(rendered) / cols));
    }
    ctx.prevLineCount = totalRows;

    // Place the terminal cursor at the composer cursor (mid-line editing). After the
    // render loop the cursor sits at the end (row totalRows-1); move it up/left.
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
