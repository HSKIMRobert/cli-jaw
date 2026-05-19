// ─── Event Extraction (NDJSON parser) ────────────────

import { stripUndefined } from '../core/strip-undefined.js';
import type { SpawnContext, ToolEntry } from '../types/agent.js';
import {
    asCliEventArray,
    asCliEventRecord,
    fieldNumber,
    fieldString,
    isCliEventRecord,
    type CliEventRecord,
} from '../types/cli-events.js';
import { isClaudeLikeCli } from './cli-helpers.js';
import {
    syncLiveTools,
    emitAgentTool,
    pushTrace,
    logLine,
    toSingleLine,
    clipText,
    buildPreview,
    appendDetail,
    formatJsonDetail,
    buildClaudeThinkingTool,
    summarizeClaudeRateLimitEvent,
    summarizeToolInput,
    isOpencodeToolFailure,
    formatOpenCodeTaskDetail,
    extractText,
} from './events/helpers.js';
import { handleClaudeEvent, handleClaudeRateLimitEvent, finalizeClaudeRateLimitOnResult } from './events/claude.js';
import { handleCodexEvent } from './events/codex.js';
import { handleGeminiEvent } from './events/gemini.js';
import { handleGrokEvent } from './events/grok.js';
import { handleOpenCodeEvent } from './events/opencode.js';

// Re-export public API from adapter modules
export { flushClaudeBuffers } from './events/claude.js';
export { flushOpenCodeBuffers } from './events/opencode.js';
export { extractFromAcpUpdate, extractFromAcpSubagent } from './events/acp.js';
export { summarizeToolInput } from './events/helpers.js';

function toIndentedPreview(text: unknown, max = 200) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const clipped = raw.length > max ? `${raw.slice(0, max)}…` : raw;
    return clipped.replace(/\n/g, '\n  ');
}

export function extractSessionId(cli: string, event: CliEventRecord): string | null {
    switch (cli) {
        case 'claude':
        case 'claude-e': return event.type === 'system' ? event.session_id ?? null : null;
        case 'codex': return event.type === 'thread.started' ? event.thread_id ?? null : null;
        case 'gemini': return event.type === 'init' ? event.session_id ?? null : null;
        case 'grok': return event.type === 'end' ? event.sessionId ?? null : null;
        case 'opencode': return event.sessionID ?? null;
        default: return null;
    }
}

export function extractOutputChunk(cli: string, event: CliEventRecord, ctx?: SpawnContext): string {
    if (cli === 'gemini') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        // [#107] Skip thought/thinking events (future-proofing for when Gemini CLI adds them)
        if (event.type === 'thought' || event.thought === true) return '';
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
            // Skip message events with thought content parts (ACP path)
            if (Array.isArray(event.content)) {
                const textParts = asCliEventArray(event.content).filter((p) => p.type === 'text');
                return textParts.map((p) => String(p.text || '')).join('');
            }
            return String(event.content);
        }
        return '';
    }
    if (cli === 'opencode') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        return '';
    }
    if (cli === 'grok') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        if (event.type === 'text') return String(event.data || event.text || '');
        return '';
    }
    // claude-e transcript assistant records are snapshots; extractFromEvent
    // converts them to deltas so the append-only frontend does not duplicate text.
    if (cli === 'claude-e') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        return '';
    }
    // [P0-1.5] Codex: emit agent_message text as live chunk
    if (cli === 'codex') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            return String(event.item.text || '');
        }
        return '';
    }
    if (cli === 'copilot') {
        if (ctx?.pendingOutputChunk) {
            const chunk = ctx.pendingOutputChunk;
            ctx.pendingOutputChunk = '';
            return chunk;
        }
        if (typeof event.text === 'string') return event.text;
        if (typeof event.content === 'string') return event.content;
        if (event.type === 'assistant' && event.message?.content) {
            return event.message.content
                .filter((block) => block.type === 'text')
                .map((block) => String(block.text || ''))
                .join('');
        }
        return '';
    }
    return '';
}

export function extractFromEvent(cli: string, event: CliEventRecord, ctx: SpawnContext, agentLabel: string, empTag: Record<string, unknown> = {}) {
    // [P2-3.1] Claude system/init metadata: store model, tools, version
    if (isClaudeLikeCli(cli) && event.type === 'system') {
        if (event.model) ctx.model = event.model;
        if (!ctx.metadata) ctx.metadata = {};
        if (event.tools) ctx.metadata["tools"] = event.tools;
        if (event.mcp_servers) ctx.metadata["mcp_servers"] = event.mcp_servers;
        if (event.version) ctx.metadata["version"] = event.version;
    }

    // ── Claude stream buffer: thinking_delta + input_json_delta ──
    if (isClaudeLikeCli(cli) && event.type === 'stream_event') {
        const inner = event.event;

        // [P0-1.1] signature_delta: discard silently, do NOT trigger thinking flush.
        // [encrypted-thinking] Track signature length — used as evidence opus-4-7 reasoned server-side.
        if (inner?.type === 'content_block_delta' && inner.delta?.type === 'signature_delta') {
            const sig = inner.delta.signature;
            if (typeof sig === 'string') {
                ctx.claudeSignatureLen = (ctx.claudeSignatureLen || 0) + sig.length;
            }
            return;
        }

        // [P2-3.2] message_start: capture per-message input_tokens
        if (inner?.type === 'message_start' && inner.message?.usage) {
            if (!ctx.tokens) ctx.tokens = { input_tokens: 0, output_tokens: 0 };
            ctx.tokens["input_tokens"] = inner.message.usage.input_tokens ?? ctx.tokens["input_tokens"] ?? 0;
        }

        // Buffer thinking deltas
        if (inner?.type === 'content_block_delta' && inner.delta?.type === 'thinking_delta') {
            if (!ctx.claudeThinkingBuf) ctx.claudeThinkingBuf = '';
            ctx.claudeThinkingBuf += inner.delta.thinking || '';
            ctx.claudeThinkingHadDelta = true;
            return;
        }

        // [encrypted-thinking] Mark thinking block open so we can detect empty/encrypted case on stop.
        if (inner?.type === 'content_block_start' && inner.content_block?.type === 'thinking') {
            ctx.claudeThinkingBlockOpen = true;
            ctx.claudeThinkingHadDelta = false;
            ctx.claudeSignatureLen = 0;
        }

        // Buffer tool input JSON deltas
        if (inner?.type === 'content_block_delta' && inner.delta?.type === 'input_json_delta') {
            if (!ctx.claudeInputJsonBuf) ctx.claudeInputJsonBuf = '';
            ctx.claudeInputJsonBuf += inner.delta.partial_json || '';
            return;
        }

        // Track current tool name from content_block_start
        if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') {
            ctx.claudeCurrentToolName = inner.content_block.name || 'tool';
        }

        // [P1-2.1] message_delta: accumulate output_tokens from streaming usage
        if (inner?.type === 'message_delta' && inner.usage) {
            if (inner.usage.output_tokens != null) {
                if (!ctx.tokens) ctx.tokens = { input_tokens: 0, output_tokens: 0 };
                ctx.tokens["output_tokens"] = inner.usage.output_tokens;
            }
        }

        // content_block_stop → flush both buffers
        if (inner?.type === 'content_block_stop') {
            // Flush thinking
            if (ctx.claudeThinkingBuf) {
                const merged = ctx.claudeThinkingBuf.trim();
                if (merged) {
                    const tool = {
                        icon: '💭',
                        label: buildPreview(merged, 80) || 'thinking...',
                        toolType: 'thinking' as const,
                        detail: merged,
                    };
                    ctx.toolLog.push(tool);
                    syncLiveTools(ctx);
                    emitAgentTool(ctx, agentLabel, tool, empTag);
                }
                ctx.claudeThinkingBuf = '';
            } else if (ctx.claudeThinkingBlockOpen && !ctx.claudeThinkingHadDelta) {
                // [encrypted-thinking] opus-4-7: thinking block opened but only signature streamed, no plaintext.
                // Surface a badge so users know the model reasoned server-side even though the content is withheld.
                const sigLen = ctx.claudeSignatureLen || 0;
                const detail = sigLen > 0
                    ? `server-side reasoning, plaintext withheld — signature ${sigLen}B`
                    : 'server-side reasoning, plaintext withheld';
                const tool = {
                    icon: '🔒',
                    label: 'encrypted thinking',
                    toolType: 'thinking' as const,
                    detail,
                };
                ctx.toolLog.push(tool);
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, tool, empTag);
                pushTrace(ctx, `[${agentLabel || 'agent'}] 🔒 encrypted thinking (sig ${sigLen}B)`);
            }
            if (ctx.claudeThinkingBlockOpen) {
                ctx.claudeThinkingBlockOpen = false;
                ctx.claudeThinkingHadDelta = false;
                ctx.claudeSignatureLen = 0;
            }
            // Flush tool input → update existing tool label with detail
            if (ctx.claudeInputJsonBuf) {
                try {
                    const input = JSON.parse(ctx.claudeInputJsonBuf);
                    const toolName = ctx.claudeCurrentToolName || 'tool';
                    const detail = summarizeToolInput(toolName, input);  // full, no clip (max=0)
                    if (detail) {
                        // Find the last tool label for this tool and update its detail
                        const existing = [...ctx.toolLog].reverse().find(
                            (t: ToolEntry) => t.icon === '🔧' && t.label === toolName && !t.detail
                        );
                        if (existing) {
                            existing.detail = detail;
                            syncLiveTools(ctx);
                            // Re-broadcast with detail
                            emitAgentTool(ctx, agentLabel, existing, empTag);
                        }
                    }
                } catch { /* partial JSON */ }
                ctx.claudeInputJsonBuf = '';
                ctx.claudeCurrentToolName = '';
            }
        }

        // Non-block-stop but non-delta → flush thinking
        if (inner?.type !== 'content_block_stop' && ctx.claudeThinkingBuf) {
            const merged = ctx.claudeThinkingBuf.trim();
            if (merged) {
                const tool = {
                    icon: '💭',
                    label: buildPreview(merged, 80) || 'thinking...',
                    toolType: 'thinking' as const,
                    detail: merged,
                };
                ctx.toolLog.push(tool);
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, tool, empTag);
            }
            ctx.claudeThinkingBuf = '';
        }
    }

    const toolLabels = extractToolLabels(cli, event, ctx);
    for (const toolLabel of toolLabels) {
        // Dedupe: same logic as ACP path — skip already-seen tool keys
        const key = [
            toolLabel.icon,
            toolLabel.label,
            toolLabel.stepRef || '',
            toolLabel.status || '',
        ].join(':');
        if (ctx.seenToolKeys && ctx.seenToolKeys.has(key)) continue;
        if (ctx.seenToolKeys) ctx.seenToolKeys.add(key);

        // Resolve running → done/error: replace existing running entry in toolLog
        if (toolLabel.stepRef && (toolLabel.status === 'done' || toolLabel.status === 'error')) {
            const runIdx = ctx.toolLog.findIndex(
                (t: ToolEntry) => t.stepRef === toolLabel.stepRef && t.status === 'running'
            );
            if (runIdx !== -1) {
                ctx.toolLog[runIdx] = toolLabel;
                if (cli === 'opencode' && ctx.opencodePendingToolRefs) {
                    ctx.opencodePendingToolRefs = ctx.opencodePendingToolRefs.filter(ref => ref !== toolLabel.stepRef);
                }
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, toolLabel, empTag);
                continue;
            }
        }

        ctx.toolLog.push(toolLabel);
        if (cli === 'opencode' && toolLabel.stepRef && (!toolLabel.status || toolLabel.status === 'running')) {
            if (!ctx.opencodePendingToolRefs) ctx.opencodePendingToolRefs = [];
            if (!ctx.opencodePendingToolRefs.includes(toolLabel.stepRef)) ctx.opencodePendingToolRefs.push(toolLabel.stepRef);
        }
        syncLiveTools(ctx);
        emitAgentTool(ctx, agentLabel, toolLabel, empTag);
    }

    if (isClaudeLikeCli(cli) && (event.type === 'assistant' || event.type === 'result')) {
        finalizeClaudeRateLimitOnResult(ctx, agentLabel, empTag, event);
    }

    if (isClaudeLikeCli(cli) && event.type === 'rate_limit_event') {
        handleClaudeRateLimitEvent(ctx, agentLabel, empTag, event);
        return;
    }

    switch (cli) {
        case 'claude':
        case 'claude-e':
            handleClaudeEvent(event, ctx, cli, agentLabel, empTag);
            break;
        case 'codex':
            handleCodexEvent(event, ctx, agentLabel, empTag);
            break;
        case 'gemini':
            handleGeminiEvent(event, ctx, agentLabel, empTag);
            break;
        case 'grok':
            handleGrokEvent(event, ctx, agentLabel, empTag);
            break;
        case 'opencode':
            handleOpenCodeEvent(event, ctx, agentLabel, empTag);
            break;
    }
}

export function logEventSummary(agentLabel: string, cli: string, event: CliEventRecord, ctx: SpawnContext | null = null) {
    const item = event.item || event.part || {};

    if (cli === 'codex') {
        if (event.type === 'item.started' && item.type === 'command_execution') {
            logLine(`[${agentLabel}] cmd: ${(item.command || '').slice(0, 160)}`, ctx);
            return;
        }
        if (event.type === 'item.completed') {
            if (item.type === 'reasoning') {
                logLine(`[${agentLabel}] reasoning: ${toSingleLine(item.text).slice(0, 200)}`, ctx);
                return;
            }
            if (item.type === 'agent_message') {
                logLine(`[${agentLabel}] agent: ${toSingleLine(item.text).slice(0, 220)}`, ctx);
                return;
            }
            if (item.type === 'command_execution') {
                const cmd = (item.command || '').slice(0, 120);
                const exitCode = item.exit_code ?? '?';
                logLine(`[${agentLabel}] cmd: ${cmd} → exit ${exitCode}`, ctx);
                const outPreview = toIndentedPreview(item.aggregated_output, 260);
                if (outPreview) logLine(`  ${outPreview}`, ctx);
                return;
            }
            if (item.type === 'web_search') {
                const query = item.query || item.action?.query || '';
                logLine(`[${agentLabel}] search: ${toSingleLine(query).slice(0, 200)}`, ctx);
                return;
            }
        }
        if (event.type === 'turn.completed' && event.usage) {
            const u = event.usage;
            logLine(
                `[${agentLabel}] tokens: in=${(u.input_tokens ?? 0).toLocaleString()} `
                + `(cached=${(u.cached_input_tokens ?? 0).toLocaleString()}) `
                + `out=${(u.output_tokens ?? 0).toLocaleString()}`,
                ctx
            );
            return;
        }
    }

    if (isClaudeLikeCli(cli)) {
        // Real-time streaming events (--include-partial-messages)
        if (event.type === 'stream_event' && event.event) {
            const inner = event.event;
            if (inner.type === 'content_block_start' && inner.content_block) {
                const cb = inner.content_block;
                if (cb.type === 'tool_use') {
                    logLine(`[${agentLabel}] 🔧 ${cb.name || 'tool'}`, ctx);
                } else if (cb.type === 'thinking') {
                    logLine(`[${agentLabel}] 💭 thinking...`, ctx);
                }
            }
            return;
        }
        if (event.type === 'assistant' && event.message?.content) {
            if (ctx?.hasClaudeStreamEvents) return;
            for (const block of event.message.content) {
                if (block.type === 'tool_use') {
                    logLine(`[${agentLabel}] tool: ${block.name}`, ctx);
                } else if (block.type === 'thinking') {
                    const thinkingTool = buildClaudeThinkingTool(block);
                    logLine(`[${agentLabel}] ${thinkingTool.icon} ${thinkingTool.label}`, ctx);
                }
            }
            return;
        }
        if (event.type === 'result') {
            const cost = Number(event.total_cost_usd || 0).toFixed(4);
            const turns = event.num_turns ?? 0;
            const dur = ((event.duration_ms || 0) / 1000).toFixed(1);
            logLine(`[${agentLabel}] result: $${cost} / ${turns} turns / ${dur}s`, ctx);
            return;
        }
        if (event.type === 'rate_limit_event') {
            const summary = summarizeClaudeRateLimitEvent(event);
            if (summary) logLine(`[${agentLabel}] ${summary}`, ctx);
            return;
        }
    }

    // [P2-3.9] Gemini-specific logEventSummary
    if (cli === 'gemini') {
        if (event.type === 'init') {
            logLine(`[${agentLabel}] gemini init model=${event.model || '?'}`, ctx);
            return;
        }
        if (event.type === 'tool_use') {
            logLine(`[${agentLabel}] 🔧 ${event.tool_name || 'tool'}${event.parameters?.command ? `: ${String(event.parameters.command).slice(0, 120)}` : ''}`, ctx);
            return;
        }
        if (event.type === 'tool_result') {
            logLine(`[${agentLabel}] tool ${event.status || 'done'}: ${(event.tool_name || '')}`, ctx);
            return;
        }
        if (event.type === 'result') {
            const dur = ((event.stats?.duration_ms || 0) / 1000).toFixed(1);
            const calls = event.stats?.tool_calls ?? 0;
            logLine(`[${agentLabel}] result: ${calls} tool calls / ${dur}s`, ctx);
            return;
        }
    }

    if (cli === 'grok') {
        if (event.type === 'text') {
            logLine(`[${agentLabel}] grok text: ${toSingleLine(event.data || event.text).slice(0, 120)}`, ctx);
            return;
        }
        if (event.type === 'end') {
            logLine(`[${agentLabel}] grok end: ${event.stopReason || 'done'}`, ctx);
            return;
        }
    }

    if (event.type !== 'system') {
        logLine(`[${agentLabel}] ${cli}:${event.type}`, ctx);
    }
}

function makeClaudeToolKey(event: CliEventRecord, label: ToolEntry) {
    // Prefer the unique tool_use id (carried in stepRef) so multi-turn streams with
    // matching tool names across distinct messages don't collide on the per-message index.
    if (label.stepRef) return `claude:ref:${label.stepRef}:${label.icon}:${label.label}`;
    const msgId = event.message?.id || '';
    const idx = event.event?.["index"];
    if (msgId && idx !== undefined && idx !== null) return `claude:msg:${msgId}:${idx}:${label.icon}:${label.label}`;
    if (idx !== undefined && idx !== null) return `claude:idx:${idx}:${label.icon}:${label.label}`;
    if (msgId) return `claude:msg:${msgId}:${label.icon}:${label.label}`;
    return `claude:type:${event.type}:${label.icon}:${label.label}`;
}

function pushToolLabel(labels: ToolEntry[], label: ToolEntry, cli: string, event: CliEventRecord, ctx: SpawnContext | null) {
    if (cli !== 'claude' || !ctx?.seenToolKeys) {
        labels.push(label);
        return;
    }
    const key = makeClaudeToolKey(event, label);
    if (ctx.seenToolKeys.has(key)) return;
    ctx.seenToolKeys.add(key);
    labels.push(label);
}

// Returns array of tool labels (supports multiple blocks per event)
function extractToolLabels(cli: string, event: CliEventRecord, ctx: SpawnContext | null = null): ToolEntry[] {
    const item = event.item || event.part || event;
    const labels: ToolEntry[] = [];

    if (cli === 'codex' && (event.type === 'item.started' || event.type === 'item.completed') && item) {
        if (event.type === 'item.completed' && item.type === 'web_search') {
            const action = item.action?.type || '';
            if (action === 'search') {
                const query = item.query || item.action?.query || 'search';
                labels.push({ icon: '🔍', label: buildPreview(query, 60), toolType: 'search', detail: query });
            } else if (action === 'open_page') {
                const url = item.action?.url || '';
                try {
                    labels.push({ icon: '🌐', label: new URL(url).hostname, toolType: 'search', detail: url });
                } catch {
                    labels.push({ icon: '🌐', label: 'page', toolType: 'search', detail: url });
                }
            } else {
                const query = item.query || 'web';
                labels.push({ icon: '🔍', label: buildPreview(query, 60), toolType: 'search', detail: query });
            }
        }
        if (event.type === 'item.completed' && item.type === 'reasoning') {
            const detail = String(item.text || '').replace(/\*+/g, '').trim();
            labels.push({ icon: '💭', label: buildPreview(detail, 60) || 'thinking...', toolType: 'thinking', detail });
        }
        if (event.type === 'item.completed' && item.type === 'command_execution') {
            const command = String(item.command || 'exec');
            const output = item.aggregated_output ? String(item.aggregated_output) : '';
            const detail = output ? `$ ${command}\n${output}` : command;
            // [P0-1.4] Use item.id for unique stepRef (not command string)
            const ref = `codex:item:${item.id || command}`;
            // [P1-2.4] Include exit_code in label status
            const exitCode = item.exit_code;
            const failed = exitCode != null && exitCode !== 0;
            labels.push({
                icon: failed ? '❌' : '⚡',
                label: buildPreview(command, 40) || 'exec',
                toolType: 'tool',
                detail,
                stepRef: ref,
                status: failed ? 'error' : 'done',
                ...(exitCode != null ? { exitCode } : {}),
            });
        }
        if (item.type === 'collab_tool_call') {
            const tool = String(item.tool || item.name || 'subagent');
            const ref = `codex:collab:${item.id || tool}`;
            const isStarted = event.type === 'item.started' || item.status === 'in_progress';
            const receiverIds = Array.isArray(item.receiver_thread_ids) ? item.receiver_thread_ids.join(', ') : '';
            const detail = appendDetail(
                item["sender_thread_id"] ? `sender: ${item["sender_thread_id"]}` : '',
                receiverIds ? `receivers: ${receiverIds}` : '',
                formatJsonDetail('agents', item.agents_states),
                item.prompt ? `prompt: ${clipText(String(item.prompt), 300)}` : '',
            );
            labels.push({
                icon: isStarted ? '🤖' : '✅',
                label: isStarted ? `${tool}...` : `${tool} done`,
                toolType: 'subagent',
                stepRef: ref,
                status: isStarted ? 'running' : 'done',
                ...(detail ? { detail } : {}),
            });
        }
    }

    // [P0-1.3] Codex item.started: emit running label (paired with 1.4 stepRef)
    if (cli === 'codex' && event.type === 'item.started' && item) {
        if (item.type === 'command_execution') {
            const command = String(item.command || 'exec');
            const ref = `codex:item:${item.id || command}`;
            labels.push({ icon: '🔧', label: buildPreview(command, 40) || 'exec', toolType: 'tool', stepRef: ref, status: 'running' });
        }
    }

    if (isClaudeLikeCli(cli)) {
        if (event.type === 'system') {
            const status = String(event.status || '');
            const subtype = String(event.subtype || event.event || '');
            if (subtype === 'task_started') {
                const taskId = event.task_id || event.id || event.tool_use_id || 'unknown';
                const description = event.description || event.input?.description || event.task_type || 'subagent';
                const detail = appendDetail(
                    event.task_type ? `type: ${event.task_type}` : '',
                    event.tool_use_id ? `tool_use_id: ${event.tool_use_id}` : '',
                    event.prompt ? `prompt: ${clipText(String(event.prompt), 300)}` : '',
                );
                pushToolLabel(labels, {
                    icon: '🤖',
                    label: `subagent: ${buildPreview(description, 60)}`,
                    toolType: 'subagent',
                    stepRef: `claude:task:${taskId}`,
                    status: 'running',
                    ...(detail ? { detail } : {}),
                }, cli, event, ctx);
            }
            if (subtype === 'task_notification') {
                const taskId = event.task_id || event.id || event.tool_use_id || 'unknown';
                const rawStatus = String(event.status || 'completed');
                const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(rawStatus);
                const description = event.description || event.summary || event.task_type || 'subagent';
                const usage = event.usage || {};
                const usageDetail = [
                    usage.total_tokens != null ? `${usage.total_tokens} tok` : '',
                    usage["tool_uses"] != null ? `${usage["tool_uses"]} tools` : '',
                    usage.duration_ms != null ? `${(Number(usage.duration_ms) / 1000).toFixed(1)}s` : '',
                ].filter(Boolean).join(' · ');
                const detail = appendDetail(
                    event.summary ? `summary: ${event.summary}` : '',
                    event.output_file ? `output_file: ${event.output_file}` : '',
                    usageDetail,
                );
                pushToolLabel(labels, {
                    icon: failed ? '❌' : '✅',
                    label: `subagent: ${buildPreview(description, 60)}`,
                    toolType: 'subagent',
                    stepRef: `claude:task:${taskId}`,
                    status: failed ? 'error' : 'done',
                    ...(detail ? { detail } : {}),
                }, cli, event, ctx);
            }
            if (status === 'compacting' || subtype === 'compacting') {
                pushToolLabel(labels, { icon: '🗜️', label: 'compacting...', toolType: 'tool' }, cli, event, ctx);
            }
            if (status === 'compact_boundary' || subtype === 'compact_boundary' || event.compact_boundary === true) {
                pushToolLabel(labels, { icon: '✅', label: 'conversation compacted', toolType: 'tool', status: 'done' }, cli, event, ctx);
                if (ctx) ctx.cliNativeCompactDetected = true;
            }
        }
        if (event.type === 'stream_event' && event.event?.type === 'content_block_start') {
            if (ctx) ctx.hasClaudeStreamEvents = true;
            const cb = event.event.content_block;
            if (cb?.type === 'tool_use') {
                const isAgent = cb.name === 'Agent';
                pushToolLabel(labels, stripUndefined({
                    icon: isAgent ? '🤖' : '🔧',
                    label: isAgent ? 'subagent' : (cb.name || 'tool'),
                    toolType: isAgent ? 'subagent' : 'tool',
                    stepRef: cb.id ? `claude:tooluse:${cb.id}` : undefined,
                }), cli, event, ctx);
            }
            // thinking: don't emit placeholder — buffer in extractFromEvent will emit with real content
        }
        if (event.type === 'assistant' && event.message?.content && !ctx?.hasClaudeStreamEvents) {
            for (const block of event.message.content) {
                if (block.type === 'tool_use') {
                    const isAgent = block.name === 'Agent';
                    const description = block.input?.description || block.input?.["subagent_type"] || 'subagent';
                    pushToolLabel(labels, stripUndefined({
                        icon: isAgent ? '🤖' : '🔧',
                        label: isAgent ? `subagent: ${buildPreview(description, 60)}` : (block.name || 'tool'),
                        toolType: isAgent ? 'subagent' : 'tool',
                        stepRef: block.id ? `claude:tooluse:${block.id}` : undefined,
                        ...(isAgent && block.input?.prompt ? { detail: `prompt: ${clipText(String(block.input.prompt), 300)}` } : {}),
                    }), cli, event, ctx);
                }
                if (block.type === 'thinking') {
                    pushToolLabel(labels, buildClaudeThinkingTool(block), cli, event, ctx);
                }
            }
        }
    }

    if (cli === 'gemini') {
        if (event.type === 'tool_use') {
            const detail = event.parameters?.command || summarizeToolInput(event.tool_name || '', event.parameters || {}, 0);
            const suffix = event.parameters?.command ? `: ${buildPreview(event.parameters.command, 40)}` : '';
            const ref = event.tool_id
                ? `gemini:toolid:${event.tool_id}`
                : `gemini:tool:${event.tool_name || 'tool'}`;
            labels.push({ icon: '🔧', label: `${event.tool_name || 'tool'}${suffix}`, toolType: 'tool', detail, stepRef: ref });
        }
        if (event.type === 'tool_result') {
            const ref = event.tool_id
                ? `gemini:toolid:${event.tool_id}`
                : `gemini:tool:${event.tool_name || 'tool'}`;
            // [P1-2.5] Include tool result output in detail
            const output = event.output ? buildPreview(event.output, 200) : '';
            labels.push({
                icon: event.status === 'success' ? '✅' : '❌',
                label: `${event.status || 'done'}`,
                toolType: 'tool',
                stepRef: ref,
                status: event.status === 'success' ? 'done' : 'error',
                ...(output ? { detail: output } : {}),
            });
        }
    }

    if (cli === 'opencode') {
        const isTaskToolUse = event.type === 'tool_use' && event.part?.tool === 'task';
        const isTaskToolResult = event.type === 'tool_result'
            && event.part?.callID
            && ctx?.opencodeTaskCallIds?.has(event.part.callID);

        if (isTaskToolUse || isTaskToolResult) {
            const part = asCliEventRecord(event.part);
            const callID = part.callID || part.id || 'task';
            if (isTaskToolResult && !part.state) return labels;
            if (isTaskToolUse && ctx) {
                if (!ctx.opencodeTaskCallIds) ctx.opencodeTaskCallIds = new Set();
                ctx.opencodeTaskCallIds.add(callID);
            }
            const state = part.state || {};
            const input = state.input || {};
            const status = String(state.status || (event.type === 'tool_result' ? 'completed' : 'completed'));
            const failed = isOpencodeToolFailure(part) || ['error', 'failed', 'cancelled', 'canceled'].includes(status);
            const subagentType = input["subagent_type"] || 'general';
            const description = input.description || state.title || part.tool || 'task';
            const resultText = event.type === 'tool_result'
                ? extractText(part.content || part.output || state.output)
                : '';
            const detail = appendDetail(
                formatOpenCodeTaskDetail(part),
                resultText ? `result: ${resultText}` : '',
            );
            labels.push({
                icon: failed ? '❌' : (status === 'running' || status === 'in_progress' ? '🤖' : '✅'),
                label: `subagent[${subagentType}]: ${buildPreview(description, 60)}`,
                toolType: 'subagent',
                stepRef: `opencode:call:${callID}`,
                ...(detail ? { detail } : {}),
                status: failed ? 'error' : (status === 'running' || status === 'in_progress' ? 'running' : 'done'),
            });
            return labels;
        }

        if (event.type === 'tool_use' && event.part) {
            const ref = event.part.callID
                ? `opencode:call:${event.part.callID}`
                : `opencode:tool:${event.part.tool || 'tool'}`;
            const detail = summarizeToolInput(event.part.tool || '', event.part.state?.input || {}, 0)
                || String(event.part.state?.output || '').trim();
            const isDone = event.part.state?.status === 'completed';
            const exitCode = fieldNumber(event.part.state?.metadata?.["exit"]);
            const isFailed = isOpencodeToolFailure(event.part);
            const displayLabel = fieldString(event.part.state?.title || event.part.tool, 'tool');
            labels.push(stripUndefined({
                icon: isFailed ? '❌' : (isDone ? '✅' : '🔧'),
                label: displayLabel,
                toolType: 'tool',
                stepRef: ref,
                detail,
                status: isFailed ? 'error' : (isDone ? 'done' : undefined),
                ...(exitCode != null ? { exitCode } : {}),
            }));
        }
        if (event.type === 'tool_result' && event.part) {
            const ref = event.part.callID
                ? `opencode:call:${event.part.callID}`
                : `opencode:tool:${event.part.tool || 'tool'}`;
            labels.push({ icon: '✅', label: fieldString(event.part.tool, 'done'), toolType: 'tool', stepRef: ref, status: 'done' });
        }
    }

    return labels;
}

// Backward-compat: return first label or null
export function extractToolLabel(cli: string, event: CliEventRecord): ToolEntry | null {
    const labels = extractToolLabels(cli, event);
    return labels[0] ?? null;
}

// Test-only helpers (keep parser logic private for runtime flow)
export function extractToolLabelsForTest(cli: string, event: CliEventRecord, ctx: SpawnContext = {
    fullText: '',
    traceLog: [],
    toolLog: [],
    seenToolKeys: new Set<string>(),
    hasClaudeStreamEvents: false,
    sessionId: null,
    cost: null,
    turns: null,
    duration: null,
    tokens: null,
    stderrBuf: '',
}) {
    return extractToolLabels(cli, event, ctx);
}

export function makeClaudeToolKeyForTest(event: CliEventRecord, label: ToolEntry) {
    return makeClaudeToolKey(event, label);
}
