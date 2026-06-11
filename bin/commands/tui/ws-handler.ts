/**
 * TUI WebSocket message handler.
 */
import type WebSocket from 'ws';
import {
    startAssistantItem, appendToActiveAssistant,
    finalizeAssistant, appendStatusItem, appendToolItem, clearEphemeralStatus,
} from '../../../src/cli/tui/transcript.js';
import { captureFileSet, diffFileSets, getDiffStat, getUnifiedDiff, getIdeCli, openDiffInIde } from '../../../src/ide/diff.js';
import { createStreamSink } from '../../../src/cli/tui/stream.js';
import { renderMarkdown } from '../../../src/cli/tui/markdown.js';
import { colorizeDiff } from '../../../src/cli/tui/diffview.js';
import { c, type TuiContext } from './types.js';
import { openPromptBlock, rebuildFooter } from './renderer.js';
import { dismissOverlay } from './overlays.js';

function isFullscreen(ctx: TuiContext): boolean {
    return ctx.displayMode === 'fullscreen';
}

function startFooterTimer(ctx: TuiContext): void {
    if (ctx.footerTimer) return;
    ctx.footerTimer = setInterval(() => {
        if (ctx.streamState === 'idle') {
            stopFooterTimer(ctx);
            return;
        }
        rebuildFooter(ctx);
    }, 500);
}

function stopFooterTimer(ctx: TuiContext): void {
    if (!ctx.footerTimer) return;
    clearInterval(ctx.footerTimer);
    ctx.footerTimer = null;
}

export function handleWsMessage(ctx: TuiContext, data: WebSocket.Data): void {
    const raw = data.toString();
    const ov = ctx.store.overlay;
    const transcript = ctx.store.transcript;
    try {
        const msg = JSON.parse(raw);
        switch (msg.type) {
            case 'agent_chunk':
            case 'agent_output':
                if (ov.helpOpen || ov.paletteOpen || ov.bgtaskOpen) dismissOverlay(ctx);
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                    break;
                }
                clearEphemeralStatus(transcript);
                if (!ctx.streaming) {
                    ctx.streaming = true;
                    ctx.streamState = 'responding';
                    ctx.turnStartedAt = Date.now();
                    rebuildFooter(ctx); // safe point: before the first chunk is written
                    startFooterTimer(ctx);
                    startAssistantItem(transcript);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write('\n');
                        ctx.streamSink = createStreamSink({
                            write: (s) => process.stdout.write(s),
                            width: Math.max(20, (process.stdout.columns || 80) - 4),
                            gutter: '  ',
                        });
                    }
                } else if (ctx.streamState === 'tool') {
                    ctx.streamState = 'responding';
                    rebuildFooter(ctx);
                }
                appendToActiveAssistant(transcript, msg.text || '');
                if (ctx.streamSink) {
                    ctx.streamSink.push(msg.text || '');
                } else if (isFullscreen(ctx)) {
                    ctx.requestFrame?.();
                }
                break;

            case 'agent_done':
                clearEphemeralStatus(transcript);
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                } else if (ctx.streaming) {
                    ctx.streamSink?.end();
                    ctx.streamSink = null;
                    finalizeAssistant(transcript);
                    if (!isFullscreen(ctx)) console.log('');
                } else if (msg.text) {
                    startAssistantItem(transcript);
                    appendToActiveAssistant(transcript, msg.text);
                    finalizeAssistant(transcript);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write('\n');
                        process.stdout.write(renderMarkdown(msg.text, { width: Math.max(20, (process.stdout.columns || 80) - 4), gutter: '  ' }));
                        console.log('');
                    }
                }
                // IDE diff
                if (ctx.isGit && ctx.preFileSetQueue.length > 0) {
                    const preSet = ctx.preFileSetQueue.shift()!;
                    if (ctx.ideEnabled) {
                        const postSet = captureFileSet(ctx.chatCwd);
                        const changed = diffFileSets(preSet, postSet);
                        if (changed.length > 0) {
                            const stat = getDiffStat(ctx.chatCwd, changed);
                            if (isFullscreen(ctx)) {
                                appendToolItem(transcript, `📂 ${changed.length} files changed`);
                                if (stat) appendToolItem(transcript, stat);
                            } else {
                                console.log(`\n  ${c.cyan}\uD83D\uDCC2 ${changed.length}\uAC1C \uD30C\uC77C \uBCC0\uACBD\uB428${c.reset}`);
                                if (stat) console.log(`  ${stat}`);
                                else for (const f of changed.slice(0, 10)) console.log(`  ${c.dim}  \u25E6 ${f}${c.reset}`);
                                if (changed.length > 10) console.log(`  ${c.dim}  ... +${changed.length - 10}\uAC1C${c.reset}`);
                                const colored = colorizeDiff(getUnifiedDiff(ctx.chatCwd, changed), { maxLines: 40, gutter: '  ' });
                                if (colored) console.log(colored);
                            }
                            if (ctx.idePopEnabled && ctx.detectedIde) {
                                if (!isFullscreen(ctx)) {
                                    console.log(`  ${c.dim}\u2192 ${getIdeCli(ctx.detectedIde)}\uC5D0\uC11C diff \uC5F4\uAE30${c.reset}`);
                                }
                                openDiffInIde(ctx.chatCwd, changed, ctx.detectedIde);
                            }
                        }
                    }
                }
                ctx.streaming = false;
                ctx.streamState = 'idle';
                stopFooterTimer(ctx);
                rebuildFooter(ctx); // safe point: turn finished, before reopening the prompt
                ctx.inputActive = true;
                openPromptBlock(ctx);
                break;

            case 'agent_status':
                if (msg.status === 'done') break;
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                } else if (msg.status === 'running') {
                    const name = msg.agentName || msg.agentId || 'agent';
                    appendStatusItem(transcript, `${name} working...`);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write(`\r  ${c.yellow}\u25CF${c.reset} ${c.dim}${name} working...${c.reset}          \r`);
                    } else {
                        ctx.requestFrame?.();
                    }
                }
                break;

            case 'agent_tool':
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                } else if (msg.icon && msg.label) {
                    // Persistent tool cell: drop a trailing transient status FIRST
                    // (else the status leaks once a tool item is the trailing one),
                    // then commit the tool line so it stays in scrollback.
                    clearEphemeralStatus(transcript);
                    appendToolItem(transcript, `${msg.icon} ${msg.label}`);
                    ctx.streamState = 'tool';
                    rebuildFooter(ctx);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write(`\r\x1b[2K  ${c.dim}${msg.icon} ${msg.label}${c.reset}\n`);
                    } else {
                        ctx.requestFrame?.();
                    }
                }
                break;

            case 'agent_fallback':
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                } else {
                    clearEphemeralStatus(transcript);
                    appendToolItem(transcript, `\u26A1 ${msg.from} \u2192 ${msg.to}`);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write(`\r\x1b[2K  ${c.yellow}\u26A1${c.reset} ${c.dim}${msg.from} \u2192 ${msg.to}${c.reset}\n`);
                    } else {
                        ctx.requestFrame?.();
                    }
                }
                break;

            case 'bgtask_update': {
                const runningTasks = Array.isArray(msg.running) ? msg.running : [];
                ctx.bgtaskCount = runningTasks.length;
                ctx.bgtaskTasks = runningTasks;
                const changed = msg.changed as { id: string; kind: string; status: string } | null;
                if (changed && changed.status !== 'running' && !ctx.isRaw) {
                    const ok = changed.status === 'complete';
                    const mark = ok ? `${c.green}\u2713` : `${c.red}\u2717`;
                    appendStatusItem(transcript, `bgtask ${changed.kind} ${changed.status}`);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write(`\r\x1b[2K  ${mark} bgtask ${changed.kind} ${changed.status}${c.reset}\n`);
                    }
                }
                rebuildFooter(ctx); // refresh the magenta count segment immediately
                if (isFullscreen(ctx)) ctx.requestFrame?.();
                break;
            }

            case 'queue_update':
                if (msg.pending > 0) {
                    appendStatusItem(transcript, `${msg.pending}\uAC1C \uB300\uAE30 \uC911`);
                    if (!isFullscreen(ctx)) {
                        process.stdout.write(`\r  ${c.yellow}\u23F3 ${msg.pending}\uAC1C \uB300\uAE30 \uC911${c.reset}          \r`);
                    } else {
                        ctx.requestFrame?.();
                    }
                }
                break;

            case 'new_message':
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                } else if (msg.source && msg.source !== 'cli') {
                    console.log(`\n  ${c.dim}[${msg.source}]${c.reset} ${(msg.content || '').slice(0, 60)}`);
                }
                break;

            default:
                if (ctx.isRaw) {
                    console.log(`  ${c.dim}${raw}${c.reset}`);
                }
                break;
        }
    } catch { /* ignore parse errors */ }
}
