// Codex CLI event adapter

import { stripUndefined } from '../../core/strip-undefined.js';
import { detectLongRunningToolTimeout } from '../tool-timeout.js';
import type { CliEventRecord } from './types.js';
import type { SpawnContext } from './types.js';
import {
    syncLiveTools,
    emitAgentTool,
    pushTrace,
    buildPreview,
    appendAssistantTextSegment,
} from './helpers.js';

export function handleCodexEvent(
    evt: CliEventRecord,
    ctx: SpawnContext,
    agentLabel: string,
    empTag: Record<string, unknown>,
): void {
    if (evt.type === 'turn.started') {
        pushTrace(ctx, `[${agentLabel}] codex turn started`);
    }
    if (evt.type === 'item.completed') {
        if (evt.item?.type === 'agent_message') {
            const text = String(evt.item.text || '');
            const segment = appendAssistantTextSegment(ctx, text);
            ctx.pendingOutputChunk = (ctx.pendingOutputChunk || '') + segment;
            if (segment.trim()) {
                const itemId = evt.item.id || '';
                const tool = stripUndefined({
                    icon: '💬',
                    label: buildPreview(segment, 80) || 'message',
                    toolType: 'tool' as const,
                    detail: segment,
                    stepRef: itemId ? `codex:item:${itemId}` : undefined,
                    status: 'done' as const,
                });
                const key = tool.stepRef || `codex:msg:${ctx.toolLog.length}:${segment.slice(0, 30)}`;
                if (!ctx.seenToolKeys || !ctx.seenToolKeys.has(key)) {
                    if (ctx.seenToolKeys) ctx.seenToolKeys.add(key);
                    ctx.toolLog.push(tool);
                    syncLiveTools(ctx);
                    emitAgentTool(ctx, agentLabel, tool, empTag);
                }
            }
        }
        if (evt.item?.type === 'command_execution') {
            const exitCode = evt.item.exit_code ?? '?';
            const itemId = evt.item.id || '';
            const ref = itemId ? `codex:item:${itemId}` : undefined;
            const existing = ref
                ? [...ctx.toolLog].reverse().find((t) => t.stepRef === ref)
                : null;
            if (existing) {
                existing.icon = exitCode === 0 ? '✅' : '❌';
                existing.status = exitCode === 0 ? 'done' : 'error';
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, existing, empTag);
            } else {
                const cmd = (evt.item.command || '').slice(0, 120);
                const fallbackRef = ref || `codex:item:done:${ctx.toolLog.length}`;
                const doneTool = {
                    icon: exitCode === 0 ? '✅' : '❌',
                    label: buildPreview(cmd, 80) || 'done',
                    toolType: 'tool' as const,
                    stepRef: fallbackRef,
                    status: (exitCode === 0 ? 'done' : 'error') as 'done' | 'error',
                };
                ctx.toolLog.push(doneTool);
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, doneTool, empTag);
            }
        }
        if (evt.item?.type === 'collab_tool_call'
            && ['spawn_agent', 'wait'].includes(String(evt.item.tool || evt.item.name || ''))) {
            ctx.hasActiveSubAgent = false;
        }
    } else if (evt.type === 'item.started') {
        if (evt.item?.type === 'command_execution') {
            const fullCommand = String(evt.item.command || '');
            const detectedTimeout = detectLongRunningToolTimeout(fullCommand);
            if (detectedTimeout) {
                const bufferMs = 600_000;
                ctx.stallWatchdog?.extendDeadline(
                    detectedTimeout.timeoutMs + bufferMs,
                    detectedTimeout.commandKind,
                );
                ctx.traceLog.push(
                    `[watchdog] extended for ${detectedTimeout.commandKind} by ${Math.round((detectedTimeout.timeoutMs + bufferMs) / 1000)}s`,
                );
            }
            const cmd = fullCommand.slice(0, 120);
            const itemId = evt.item.id || '';
            const tool = stripUndefined({
                icon: '⚡',
                label: buildPreview(cmd, 80) || 'command',
                toolType: 'tool' as const,
                detail: cmd,
                stepRef: itemId ? `codex:item:${itemId}` : undefined,
            });
            const key = `${tool.icon}:${tool.label}:${tool.stepRef || ''}:`;
            if (!ctx.seenToolKeys?.has(key)) {
                ctx.seenToolKeys?.add(key);
                ctx.toolLog.push(tool);
                syncLiveTools(ctx);
                emitAgentTool(ctx, agentLabel, tool, empTag);
            }
        }
        if (evt.item?.type === 'collab_tool_call'
            && ['spawn_agent', 'wait'].includes(String(evt.item.tool || evt.item.name || ''))) {
            ctx.hasActiveSubAgent = true;
        }
    } else if (evt.type === 'turn.completed' && evt.usage) {
        ctx.tokens = {
            input_tokens: evt.usage.input_tokens ?? 0,
            output_tokens: evt.usage.output_tokens ?? 0,
            cached_input_tokens: evt.usage.cached_input_tokens ?? 0,
        };
    } else if (evt.type === 'error' || evt.type === 'turn.failed') {
        const raw = evt.error?.message ?? evt.message ?? '';
        let msg = String(raw);
        try {
            const parsed = JSON.parse(msg);
            msg = parsed?.error?.message || parsed?.message || msg;
        } catch { /* raw string is fine */ }
        const tool = {
            icon: '❌',
            label: buildPreview(msg, 80) || 'codex error',
            toolType: 'tool' as const,
            detail: msg,
            status: 'error' as const,
        };
        ctx.toolLog.push(tool);
        syncLiveTools(ctx);
        emitAgentTool(ctx, agentLabel, tool, empTag);
        pushTrace(ctx, `[${agentLabel}] codex ${evt.type}: ${msg.slice(0, 200)}`);
    }
}
