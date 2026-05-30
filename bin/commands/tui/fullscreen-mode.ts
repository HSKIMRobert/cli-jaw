/**
 * Alt-screen TUI runner (Phase 4). Line-mode remains in chat.ts default path.
 */
import type WebSocket from 'ws';
import {
    consumePasteProtocol,
    getComposerDisplayText,
    setBracketedPaste,
} from '../../../src/cli/tui/composer.js';
import { renderMarkdown } from '../../../src/cli/tui/markdown.js';
import { classifyKeyAction, type KeyAction } from '../../../src/cli/tui/keymap.js';
import { getCompletionItems } from '../../../src/cli/commands.js';
import { composeAutocompleteLines, composeHelpOntoFrame, composePaletteOntoFrame, composeSelectorOntoFrame } from '../../../src/cli/tui/overlay.js';
import { createScheduler } from '../../../src/cli/tui/render/scheduler.js';
import { Screen, registerScreenCleanup, type Frame } from '../../../src/cli/tui/render/frame.js';
import { solveLayout, type Regions } from '../../../src/cli/tui/render/layout.js';
import { parseSgrMouse, isMouseSequence } from '../../../src/cli/tui/render/mouse.js';
import { Viewport } from '../../../src/cli/tui/render/viewport.js';
import type { TranscriptItem } from '../../../src/cli/tui/transcript.js';
import { clipTextToCols } from '../../../src/cli/tui/renderers.js';
import { cleanupScrollRegion, resolveShellLayout } from '../../../src/cli/tui/shell.js';
import type { TuiContext } from './types.js';
import { c, getRows, ESC_WAIT_MS } from './types.js';
import { handleKeyInput, flushPendingEscape } from './input-handler.js';
import { handleWsMessage } from './ws-handler.js';
import { redrawInputWithAutocomplete } from './overlays.js';
import { rebuildFooter } from './renderer.js';

function renderTranscriptItem(item: TranscriptItem, width: number): string[] {
    const gutter = '  ';
    const w = Math.max(20, width - gutter.length);
    switch (item.type) {
        case 'user':
            return [`${gutter}${c.dim}you:${c.reset} ${clipTextToCols(item.displayText, w - 5)}`];
        case 'assistant': {
            const body = item.streaming && !item.text
                ? `${gutter}${c.dim}…${c.reset}`
                : renderMarkdown(item.text, { width: w, gutter });
            return body.split('\n');
        }
        case 'tool':
            return [`${gutter}${c.dim}${item.text}${c.reset}`];
        case 'status':
            return [`${gutter}${c.yellow}${item.text}${c.reset}`];
        default:
            return [];
    }
}

function currentRegions(ctx: TuiContext): Regions {
    const cols = process.stdout.columns || 80;
    const rows = getRows();
    const composerLines = Math.max(1, getComposerDisplayText(ctx.store.composer).split('\n').length);
    return solveLayout(cols, rows, composerLines);
}

function overlayBlocksScroll(ctx: TuiContext): boolean {
    const ov = ctx.store.overlay;
    return ov.helpOpen || ov.paletteOpen || ov.selector.open;
}

function handleScrollKey(ctx: TuiContext, viewport: Viewport, action: KeyAction, regions: Regions): boolean {
    if (overlayBlocksScroll(ctx)) return false;
    const ac = ctx.store.autocomplete;
    if (ac.open && (action === 'page-up' || action === 'page-down' || action === 'arrow-up' || action === 'arrow-down')) {
        return false; // autocomplete consumes these
    }
    const h = regions.transcript.height;
    if (action === 'page-up') { viewport.pageUp(h); return true; }
    if (action === 'page-down') { viewport.pageDown(h); return true; }
    return false;
}

function handleMouseEvent(
    viewport: Viewport,
    regions: Regions,
    ev: { kind: string; row: number },
): boolean {
    if (ev.kind !== 'wheel-up' && ev.kind !== 'wheel-down') return false;
    if (ev.row < regions.transcript.y || ev.row >= regions.transcript.y + regions.transcript.height) return false;
    const h = regions.transcript.height;
    viewport.scrollBy(ev.kind === 'wheel-up' ? -3 : 3, h);
    return true;
}

function composeFrame(ctx: TuiContext, viewport: Viewport): Frame {
    const cols = process.stdout.columns || 80;
    const rows = getRows();
    const composerText = getComposerDisplayText(ctx.store.composer);
    const composerLines = Math.max(1, composerText.split('\n').length);
    const regions = solveLayout(cols, rows, composerLines);

    viewport.setItems(ctx.store.transcript.items, renderTranscriptItem, regions.transcript.height);

    const frameRows: string[] = new Array(rows).fill('');

    const transcriptLines = viewport.composeRegion(regions.transcript);
    for (let i = 0; i < transcriptLines.length; i++) {
        const row = regions.transcript.y + i;
        if (row >= 1 && row <= rows) frameRows[row - 1] = transcriptLines[i] ?? '';
    }

    const ac = ctx.store.autocomplete;
    const acLines = composeAutocompleteLines(ac, {
        columns: cols,
        dimCode: c.dim,
        resetCode: c.reset,
        clipTextToCols,
    });
    if (acLines.length > 0) {
        let row = regions.composer.y - acLines.length;
        for (const line of acLines) {
            if (row >= regions.transcript.y && row < regions.composer.y) {
                frameRows[row - 1] = line;
            }
            row += 1;
        }
    }

    const prefix = ctx.promptPrefix || `  ${ctx.accent}❯${c.reset} `;
    const compLines = composerText.split('\n');
    for (let i = 0; i < regions.composer.height; i++) {
        const row = regions.composer.y + i;
        if (row < 1 || row > rows) continue;
        const line = compLines[i] ?? '';
        frameRows[row - 1] = i === 0 ? prefix + line : `  ${c.dim}· ${c.reset}${line}`;
    }

    const footerRow = regions.footer.y;
    if (footerRow >= 1 && footerRow <= rows) {
        frameRows[footerRow - 1] = ctx.footer;
    }

    const ov = ctx.store.overlay;
    if (ov.helpOpen) {
        const cmds = getCompletionItems('/', 'cli');
        composeHelpOntoFrame(frameRows, cols, rows, c.dim, c.reset, cmds);
    } else if (ov.paletteOpen) {
        composePaletteOntoFrame(
            frameRows, cols, rows, c.dim, c.reset,
            ov.paletteFilter, ov.paletteItems, ov.paletteSelected,
        );
    } else if (ov.selector.open) {
        const sel = ov.selector;
        composeSelectorOntoFrame(
            frameRows, cols, rows, c.dim, c.reset,
            sel.title, sel.subtitle, sel.filter, sel.filteredItems, sel.selected,
        );
    }

    return { rows: frameRows };
}

export async function runFullscreenMode(ctx: TuiContext): Promise<void> {
    const screen = new Screen();
    registerScreenCleanup(screen);
    const viewport = new Viewport();
    viewport.setWidth(process.stdout.columns || 80);

    const scheduler = createScheduler(() => {
        rebuildFooter(ctx);
        screen.render(composeFrame(ctx, viewport));
    });

    ctx.displayMode = 'fullscreen';
    ctx.requestFrame = () => scheduler.request();

    rebuildFooter(ctx);
    screen.enter();
    screen.enableMouse();
    scheduler.request();

    process.stdin.setRawMode(true);
    setBracketedPaste(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdout.on('resize', () => {
        if (ctx.resizeTimer) clearTimeout(ctx.resizeTimer);
        ctx.resizeTimer = setTimeout(() => {
            ctx.resizeTimer = null;
            viewport.setWidth(process.stdout.columns || 80);
            scheduler.request();
        }, 50);
    });

    process.stdin.on('data', (rawKey) => {
        let incoming = rawKey as unknown as string;

        if (isMouseSequence(incoming)) {
            const parsed = parseSgrMouse(incoming);
            if (parsed) {
                const regions = currentRegions(ctx);
                if (handleMouseEvent(viewport, regions, parsed.event)) {
                    scheduler.request();
                    return;
                }
                incoming = incoming.slice(parsed.length);
                if (!incoming) return;
            }
        }

        if (ctx.escPending) {
            if (ctx.escTimer) clearTimeout(ctx.escTimer);
            ctx.escTimer = null;
            ctx.escPending = false;
            if (!incoming.startsWith('\x1b')) incoming = `\x1b${incoming}`;
        }
        if (incoming === '\x1b') {
            ctx.escPending = true;
            ctx.escTimer = setTimeout(() => flushPendingEscape(ctx), ESC_WAIT_MS);
            return;
        }
        if (ctx.commandRunning && !ctx.inputActive) return;

        const composer = ctx.store.composer;
        const beforeDisplay = getComposerDisplayText(composer);
        const tokens = consumePasteProtocol(incoming, ctx.store.pasteCapture, composer, {
            collapseLines: ctx.tuiConfig.pasteCollapseLines,
            collapseChars: ctx.tuiConfig.pasteCollapseChars,
        });
        const afterDisplay = getComposerDisplayText(composer);
        if (beforeDisplay !== afterDisplay) {
            if (!ctx.inputActive) {
                if (ctx.commandRunning) return;
                ctx.inputActive = true;
            }
            void redrawInputWithAutocomplete(ctx).then(() => scheduler.request());
            if (tokens.length === 0) return;
        }

        const regions = currentRegions(ctx);
        for (const token of tokens) {
            const action = classifyKeyAction(token);
            if (handleScrollKey(ctx, viewport, action, regions)) {
                scheduler.request();
                continue;
            }
            handleKeyInput(ctx, token);
            scheduler.request();
        }
    });

    ctx.ws.on('message', (data: WebSocket.RawData) => {
        handleWsMessage(ctx, data);
        if (ctx.streaming && viewport.isFollowingTail()) {
            viewport.followTail(true, currentRegions(ctx).transcript.height);
        }
        scheduler.request();
    });

    ctx.ws.on('close', () => {
        scheduler.dispose();
        screen.disableMouse();
        screen.exit();
        cleanupScrollRegion(resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes));
        setBracketedPaste(false);
        process.stdin.setRawMode(false);
        process.exit(0);
    });

    ctx.inputActive = true;
    scheduler.request();
}
