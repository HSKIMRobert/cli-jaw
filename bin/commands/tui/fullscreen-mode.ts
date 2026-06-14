/**
 * Alt-screen TUI runner (Phase 4). Line-mode remains in chat.ts default path.
 */
import {
    consumePasteProtocol,
    getComposerDisplayText,
    getDisplayCursorOffset,
    setBracketedPaste,
} from '../../../src/cli/tui/composer.js';
import { renderMarkdown } from '../../../src/cli/tui/markdown.js';
import { renderMarkdownJawcode, isInitialized, getInteractive } from '../../../src/cli/tui/jawcode-render.js';
import { renderToolLine, renderThinkingCollapse } from '../../../src/cli/tui/jawcode-bridge.js';
import { classifyKeyAction, type KeyAction } from '../../../src/cli/tui/keymap.js';
import { getCompletionItems } from '../../../src/cli/commands.js';
import { composeAutocompleteLines, composeHelpOntoFrame, composePaletteOntoFrame, composeSelectorOntoFrame, composeBgtaskOntoFrame } from '../../../src/cli/tui/overlay.js';
import { createScheduler } from '../../../src/cli/tui/render/scheduler.js';
import { Screen, registerScreenCleanup, VIEWPORT_FILL, type Frame } from '../../../src/cli/tui/render/frame.js';
import { solveLayout, type Regions } from '../../../src/cli/tui/render/layout.js';
import { parseSgrMouse, isMouseSequence } from '../../../src/cli/tui/render/mouse.js';
import { Viewport } from '../../../src/cli/tui/render/viewport.js';
import type { TranscriptItem } from '../../../src/cli/tui/transcript.js';
import { toggleLatestToolExpansion } from '../../../src/cli/tui/transcript.js';
import { clipTextToCols, visualWidth, cursorScreenPos } from '../../../src/cli/tui/renderers.js';
import { cleanupScrollRegion, resolveShellLayout } from '../../../src/cli/tui/shell.js';
import type { TuiContext } from './types.js';
import { c, getRows, ESC_WAIT_MS } from './types.js';
import { handleKeyInput, flushPendingEscape } from './input-handler.js';
import { handleWsMessage } from './ws-handler.js';
import { redrawInputWithAutocomplete } from './overlays.js';
import { rebuildFooter } from './renderer.js';

export function renderTranscriptItem(item: TranscriptItem, width: number): string[] {
    const gutter = '  ';
    const w = Math.max(20, width - gutter.length);
    switch (item.type) {
        case 'user': {
            const lines = item.displayText.split('\n');
            return lines.map((line, index) => {
                const marker = index === 0
                    ? `${c.cyan}${c.bold}❯${c.reset}`
                    : `${c.dim}↳${c.reset}`;
                return `${gutter}${marker} ${clipTextToCols(line, w - 3)}`;
            });
        }
        case 'assistant': {
            const agentLabel = item.agentId ? `${c.dim}[${item.agentId}]${c.reset} ` : '';
            if (item.streaming && !item.text) {
                return [`${gutter}${agentLabel}${c.cyan}▍${c.reset}`];
            }
            const cursor = item.streaming ? `${c.cyan}▍${c.reset}` : '';
            const header = agentLabel ? `${gutter}${agentLabel}\n` : '';
            // Thinking block detection — jawcode collapses thinking to 1 line when not streaming
            const thinkMatch = !item.streaming && item.text.startsWith('<think');
            if (thinkMatch) {
                const thinkLines = item.text.split('\n').length;
                return [
                    ...(agentLabel ? [`${gutter}${agentLabel}`] : []),
                    renderThinkingCollapse(item.text, thinkLines, false),
                ];
            }
            const mdText = item.text + (cursor ? ` ${cursor}` : '');
            const body = isInitialized()
                ? renderMarkdownJawcode(mdText, w).join('\n')
                : renderMarkdown(mdText, { width: w, gutter });
            return (header + body).split('\n');
        }
        case 'thinking': {
            const agentLabel = item.agentId ? `${c.dim}[${item.agentId}]${c.reset} ` : '';
            const lineCount = item.text.split('\n').filter(Boolean).length || 1;
            const suffix = item.streaming ? ` ${c.cyan}▍${c.reset}` : '';
            return [
                ...(agentLabel ? [`${gutter}${agentLabel}`] : []),
                `${renderThinkingCollapse(item.text, lineCount, false)}${suffix}`,
            ];
        }
        case 'tool': {
            const [toolHead, ...toolRest] = item.text.split(':');
            const toolDetail = item.detail ?? toolRest.join(':').trim();
            const toolIcon = toolHead?.split(' ')[0] || '';
            const toolLabel = toolHead?.split(' ').slice(1).join(' ') || toolHead || '';
            const state = item.status === 'error'
                ? 'error' as const
                : item.status === 'done' ? 'done' as const : 'pending' as const;
            const detailLines = toolDetail.split('\n').map(line => line.trim()).filter(Boolean);
            const expandedDone = item.status === 'done' && item.collapsed === false && detailLines.length > 0;
            if (!expandedDone) {
                const safeDetail = detailLines.length > 1 ? `${detailLines[0]} … +${detailLines.length - 1} lines` : (detailLines[0] ?? '');
                return [renderToolLine(toolIcon, toolLabel, safeDetail, state)];
            }
            const rows = [renderToolLine(toolIcon, toolLabel, '', 'done')];
            const maxDetailRows = 8;
            for (const line of detailLines.slice(0, maxDetailRows)) {
                rows.push(`${gutter}${c.dim}│ ${clipTextToCols(line, Math.max(10, w - 2))}${c.reset}`);
            }
            if (detailLines.length > maxDetailRows) {
                rows.push(`${gutter}${c.dim}└ … +${detailLines.length - maxDetailRows} lines${c.reset}`);
            }
            return rows;
        }
        case 'status': {
            const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
            const spinChar = spinnerFrames[Math.floor(Date.now() / 80) % spinnerFrames.length] || '◌';
            return [`${gutter}${c.dim}${spinChar} ${item.text}${c.reset}`];
        }
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
    return ov.helpOpen || ov.paletteOpen || ov.selector.open || ov.bgtaskOpen;
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

    // Build content lines sequentially (bottom-up pinning via VIEWPORT_FILL)
    const contentLines: string[] = [];

    // 1. Transcript or Welcome
    const transcriptLines = viewport.composeRegion(regions.transcript);
    const hasTranscript = transcriptLines.some(l => l !== '');
    if (hasTranscript) {
        contentLines.push(...transcriptLines);
    } else if (ctx.welcomeLines && ctx.welcomeLines.length > 0) {
        for (const wl of ctx.welcomeLines) {
            contentLines.push(clipTextToCols(`  ${wl}`, cols));
        }
    }

    // 2. Autocomplete (between transcript and input)
    const ac = ctx.store.autocomplete;
    const acLines = composeAutocompleteLines(ac, {
        columns: cols,
        dimCode: c.dim,
        resetCode: c.reset,
        clipTextToCols,
    });
    if (acLines.length > 0) {
        contentLines.push(...acLines);
    }

    // 3. Input box with border — safe for narrow terminals
    const innerW = Math.max(6, cols - 4);
    const box = isInitialized() ? (() => { try { return getInteractive().theme?.boxSharp; } catch { return null; } })() : null;
    const bTL = box?.topLeft ?? '┌'; const bTR = box?.topRight ?? '┐';
    const bBL = box?.bottomLeft ?? '└'; const bBR = box?.bottomRight ?? '┘';
    const bH = box?.horizontal ?? '─'; const bV = box?.vertical ?? '│';
    const borderFill = Math.max(0, innerW);

    contentLines.push(clipTextToCols(`${c.dim}${bTL}${bH.repeat(borderFill)}${bTR}${c.reset}`, cols));

    const prefixVisW = 4; // │ > (space)
    const prefix = `${c.dim}${bV}${c.reset} ${ctx.accent}${c.bold}>${c.reset} `;
    const compLines = composerText.split('\n');
    const hasInput = composerText.trim().length > 0;
    const inputStartInContent = contentLines.length;
    for (let i = 0; i < regions.composer.height; i++) {
        const rawLine = compLines[i] ?? '';
        const maxTextW = Math.max(1, innerW - 4);
        const clipped = clipTextToCols(rawLine, maxTextW);
        const lineVisW = visualWidth(clipped);
        const padW = Math.max(0, innerW - 3 - lineVisW);
        const suffix = `${' '.repeat(padW)}${c.dim}${bV}${c.reset}`;
        if (i === 0 && !hasInput) {
            const placeholder = clipTextToCols('Type your message...', maxTextW);
            const phVisW = visualWidth(placeholder);
            const phPadW = Math.max(0, innerW - 3 - phVisW);
            const phSuffix = `${' '.repeat(phPadW)}${c.dim}${bV}${c.reset}`;
            contentLines.push(clipTextToCols(`${prefix}${c.dim}${placeholder}${c.reset}${phSuffix}`, cols));
        } else {
            const content = i === 0 ? `${prefix}${clipped}${suffix}` : `${c.dim}${bV}${c.reset}   ${clipped}${suffix}`;
            contentLines.push(clipTextToCols(content, cols));
        }
    }

    contentLines.push(clipTextToCols(`${c.dim}${bBL}${bH.repeat(borderFill)}${bBR}${c.reset}`, cols));

    // 4. Hint line
    contentLines.push(clipTextToCols(`${c.dim}? for shortcuts · /help · /model · /settings${c.reset}`, cols));

    // 5. Footer (StatusBar)
    contentLines.push(clipTextToCols(ctx.footer, cols));

    // Build the final frame: VIEWPORT_FILL at top pushes content to bottom
    const frameRows: string[] = [VIEWPORT_FILL, ...contentLines];

    // For overlays, we need a full-height array. Expand VIEWPORT_FILL now.
    const ov = ctx.store.overlay;
    const needsOverlay = ov.helpOpen || ov.paletteOpen || ov.selector.open || ov.bgtaskOpen;
    if (needsOverlay) {
        const fillIdx = frameRows.indexOf(VIEWPORT_FILL);
        if (fillIdx >= 0) {
            const contentCount = frameRows.length - 1;
            const fillCount = Math.max(0, rows - contentCount);
            frameRows.splice(fillIdx, 1, ...new Array(fillCount).fill(''));
        }
        if (ov.helpOpen) {
            const cmds = getCompletionItems('/', 'cli');
            composeHelpOntoFrame(frameRows, cols, frameRows.length, c.dim, c.reset, cmds);
        } else if (ov.paletteOpen) {
            composePaletteOntoFrame(
                frameRows, cols, frameRows.length, c.dim, c.reset,
                ov.paletteFilter, ov.paletteItems, ov.paletteSelected,
            );
        } else if (ov.selector.open) {
            const sel = ov.selector;
            composeSelectorOntoFrame(
                frameRows, cols, frameRows.length, c.dim, c.reset,
                sel.title, sel.subtitle, sel.filter, sel.filteredItems, sel.selected,
            );
        } else if (ov.bgtaskOpen) {
            composeBgtaskOntoFrame(
                frameRows, cols, frameRows.length, c.dim, c.reset,
                ctx.bgtaskTasks.map((t) => ({ id: t.id, kind: t.kind, status: 'running', elapsed: '' })),
            );
        }
    }

    // Calculate cursor position for the input box
    const showCursor = ctx.inputActive && !needsOverlay && !ctx.commandRunning;
    let cursorPos: Frame['cursorPos'];
    if (showCursor) {
        const cursorOff = getDisplayCursorOffset(ctx.store.composer);
        const curPos = cursorScreenPos(composerText, cursorOff, prefixVisW, prefixVisW, cols);
        const totalExpanded = Math.max(rows, contentLines.length);
        cursorPos = {
            row: totalExpanded - contentLines.length + inputStartInContent + curPos.row,
            col: curPos.col,
        };
    }

    const frame: Frame = { rows: frameRows };
    if (cursorPos) frame.cursorPos = cursorPos;
    return frame;
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
            screen.forceRedraw();
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
            if (action === 'ctrl-o') {
                if (toggleLatestToolExpansion(ctx.store.transcript)) scheduler.request();
                continue;
            }
            if (action === 'ctrl-l') {
                // Model selector — dispatch /model command
                handleKeyInput(ctx, '/');
                handleKeyInput(ctx, 'm');
                handleKeyInput(ctx, 'o');
                handleKeyInput(ctx, 'd');
                handleKeyInput(ctx, 'e');
                handleKeyInput(ctx, 'l');
                handleKeyInput(ctx, '\r');
                continue;
            }
            if (action === 'ctrl-r') {
                // Resume session — dispatch /resume
                handleKeyInput(ctx, '/');
                handleKeyInput(ctx, 'r');
                handleKeyInput(ctx, 'e');
                handleKeyInput(ctx, 's');
                handleKeyInput(ctx, 'u');
                handleKeyInput(ctx, 'm');
                handleKeyInput(ctx, 'e');
                handleKeyInput(ctx, '\r');
                continue;
            }
            if (action === 'ctrl-d') {
                if (!ctx.commandRunning && !ctx.inputActive) {
                    scheduler.dispose();
                    screen.disableMouse();
                    screen.exit();
                    process.exit(0);
                }
                continue;
            }
            if (handleScrollKey(ctx, viewport, action, regions)) {
                scheduler.request();
                continue;
            }
            const beforeTranscriptCount = ctx.store.transcript.items.length;
            handleKeyInput(ctx, token);
            if (ctx.store.transcript.items.length > beforeTranscriptCount) {
                viewport.followTail(true, currentRegions(ctx).transcript.height);
            }
            scheduler.request();
        }
    });

    ctx.ws.on('message', (data) => {
        handleWsMessage(ctx, data);
        if (ctx.streaming && viewport.isFollowingTail()) {
            viewport.followTail(true, currentRegions(ctx).transcript.height);
        }
        scheduler.request();
    });

    ctx.inputActive = true;
    scheduler.request();

    return new Promise<void>((resolve) => {
        ctx.ws.on('close', () => {
            scheduler.dispose();
            screen.disableMouse();
            screen.exit();
            cleanupScrollRegion(resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes));
            setBracketedPaste(false);
            process.stdin.setRawMode(false);
            resolve();
        });
    });
}
