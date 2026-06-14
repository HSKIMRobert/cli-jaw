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
import { composeHelpOntoFrame, composePaletteOntoFrame, composeSelectorOntoFrame, composeBgtaskOntoFrame } from '../../../src/cli/tui/overlay.js';
import { composeSlashSurfaceLines } from '../../../src/cli/tui/slash-surface.js';
import { composeSettingsScreenLines } from '../../../src/cli/tui/settings-screen.js';
import { createScheduler } from '../../../src/cli/tui/render/scheduler.js';
import { Screen, registerScreenCleanup, VIEWPORT_FILL, type Frame } from '../../../src/cli/tui/render/frame.js';
import { solveLayout, type Regions } from '../../../src/cli/tui/render/layout.js';
import { parseSgrMouse, isMouseSequence } from '../../../src/cli/tui/render/mouse.js';
import { Viewport } from '../../../src/cli/tui/render/viewport.js';
import type { TranscriptItem } from '../../../src/cli/tui/transcript.js';
import { listLiveToolItems, toggleToolExpansion } from '../../../src/cli/tui/transcript.js';
import { clipTextToCols, visualWidth, cursorScreenPos, wrapTextToCols } from '../../../src/cli/tui/renderers.js';
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
            const maxDetailRows = 14;
            const detailWidth = Math.max(10, w - 4);
            const wrappedRows = detailLines.flatMap(line => wrapTextToCols(line, detailWidth));
            for (const line of wrappedRows.slice(0, maxDetailRows)) {
                rows.push(`${gutter}${c.dim}│ ${clipTextToCols(line, detailWidth)}${c.reset}`);
            }
            if (wrappedRows.length > maxDetailRows) {
                rows.push(`${gutter}${c.dim}└ … +${wrappedRows.length - maxDetailRows} lines${c.reset}`);
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
    return ov.helpOpen || ov.paletteOpen || ov.selector.open || ov.bgtaskOpen || ov.settingsOpen;
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

function blankLines(count: number): string[] {
    return new Array(Math.max(0, count)).fill('');
}

function renderLiveToolRows(ctx: TuiContext, cols: number, maxRows: number): string[] {
    if (maxRows <= 0) return [];
    const liveTools = listLiveToolItems(ctx.store.transcript);
    if (liveTools.length === 0) return [];
    const visible = liveTools.slice(0, Math.max(0, maxRows));
    const rows = visible.map(tool => clipTextToCols(renderToolLine(tool.icon, tool.label, tool.detail, 'pending'), cols));
    if (liveTools.length > visible.length && rows.length > 0) {
        rows[rows.length - 1] = clipTextToCols(`${c.dim}  … +${liveTools.length - visible.length} running tools${c.reset}`, cols);
    }
    return rows;
}

function renderChatRegion(ctx: TuiContext, viewport: Viewport, regions: Regions, cols: number, liveRows: string[] = []): string[] {
    if (ctx.store.overlay.settingsOpen) {
        return composeSettingsScreenLines({
            settings: ctx.settingsSnapshot,
            tuiConfig: ctx.tuiConfig,
            footerPreview: ctx.footer,
        }, {
            selected: ctx.store.overlay.settingsSelected,
            message: ctx.store.overlay.settingsMessage,
        }, {
            columns: cols,
            height: regions.transcript.height,
            cyanCode: c.cyan,
            dimCode: c.dim,
            boldCode: c.bold,
            resetCode: c.reset,
            clipTextToCols,
        });
    }
    const transcriptHeight = Math.max(1, regions.transcript.height - liveRows.length);
    const transcriptLines = viewport.composeRegion({ ...regions.transcript, height: transcriptHeight });
    const hasTranscript = transcriptLines.some(l => l !== '');
    if (hasTranscript) {
        const firstContent = transcriptLines.findIndex(line => line !== '');
        if (firstContent > 0) {
            const content = transcriptLines.slice(firstContent);
            return [
                ...content,
                ...blankLines(transcriptHeight - content.length),
                ...liveRows,
            ];
        }
        return [...transcriptLines, ...liveRows];
    }
    const welcome = (ctx.welcomeLines ?? [])
        .slice(0, transcriptHeight)
        .map(line => clipTextToCols(`  ${line}`, cols));
    return [
        ...welcome,
        ...blankLines(transcriptHeight - welcome.length),
        ...liveRows,
    ];
}

function renderHelpLine(cols: number): string {
    return clipTextToCols(`${c.dim}? for shortcuts · /help · /model · /settings${c.reset}`, cols);
}

function expandFrameRows(rows: string[], height: number): string[] {
    const idx = rows.indexOf(VIEWPORT_FILL);
    if (idx < 0) return rows;
    const out = [...rows];
    out.splice(idx, 1, ...blankLines(height - (rows.length - 1)));
    return out;
}

export function composeFrame(ctx: TuiContext, viewport: Viewport): Frame {
    const cols = process.stdout.columns || 80;
    const rows = getRows();
    const composerText = getComposerDisplayText(ctx.store.composer);
    const composerLines = Math.max(1, composerText.split('\n').length);
    const ac = ctx.store.autocomplete;
    const slashRows = composeSlashSurfaceLines(ac, {
        columns: cols,
        dimCode: c.dim,
        resetCode: c.reset,
        clipTextToCols,
    });
    const regions = solveLayout(cols, rows, composerLines, { commandSurfaceLines: slashRows.length });

    const ov = ctx.store.overlay;
    const liveRows = ov.helpOpen || ov.paletteOpen || ov.selector.open || ov.bgtaskOpen || ov.settingsOpen
        ? []
        : renderLiveToolRows(ctx, cols, Math.min(4, Math.max(0, regions.transcript.height - 1)));
    const transcriptHeight = Math.max(1, regions.transcript.height - liveRows.length);
    viewport.setItems(ctx.store.transcript.items, renderTranscriptItem, transcriptHeight);

    const chatRows = renderChatRegion(ctx, viewport, regions, cols, liveRows);
    const commandRows = slashRows
        .slice(0, regions.commandSurface.height)
        .map(line => clipTextToCols(line, cols));
    while (commandRows.length < regions.commandSurface.height) commandRows.push('');

    const frameRows: string[] = [
        VIEWPORT_FILL,
        ...chatRows,
        clipTextToCols(ctx.footer, cols),
        ...commandRows,
    ];

    // Input box with border — safe for narrow terminals
    const innerW = Math.max(6, cols - 4);
    const box = isInitialized() ? (() => { try { return getInteractive().theme?.boxSharp; } catch { return null; } })() : null;
    const bTL = box?.topLeft ?? '┌'; const bTR = box?.topRight ?? '┐';
    const bBL = box?.bottomLeft ?? '└'; const bBR = box?.bottomRight ?? '┘';
    const bH = box?.horizontal ?? '─'; const bV = box?.vertical ?? '│';
    const borderFill = Math.max(0, innerW);

    frameRows.push(clipTextToCols(`${c.dim}${bTL}${bH.repeat(borderFill)}${bTR}${c.reset}`, cols));

    const prefixVisW = 4; // │ > (space)
    const prefix = `${c.dim}${bV}${c.reset} ${ctx.accent}${c.bold}>${c.reset} `;
    const compLines = composerText.split('\n');
    const hasInput = composerText.trim().length > 0;
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
            frameRows.push(clipTextToCols(`${prefix}${c.dim}${placeholder}${c.reset}${phSuffix}`, cols));
        } else {
            const content = i === 0 ? `${prefix}${clipped}${suffix}` : `${c.dim}${bV}${c.reset}   ${clipped}${suffix}`;
            frameRows.push(clipTextToCols(content, cols));
        }
    }

    frameRows.push(clipTextToCols(`${c.dim}${bBL}${bH.repeat(borderFill)}${bBR}${c.reset}`, cols));
    frameRows.push(renderHelpLine(cols));

    // For overlays, we need a full-height array. Expand VIEWPORT_FILL now.
    const needsOverlay = ov.helpOpen || ov.paletteOpen || ov.selector.open || ov.bgtaskOpen;
    if (needsOverlay) {
        frameRows.splice(0, frameRows.length, ...expandFrameRows(frameRows, rows));
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
    const showCursor = ctx.inputActive && !needsOverlay && !ov.settingsOpen && !ctx.commandRunning;
    let cursorPos: Frame['cursorPos'];
    if (showCursor) {
        const cursorOff = getDisplayCursorOffset(ctx.store.composer);
        const curPos = cursorScreenPos(composerText, cursorOff, prefixVisW, prefixVisW, cols);
        cursorPos = {
            row: regions.composer.y - 1 + curPos.row,
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
                if (toggleToolExpansion(ctx.store.transcript)) scheduler.request();
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
