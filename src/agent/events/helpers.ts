// Cross-adapter shared utilities used by 2+ event adapter modules.

import { broadcast } from '../../core/bus.js';
import {
    asCliEventArray,
    asCliEventRecord,
    fieldNumber,
    fieldString,
    isCliEventRecord,
} from '../../types/cli-events.js';
import type { CliEventRecord } from '../../types/cli-events.js';
import type { SpawnContext, ToolEntry } from '../../types/agent.js';
import { replaceLiveRunTools, appendLiveRunTool } from '../live-run-state.js';
import { stampTraceToolEntries } from '../../trace/store.js';

// ─── Core utilities (used by ALL adapters) ───────────

export function liveScopeOf(ctx: SpawnContext): string | null {
    return ctx.liveScope ?? null;
}

export function syncLiveTools(ctx: SpawnContext): void {
    stampTraceToolEntries(ctx);
    const scope = liveScopeOf(ctx);
    if (scope) replaceLiveRunTools(scope, ctx.toolLog);
    if (ctx.parentLiveScope) {
        const synced = ctx._parentSyncedCount || 0;
        const total = ctx.toolLog.length;
        for (let i = synced; i < total; i++) {
            appendLiveRunTool(ctx.parentLiveScope, { ...ctx.toolLog[i], isEmployee: true });
        }
        ctx._parentSyncedCount = total;
    }
}

export function emitAgentTool(
    ctx: SpawnContext,
    agentLabel: string | undefined,
    tool: object,
    empTag: Record<string, unknown>,
): void {
    broadcast(
        'agent_tool',
        { agentId: agentLabel, ...tool, ...empTag },
        ctx.traceAudience === 'internal' ? 'internal' : 'public',
    );
}

export function pushTrace(ctx: SpawnContext | null | undefined, line: string) {
    if (!ctx?.traceLog || !line) return;
    ctx.traceLog.push(line);
}

export function logLine(line: string, ctx: SpawnContext | null | undefined) {
    console.log(line);
    pushTrace(ctx, line);
}

// ─── Text formatting ─────────────────────────────────

export function toSingleLine(text: unknown) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

export function clipText(text: string, max: number) {
    if (!max || max < 1) return text;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildPreview(text: unknown, max = 80) {
    return clipText(toSingleLine(text), max);
}

export function appendDetail(...parts: Array<string | null | undefined>): string {
    return parts.map(p => String(p || '').trim()).filter(Boolean).join('\n');
}

export function formatJsonDetail(label: string, value: unknown): string {
    if (value == null) return '';
    try {
        return `${label}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`;
    } catch {
        return `${label}: ${String(value)}`;
    }
}

// ─── Assistant text segment helpers ──────────────────

export function formatAssistantTextSegment(ctx: SpawnContext, text: unknown): string {
    const raw = String(text || '');
    if (!raw) return '';
    if (!ctx.outputTextStarted) {
        ctx.outputTextStarted = true;
        return raw;
    }
    if (/\s$/.test(ctx.fullText) || /^\s/.test(raw) || /^[,.;:!?)]/.test(raw) || /^-\S/.test(raw)) return raw;
    return raw.startsWith('- ') || raw.startsWith('* ')
        ? `\n${raw}`
        : `\n- ${raw}`;
}

export function appendAssistantTextSegment(ctx: SpawnContext, text: unknown): string {
    const segment = formatAssistantTextSegment(ctx, text);
    if (!segment) return '';
    ctx.fullText += segment;
    return segment;
}

export function extractAssistantText(event: CliEventRecord): string {
    if (!event.message?.content) return '';
    const parts: string[] = [];
    for (const block of asCliEventArray(event.message.content)) {
        if (block.type === 'text' && typeof block.text === 'string') {
            parts.push(block.text);
        }
    }
    return parts.join('');
}

// ─── Claude cross-module helpers ─────────────────────
// Used by claude.ts, summary.ts, and/or tool-labels.ts

export function buildClaudeThinkingTool(block: CliEventRecord): ToolEntry {
    const text = String(block.thinking || '').trim();
    const signature = typeof block.signature === 'string' ? block.signature : '';
    if (text) {
        return {
            icon: '💭',
            label: buildPreview(text, 80) || 'thinking...',
            toolType: 'thinking',
            detail: text,
        };
    }
    if (signature) {
        return {
            icon: '🔒',
            label: 'encrypted thinking',
            toolType: 'thinking',
            detail: `server-side reasoning, plaintext withheld - signature ${signature.length}B`,
        };
    }
    return {
        icon: '💭',
        label: 'thinking...',
        toolType: 'thinking',
        detail: '',
    };
}

export function summarizeClaudeRateLimitEvent(event: CliEventRecord): string {
    const status = claudeRateLimitStatus(event);
    if (isClaudeRateLimitAllowed(status)) return '';
    const info = claudeRateLimitInfo(event);
    const rateLimitType = fieldString(info["rateLimitType"] || info["rate_limit_type"]);
    const kind = isClaudeRateLimitWarning(status) ? 'warning' : 'wait';
    return rateLimitType
        ? `claude quota ${kind}: ${status || 'rate_limited'} (${rateLimitType})`
        : `claude quota ${kind}: ${status || 'rate_limited'}`;
}

// Claude rate-limit internal helpers (used by summarizeClaudeRateLimitEvent above + claude.ts)
const CLAUDE_RATE_LIMIT_ALLOWED_STATUSES = new Set(['allowed']);
const CLAUDE_RATE_LIMIT_WARNING_STATUSES = new Set(['allowed_warning', 'warning', 'near_limit']);

export function claudeRateLimitInfo(event: CliEventRecord): CliEventRecord {
    return asCliEventRecord(event["rate_limit_info"] || event["rateLimitInfo"]);
}

export function claudeRateLimitStatus(event: CliEventRecord): string {
    return fieldString(claudeRateLimitInfo(event).status || event.status).toLowerCase();
}

export function isClaudeRateLimitAllowed(status: string): boolean {
    return CLAUDE_RATE_LIMIT_ALLOWED_STATUSES.has(status);
}

export function isClaudeRateLimitWarning(status: string): boolean {
    return CLAUDE_RATE_LIMIT_WARNING_STATUSES.has(status);
}

export function claudeRateLimitResetMs(event: CliEventRecord): number {
    const info = claudeRateLimitInfo(event);
    const resetsAt = fieldNumber(info["resetsAt"] || event["resetsAt"]);
    if (!resetsAt) return 0;
    return resetsAt > 1_000_000_000_000 ? resetsAt : resetsAt * 1000;
}

export function claudeRateLimitWaitMs(event: CliEventRecord): number {
    const resetMs = claudeRateLimitResetMs(event);
    if (!resetMs) return 0;
    return Math.max(0, resetMs - Date.now() + 60_000);
}

// ─── Summarize tool input (cross-module) ─────────────

export function summarizeToolInput(toolName: string, input: unknown, max = 0): string {
    if (!input) return '';
    if (typeof input !== 'object') return max ? clipText(String(input), max) : String(input);
    const data = asCliEventRecord(input);
    const s = (v: unknown) => (typeof v === 'string' ? v : v != null ? String(v) : '');
    const name = (toolName || '').toLowerCase();
    let result = '';
    if (name.includes('bash') || name.includes('terminal') || name === 'execute_command')
        result = s(data.command || data.cmd);
    else if (name.includes('read') || name === 'read_file' || name === 'view') {
        const fullPath = s(data["path"] || data["file_path"] || data["filename"]);
        result = max ? (fullPath.split('/').pop() || fullPath) : fullPath;
    } else if (name.includes('write') || name.includes('edit') || name === 'create_file') {
        const fullPath = s(data["path"] || data["file_path"]);
        result = max ? (fullPath.split('/').pop() || fullPath) : fullPath;
    } else if (name.includes('search') || name.includes('grep') || name === 'codebase_search')
        result = s(data.query || data["pattern"] || data["search_query"]);
    else if (name.includes('web') || name === 'web_search')
        result = s(data.query);
    if (!result) {
        try { result = JSON.stringify(input); } catch { /* ignore */ }
    }
    return max ? clipText(result, max) : result;
}

// ─── OpenCode cross-module helpers ───────────────────

export function isOpencodeToolFailure(part: CliEventRecord): boolean {
    const exitCode = part?.state?.metadata?.["exit"];
    if (exitCode != null && exitCode !== 0) return true;
    const status = String(part?.state?.status || '').toLowerCase();
    return status === 'error'
        || status === 'failed'
        || status === 'denied'
        || status === 'cancelled';
}

export function cleanOpencodeTaskResult(output: unknown): string {
    const raw = String(output || '').trim();
    if (!raw) return '';
    const match = raw.match(/<task_result>([\s\S]*?)<\/task_result>/);
    return (match?.[1] || raw).trim();
}

export function formatOpenCodeTaskDetail(part: CliEventRecord): string {
    const state = part?.state || {};
    const input = state.input || {};
    const meta = state.metadata || {};
    const modelInfo = asCliEventRecord(meta.model);
    const model = meta.model
        ? [modelInfo["providerID"], modelInfo["modelID"]].filter(Boolean).join('/')
        : '';
    return appendDetail(
        input.prompt ? `prompt: ${clipText(String(input.prompt), 300)}` : '',
        model ? `model: ${model}` : '',
        meta["sessionId"] ? `child_session: ${meta["sessionId"]}` : '',
        cleanOpencodeTaskResult(state.output) ? `result: ${cleanOpencodeTaskResult(state.output)}` : '',
    );
}

// ─── extractText (cross-module: claude, tool-labels, acp) ────

export function extractText(content: unknown) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter(isCliEventRecord)
            .filter(c => c.type === 'text')
            .map(c => c.text || '')
            .join('');
    }
    if (isCliEventRecord(content) && content.type === 'text') {
        return content.text || '';
    }
    return '';
}
