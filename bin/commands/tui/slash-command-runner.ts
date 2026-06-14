/**
 * Fullscreen/line-mode slash command execution.
 */
import { executeCommand, getArgumentCompletionItems } from '../../../src/cli/commands.js';
import type { ArgumentCompletionItem } from '../../../src/cli/commands.js';
import type { ParsedSlashCommand } from '../../../src/cli/types.js';
import { setBracketedPaste } from '../../../src/cli/tui/composer.js';
import { appendStatusItem } from '../../../src/cli/tui/transcript.js';
import { cleanupScrollRegion, resolveShellLayout, setupScrollRegion } from '../../../src/cli/tui/shell.js';
import { getIdeCli } from '../../../src/ide/diff.js';
import { c, getRows, hrLine, renderCommandText, type TuiContext } from './types.js';
import { rebuildFooter, openPromptBlock } from './renderer.js';
import { refreshInfo, makeCliCommandCtx } from './api.js';
import {
    closeAutocompleteForCtx,
    openChoiceSelector,
    openCommandPalette,
    openHelpOverlay,
    openSettingsScreen,
} from './overlays.js';

function appendFullscreenFeedback(ctx: TuiContext, text: string): void {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    appendStatusItem(ctx.store.transcript, normalized);
    ctx.requestFrame?.();
}

function clearFullscreenTranscript(ctx: TuiContext): void {
    ctx.store.transcript.items.length = 0;
    ctx.store.transcript.liveTools.length = 0;
    ctx.store.transcript.liveToolsExpanded = false;
    ctx.store.transcript.committedToolRefs.clear();
    ctx.requestFrame?.();
}

function openArgumentSelector(
    ctx: TuiContext,
    commandName: string,
    title: string,
    subtitle: string,
    items: ArgumentCompletionItem[],
): void {
    openChoiceSelector(ctx, () => {
        const sel = ctx.store.overlay.selector;
        sel.open = true;
        sel.commandName = commandName;
        sel.title = title;
        sel.subtitle = subtitle;
        sel.filter = '';
        sel.selected = 0;
        sel.allItems = items.map((a) => ({
            value: a.name,
            label: a.desc || '',
            current: a.name === (commandName === 'model' ? ctx.info.model : ctx.info.cli),
        }));
        sel.filteredItems = sel.allItems;
        const curIdx = sel.filteredItems.findIndex(i => i.current);
        if (curIdx >= 0) sel.selected = curIdx;
    });
    ctx.commandRunning = false;
    ctx.inputActive = true;
}

export async function runSlashCommand(ctx: TuiContext, parsed: ParsedSlashCommand): Promise<void> {
    if (!parsed || parsed.type !== 'known') return;
    const panes = ctx.store.panes;

    if (parsed.name === 'help') {
        openHelpOverlay(ctx);
        ctx.commandRunning = false;
        ctx.inputActive = true;
        return;
    }

    if (parsed.name === 'model' && !parsed.args.length) {
        const items = await getArgumentCompletionItems('model', '', 'cli', [], makeCliCommandCtx(ctx));
        openArgumentSelector(ctx, 'model', 'Model', `${ctx.info.cli}: ${ctx.info.model || 'default'}`, items);
        return;
    }

    if (parsed.name === 'cli' && !parsed.args.length) {
        const items = await getArgumentCompletionItems('cli', '', 'cli', [], makeCliCommandCtx(ctx));
        openArgumentSelector(ctx, 'cli', 'CLI Engine', `current: ${ctx.info.cli}`, items);
        return;
    }

    if (parsed.name === 'effort' && !parsed.args.length) {
        const levels = ['off', 'low', 'medium', 'high', 'max'];
        openChoiceSelector(ctx, () => {
            const sel = ctx.store.overlay.selector;
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
                    const sel = ctx.store.overlay.selector;
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
            if (ctx.displayMode === 'fullscreen') {
                clearFullscreenTranscript(ctx);
            } else {
                console.clear();
                setupScrollRegion(ctx.footer, `  ${c.dim}${hrLine()}${c.reset}`, resolveShellLayout(process.stdout.columns || 80, getRows(), panes));
            }
        }
        if (result?.text) {
            if (ctx.displayMode === 'fullscreen') appendFullscreenFeedback(ctx, result.text);
            else console.log(`  ${renderCommandText(result.text)}`);
        }
        if (result?.code === 'ide_toggle') { ctx.ideEnabled = !ctx.ideEnabled; }
        if (result?.code === 'ide_on') { ctx.ideEnabled = true; }
        if (result?.code === 'ide_off') { ctx.ideEnabled = false; }
        if (result?.code && ['ide_toggle', 'ide_on', 'ide_off'].includes(result.code)) {
            const message = `IDE diff: ${ctx.ideEnabled ? 'ON' : 'OFF'}${ctx.isGit ? '' : ' (non-git)'}`;
            if (ctx.displayMode === 'fullscreen') appendFullscreenFeedback(ctx, message);
            else console.log(`  ${ctx.ideEnabled ? c.green + '\u2713' : c.yellow + '\u2717'}${c.reset} ${message}`);
        }
        if (result?.code === 'ide_pop_toggle') {
            ctx.idePopEnabled = !ctx.idePopEnabled;
            const ideName = ctx.detectedIde ? getIdeCli(ctx.detectedIde) : null;
            const message = `IDE popup: ${ctx.idePopEnabled ? 'ON' : 'OFF'}${ideName ? ` (${ideName})` : ' (IDE \uBBF8\uAC10\uC9C0)'}`;
            if (ctx.displayMode === 'fullscreen') appendFullscreenFeedback(ctx, message);
            else console.log(`  ${ctx.idePopEnabled ? c.green + '\u2713' : c.yellow + '\u2717'}${c.reset} ${message}`);
        }
        if (result?.ok && (parsed.name === 'model' || parsed.name === 'cli') && parsed.args.length > 0) {
            await refreshInfo(ctx);
            rebuildFooter(ctx);
            if (ctx.displayMode === 'fullscreen') ctx.requestFrame?.();
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
        if (ctx.displayMode === 'fullscreen') appendFullscreenFeedback(ctx, (err as Error).message);
        else console.log(`  ${c.red}${(err as Error).message}${c.reset}`);
    } finally {
        if (!exiting) {
            ctx.commandRunning = false;
            ctx.inputActive = true;
            closeAutocompleteForCtx(ctx);
            openPromptBlock(ctx);
        }
    }
}
