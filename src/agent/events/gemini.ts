// Gemini CLI event adapter

import { isCliEventRecord } from '../../types/cli-events.js';
import type { CliEventRecord } from './types.js';
import type { SpawnContext } from './types.js';
import {
    syncLiveTools,
    emitAgentTool,
    pushTrace,
    buildPreview,
    appendAssistantTextSegment,
} from './helpers.js';

function appendGeminiAssistantTextSegment(ctx: SpawnContext, text: unknown, isDelta: boolean): string {
    const raw = String(text || '');
    if (!raw) return '';
    if (isDelta && ctx.geminiDeltaActive) {
        ctx.fullText += raw;
        return raw;
    }
    const segment = appendAssistantTextSegment(ctx, raw);
    ctx.geminiDeltaActive = isDelta;
    return segment;
}

function emitGeminiThought(
    ctx: SpawnContext,
    agentLabel: string,
    empTag: Record<string, unknown>,
    text: unknown,
): void {
    const detail = String(text || '').trim();
    if (!detail) return;
    const tool = {
        icon: '💭',
        label: buildPreview(detail, 80) || 'thinking...',
        toolType: 'thinking' as const,
        detail,
    };
    ctx.toolLog.push(tool);
    syncLiveTools(ctx);
    emitAgentTool(ctx, agentLabel, tool, empTag);
}

function extractGeminiThoughtText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter(isCliEventRecord)
            .filter((p) => p.type === 'thought' || p.type === 'thinking')
            .map((p) => String(p.thought || p.text || p.content || ''))
            .join('');
    }
    if (isCliEventRecord(content)) {
        return String(content.thought || content.text || content.content || '');
    }
    return '';
}

export function handleGeminiEvent(
    evt: CliEventRecord,
    ctx: SpawnContext,
    agentLabel: string,
    empTag: Record<string, unknown>,
): void {
    if (evt.type === 'init' && evt.model) {
        ctx.model = evt.model;
    }
    if (evt.type === 'tool_use' || evt.type === 'tool_result') {
        ctx.geminiDeltaActive = false;
    }
    if (evt.type === 'thought' || evt.thought === true) {
        if (ctx.showReasoning) {
            emitGeminiThought(ctx, agentLabel, empTag, evt.content || evt.thought || evt.text);
            pushTrace(ctx, `[${agentLabel}] gemini thought (visible)`);
        } else {
            pushTrace(ctx, `[${agentLabel}] gemini thought (hidden)`);
        }
        return;
    }
    if (evt.type === 'message' && evt.role === 'assistant') {
        if (Array.isArray(evt.content)) {
            if (ctx.showReasoning) {
                emitGeminiThought(ctx, agentLabel, empTag, extractGeminiThoughtText(evt.content));
            }
            const textOnly = evt.content
                .filter(isCliEventRecord)
                .filter((p) => p.type === 'text')
                .map((p) => String(p.text || ''))
                .join('');
            if (textOnly) {
                const segment = appendGeminiAssistantTextSegment(ctx, textOnly, !!evt.delta);
                ctx.pendingOutputChunk = (ctx.pendingOutputChunk || '') + segment;
                pushTrace(ctx, `[${agentLabel}] gemini text (filtered)`);
            }
            return;
        }
        if (evt.delta) {
            pushTrace(ctx, `[${agentLabel}] gemini delta text`);
        }
        const segment = appendGeminiAssistantTextSegment(ctx, evt.content || '', !!evt.delta);
        ctx.pendingOutputChunk = (ctx.pendingOutputChunk || '') + segment;
    } else if (evt.type === 'result') {
        ctx.geminiDeltaActive = false;
        ctx.geminiResultSeen = true;
        ctx.duration = evt.stats?.duration_ms ?? null;
        ctx.turns = evt.stats?.tool_calls ?? null;
        if (evt.stats) {
            ctx.tokens = {
                input_tokens: evt.stats.input_tokens ?? evt.stats.inputTokens ?? 0,
                output_tokens: evt.stats.output_tokens ?? evt.stats.outputTokens ?? 0,
                cached_tokens: evt.stats.cached ?? 0,
                total_tokens: evt.stats.total_tokens ?? evt.stats.totalTokens ?? 0,
            };
        }
    }
}
