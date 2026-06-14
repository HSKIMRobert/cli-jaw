/**
 * TUI overlays: dismiss, autocomplete, resize, slash commands.
 */
import {
    clearOverlayBox, renderHelpOverlay, renderCommandPalette, renderChoiceSelector,
    renderBgtaskOverlay, type BgtaskOverlayItem,
    clearAutocomplete, closeAutocomplete, resolveAutocompleteState,
    applyResolvedAutocompleteState, renderAutocomplete, popupTotalRows,
    makeSelectionKey, resetAutocompleteState,
} from '../../../src/cli/tui/overlay.js';
import {
    getPlainCommandDraft, setBracketedPaste,
    getTrailingTextSegment,
} from '../../../src/cli/tui/composer.js';
import { findAtMentionMatch, listRepoFiles } from '../../../src/cli/tui/file-mention.js';
import { clipTextToCols } from '../../../src/cli/tui/renderers.js';
import { tuiWrite } from './tui-io.js';
import {
    resolveShellLayout, setupScrollRegion, cleanupScrollRegion, ensureSpaceBelow,
} from '../../../src/cli/tui/shell.js';
import { executeCommand, getCompletionItems, getArgumentCompletionItems } from '../../../src/cli/commands.js';
import type { ArgumentCompletionItem } from '../../../src/cli/commands.js';
import type { ParsedSlashCommand } from '../../../src/cli/types.js';
import { buildAppearanceRows, nextAppearancePatch } from '../../../src/cli/tui/settings-screen.js';
import { getIdeCli } from '../../../src/ide/diff.js';
import { c, hrLine, getRows, renderCommandText, type TuiContext } from './types.js';
import { showPrompt, redrawPromptLine, openPromptBlock, rebuildFooter } from './renderer.js';
import { refreshInfo, makeCliCommandCtx } from './api.js';

export function closeAutocompleteForCtx(ctx: TuiContext): void {
    const ac = ctx.store.autocomplete;
    if (ctx.displayMode === 'fullscreen') {
        resetAutocompleteState(ac);
        return;
    }
    closeAutocomplete(ac, (chunk) => tuiWrite(ctx, chunk));
}

function paletteRenderOpts(ctx: TuiContext) {
    const ov = ctx.store.overlay;
    return {
        write: (chunk: string) => tuiWrite(ctx, chunk),
        cols: process.stdout.columns || 80,
        rows: getRows(),
        dimCode: c.dim,
        resetCode: c.reset,
        filter: ov.paletteFilter,
        items: ov.paletteItems,
        selected: ov.paletteSelected,
    };
}

function selectorRenderOpts(ctx: TuiContext) {
    const sel = ctx.store.overlay.selector;
    return {
        write: (chunk: string) => tuiWrite(ctx, chunk),
        cols: process.stdout.columns || 80,
        rows: getRows(),
        dimCode: c.dim,
        resetCode: c.reset,
        title: sel.title,
        subtitle: sel.subtitle,
        filter: sel.filter,
        items: sel.filteredItems,
        selected: sel.selected,
    };
}

export function openHelpOverlay(ctx: TuiContext): void {
    const ov = ctx.store.overlay;
    ov.helpOpen = true;
    closeAutocompleteForCtx(ctx);
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    const cmds = getCompletionItems('/', 'cli');
    ctx.overlayBoxHeight = renderHelpOverlay(
        (chunk) => tuiWrite(ctx, chunk),
        process.stdout.columns || 80,
        getRows(),
        c.dim, c.reset,
        cmds,
    );
}

export function openCommandPalette(ctx: TuiContext): void {
    const ov = ctx.store.overlay;
    ov.paletteOpen = true;
    ov.paletteFilter = '';
    ov.paletteSelected = 0;
    ov.paletteItems = getCompletionItems('/', 'cli');
    closeAutocompleteForCtx(ctx);
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    ctx.overlayBoxHeight = renderCommandPalette(paletteRenderOpts(ctx));
}

export function refreshCommandPalette(ctx: TuiContext): void {
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    ctx.overlayBoxHeight = renderCommandPalette(paletteRenderOpts(ctx));
}

export function openChoiceSelector(ctx: TuiContext, setup: () => void): void {
    setup();
    closeAutocompleteForCtx(ctx);
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    ctx.overlayBoxHeight = renderChoiceSelector(selectorRenderOpts(ctx));
}

export function openSettingsScreen(ctx: TuiContext): void {
    const ov = ctx.store.overlay;
    ov.settingsOpen = true;
    ov.settingsTab = 'appearance';
    ov.settingsSelected = 0;
    ov.settingsMessage = '';
    closeAutocompleteForCtx(ctx);
    void refreshInfo(ctx).finally(() => ctx.requestFrame?.());
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
    }
}

export async function applySettingsSelection(ctx: TuiContext): Promise<void> {
    const ov = ctx.store.overlay;
    const rows = buildAppearanceRows({
        settings: ctx.settingsSnapshot,
        tuiConfig: ctx.tuiConfig,
        footerPreview: ctx.footer,
    });
    const selected = Math.max(0, Math.min(ov.settingsSelected, rows.length - 1));
    ov.settingsSelected = selected;
    const row = rows[selected];
    if (!row) return;
    const patch = nextAppearancePatch(row, {
        settings: ctx.settingsSnapshot,
        tuiConfig: ctx.tuiConfig,
        footerPreview: ctx.footer,
    });
    if (!patch) {
        ov.settingsMessage = `${row.label} is read-only in this cycle`;
        ctx.requestFrame?.();
        return;
    }
    try {
        await makeCliCommandCtx(ctx).updateSettings(patch);
        const tuiPatch = patch['tui'];
        if (tuiPatch && typeof tuiPatch === 'object' && !Array.isArray(tuiPatch)) {
            ctx.tuiConfig = { ...ctx.tuiConfig, ...(tuiPatch as Record<string, unknown>) };
            if ((tuiPatch as Record<string, unknown>)['theme'] === 'dark' || (tuiPatch as Record<string, unknown>)['theme'] === 'light') {
                process.env['JAW_TUI_THEME'] = (tuiPatch as Record<string, string>)['theme'];
            }
        }
        await refreshInfo(ctx);
        rebuildFooter(ctx);
        ov.settingsMessage = `Saved ${row.label}`;
    } catch (error) {
        ov.settingsMessage = `Failed to save ${row.label}: ${error instanceof Error ? error.message : String(error)}`;
    }
    ctx.requestFrame?.();
}

export function refreshChoiceSelector(ctx: TuiContext): void {
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    ctx.overlayBoxHeight = renderChoiceSelector(selectorRenderOpts(ctx));
}

function bgtaskElapsed(startedAt: string | null): string {
    const start = Date.parse(startedAt ? `${startedAt.replace(' ', 'T')}Z` : '');
    if (!Number.isFinite(start)) return '';
    const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
}

/** Ctrl+O — server-owned background tasks (bgtask). Fetches fresh state so the
 * overlay is accurate even if SSE events were missed; falls back to the last
 * ws-pushed snapshot when the API call fails. */
export async function openBgtaskOverlay(ctx: TuiContext): Promise<void> {
    const ov = ctx.store.overlay;
    ov.bgtaskOpen = true;
    closeAutocompleteForCtx(ctx);
    let items: BgtaskOverlayItem[] = ctx.bgtaskTasks.map((t) => ({
        id: t.id, kind: t.kind, status: 'running', elapsed: bgtaskElapsed(t.startedAt),
    }));
    try {
        const res = await fetch(`${ctx.apiUrl}/api/bgtask?limit=10`);
        if (res.ok) {
            const body = await res.json() as { tasks?: Array<{ id: string; kind: string; status: string; startedAt: string | null }> };
            if (Array.isArray(body.tasks)) {
                items = body.tasks
                    .filter((t) => t.status === 'running' || t.status === 'complete' || t.status === 'failed' || t.status === 'cancelled' || t.status === 'orphaned')
                    .slice(0, 10)
                    .map((t) => ({
                        id: t.id, kind: t.kind, status: t.status,
                        elapsed: t.status === 'running' ? bgtaskElapsed(t.startedAt) : '',
                    }));
            }
        }
    } catch { /* fall back to ws snapshot */ }
    if (!ov.bgtaskOpen) return; // dismissed while fetching
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    ctx.overlayBoxHeight = renderBgtaskOverlay(
        (chunk) => tuiWrite(ctx, chunk),
        process.stdout.columns || 80,
        getRows(),
        c.dim, c.reset,
        items,
    );
}

export function dismissOverlay(ctx: TuiContext): void {
    const ov = ctx.store.overlay;
    if (!ov.helpOpen && !ov.paletteOpen && !ov.selector.open && !ov.bgtaskOpen && !ov.settingsOpen) return;
    if (ctx.displayMode === 'fullscreen') {
        ov.helpOpen = false;
        ov.bgtaskOpen = false;
        ov.paletteOpen = false;
        ov.settingsOpen = false;
        ov.settingsTab = 'appearance';
        ov.settingsSelected = 0;
        ov.settingsMessage = '';
        ov.paletteFilter = '';
        ov.paletteSelected = 0;
        ov.paletteItems = [];
        ov.selector.open = false;
        ov.selector.commandName = '';
        ov.selector.filter = '';
        ov.selector.selected = 0;
        ov.selector.allItems = [];
        ov.selector.filteredItems = [];
        ctx.requestFrame?.();
        return;
    }
    if (ctx.overlayBoxHeight > 0) {
        clearOverlayBox(
            (chunk) => tuiWrite(ctx, chunk),
            process.stdout.columns || 80,
            getRows(),
            ctx.overlayBoxHeight,
        );
        ctx.overlayBoxHeight = 0;
    }
    ov.helpOpen = false;
    ov.bgtaskOpen = false;
    ov.paletteOpen = false;
    ov.settingsOpen = false;
    ov.settingsTab = 'appearance';
    ov.settingsSelected = 0;
    ov.settingsMessage = '';
    ov.paletteFilter = '';
    ov.paletteSelected = 0;
    ov.paletteItems = [];
    ov.selector.open = false;
    ov.selector.commandName = '';
    ov.selector.filter = '';
    ov.selector.selected = 0;
    ov.selector.allItems = [];
    ov.selector.filteredItems = [];
    setupScrollRegion(
        ctx.footer,
        `  ${c.dim}${hrLine()}${c.reset}`,
        resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes),
    );
    showPrompt(ctx);
    redrawPromptLine(ctx);
}

export function getMaxPopupRows(): number {
    return Math.max(0, getRows() - 3);
}

export async function redrawInputWithAutocomplete(ctx: TuiContext): Promise<void> {
    const ac = ctx.store.autocomplete;
    const prevItem = ac.items[ac.selected];
    const prevKey = makeSelectionKey(prevItem, ac.stage);
    const slashDraft = getPlainCommandDraft(ctx.store.composer);
    let next;
    if (slashDraft !== null && slashDraft.startsWith('/')) {
        next = await resolveAutocompleteState({
            draft: slashDraft,
            prevKey,
            maxPopupRows: getMaxPopupRows(),
            maxRowsCommand: ac.maxRowsCommand,
            maxRowsArgument: ac.maxRowsArgument,
        });
    } else {
        const trailing = getTrailingTextSegment(ctx.store.composer);
        const mention = findAtMentionMatch(trailing.text, ctx.store.composer.cursor);
        if (mention && ctx.store.composer.segments.length === 1) {
            const items = listRepoFiles(ctx.chatCwd, mention.query);
            const headerRows = 1;
            const maxItemRows = Math.max(0, getMaxPopupRows() - headerRows);
            const visibleRows = Math.min(ac.maxRowsArgument, items.length, maxItemRows);
            next = items.length && visibleRows > 0
                ? {
                    open: true,
                    stage: 'argument',
                    contextHeader: '@ files',
                    items,
                    selected: Math.min(ac.selected, items.length - 1),
                    visibleRows,
                }
                : { open: false, items: [], selected: 0, visibleRows: 0 };
        } else {
            next = { open: false, items: [], selected: 0, visibleRows: 0 };
        }
    }

    if (ctx.displayMode === 'fullscreen') {
        applyResolvedAutocompleteState(ac, next);
        ctx.requestFrame?.();
        return;
    }

    clearAutocomplete(ac, (chunk) => tuiWrite(ctx, chunk));
    if (next.open) ensureSpaceBelow(popupTotalRows(next));
    redrawPromptLine(ctx);
    applyResolvedAutocompleteState(ac, next);
    renderAutocomplete(ac, {
        write: (chunk) => tuiWrite(ctx, chunk),
        columns: process.stdout.columns || 80,
        dimCode: c.dim,
        resetCode: c.reset,
        clipTextToCols,
    });
}

export function handleResize(ctx: TuiContext): void {
    setupScrollRegion(
        ctx.footer,
        `  ${c.dim}${hrLine()}${c.reset}`,
        resolveShellLayout(process.stdout.columns || 80, getRows(), ctx.store.panes),
    );
    if (!ctx.inputActive || ctx.commandRunning) return;
    redrawInputWithAutocomplete(ctx);
}

// ─── Slash command execution ─────────────────
export async function runSlashCommand(ctx: TuiContext, parsed: ParsedSlashCommand): Promise<void> {
    if (!parsed || parsed.type !== 'known') return;
    const ov = ctx.store.overlay;
    const ac = ctx.store.autocomplete;
    const panes = ctx.store.panes;

    // Overlay intercepts
    if (parsed.name === 'help') {
        openHelpOverlay(ctx);
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'model' && !parsed.args.length) {
        const argItems = await getArgumentCompletionItems('model', '', 'cli', [], makeCliCommandCtx(ctx));
        openChoiceSelector(ctx, () => {
            const sel = ov.selector;
            sel.open = true;
            sel.commandName = 'model';
            sel.title = 'Model';
            sel.subtitle = `${ctx.info.cli}: ${ctx.info.model || 'default'}`;
            sel.filter = '';
            sel.selected = 0;
            sel.allItems = argItems.map((a: ArgumentCompletionItem) => ({
                value: a.name, label: a.desc || '', current: a.name === ctx.info.model,
            }));
            sel.filteredItems = sel.allItems;
            const curIdx = sel.filteredItems.findIndex(i => i.current);
            if (curIdx >= 0) sel.selected = curIdx;
        });
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'cli' && !parsed.args.length) {
        const argItems = await getArgumentCompletionItems('cli', '', 'cli', [], makeCliCommandCtx(ctx));
        openChoiceSelector(ctx, () => {
            const sel = ov.selector;
            sel.open = true;
            sel.commandName = 'cli';
            sel.title = 'CLI Engine';
            sel.subtitle = `current: ${ctx.info.cli}`;
            sel.filter = '';
            sel.selected = 0;
            sel.allItems = argItems.map((a: ArgumentCompletionItem) => ({
                value: a.name, label: a.desc || '', current: a.name === ctx.info.cli,
            }));
            sel.filteredItems = sel.allItems;
            const curIdx = sel.filteredItems.findIndex(i => i.current);
            if (curIdx >= 0) sel.selected = curIdx;
        });
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'effort' && !parsed.args.length) {
        const levels = ['off', 'low', 'medium', 'high', 'max'];
        openChoiceSelector(ctx, () => {
            const sel = ov.selector;
            sel.open = true;
            sel.commandName = 'effort';
            sel.title = 'Reasoning Effort';
            sel.subtitle = 'Select thinking level';
            sel.filter = '';
            sel.selected = 2;
            sel.allItems = levels.map(l => ({ value: l, label: '', current: false }));
            sel.filteredItems = sel.allItems;
        });
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'resume' && !parsed.args.length) {
        try {
            const r = await fetch(`${ctx.apiUrl}/api/chat-sessions`, { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
                const data = (await r.json()) as { sessions?: Array<{ id: string; label?: string; createdAt?: string }> };
                const sessions = data.sessions || [];
                openChoiceSelector(ctx, () => {
                    const sel = ov.selector;
                    sel.open = true;
                    sel.commandName = 'resume';
                    sel.title = 'Resume Session';
                    sel.subtitle = `${sessions.length} sessions`;
                    sel.filter = '';
                    sel.selected = 0;
                    sel.allItems = sessions.map(s => ({
                        value: s.id,
                        label: s.label || s.createdAt || '',
                        current: false,
                    }));
                    sel.filteredItems = sel.allItems;
                });
                ctx.commandRunning = false;
                ctx.inputActive = true;
                return;
            }
        } catch { /* fallthrough to text handler */ }
    }

    if (parsed.name === 'commands') {
        openCommandPalette(ctx);
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'settings' && ctx.displayMode === 'fullscreen') {
        openSettingsScreen(ctx);
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    let exiting = false;
    try {
        const result = await executeCommand(parsed, makeCliCommandCtx(ctx));
        if (result?.code === 'clear_screen') {
            console.clear();
            setupScrollRegion(ctx.footer, `  ${c.dim}${hrLine()}${c.reset}`, resolveShellLayout(process.stdout.columns || 80, getRows(), panes));
        }
        if (result?.text) console.log(`  ${renderCommandText(result.text)}`);
        if (result?.code === 'ide_toggle') { ctx.ideEnabled = !ctx.ideEnabled; }
        if (result?.code === 'ide_on') { ctx.ideEnabled = true; }
        if (result?.code === 'ide_off') { ctx.ideEnabled = false; }
        if (result?.code && ['ide_toggle', 'ide_on', 'ide_off'].includes(result.code)) {
            console.log(`  ${ctx.ideEnabled ? c.green + '\u2713' : c.yellow + '\u2717'}${c.reset} IDE diff: ${ctx.ideEnabled ? 'ON' : 'OFF'}${ctx.isGit ? '' : ` ${c.dim}(non-git)${c.reset}`}`);
        }
        if (result?.code === 'ide_pop_toggle') {
            ctx.idePopEnabled = !ctx.idePopEnabled;
            const ideName = ctx.detectedIde ? getIdeCli(ctx.detectedIde) : null;
            console.log(`  ${ctx.idePopEnabled ? c.green + '\u2713' : c.yellow + '\u2717'}${c.reset} IDE popup: ${ctx.idePopEnabled ? 'ON' : 'OFF'}${ideName ? ` (${ideName})` : ` ${c.dim}(IDE \uBBF8\uAC10\uC9C0)${c.reset}`}`);
        }
        if (result?.ok && (parsed.name === 'model' || parsed.name === 'cli') && parsed.args.length > 0) {
            await refreshInfo(ctx);
            rebuildFooter(ctx);
        }
        if (result?.code === 'redraw') {
            if (ctx.displayMode === 'fullscreen') ctx.requestFrame?.();
            else rebuildFooter(ctx);
        }
        if (result?.code === 'retry') {
            const last = ctx.store.transcript.items.filter(i => i.type === 'user').pop();
            if (last && 'submitText' in last) {
                ctx.ws.send(JSON.stringify({ type: 'message', text: last.submitText }));
            }
        }
        if (result?.code === 'show_help') {
            openHelpOverlay(ctx);
        }
        if (result?.code === 'exit') {
            exiting = true;
            cleanupScrollRegion(resolveShellLayout(process.stdout.columns || 80, getRows(), panes));
            console.log(`  ${c.dim}Bye! \uD83E\uDD88${c.reset}\n`);
            setBracketedPaste(false);
            ctx.ws.close();
            process.stdin.setRawMode(false);
            process.exit(0);
        }
    } catch (err) {
        console.log(`  ${c.red}${(err as Error).message}${c.reset}`);
    } finally {
        if (!exiting) {
            ctx.commandRunning = false;
            ctx.inputActive = true;
            closeAutocomplete(ac, (chunk) => tuiWrite(ctx, chunk));
            openPromptBlock(ctx);
        }
    }
}
