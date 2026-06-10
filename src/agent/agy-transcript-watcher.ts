import type { SpawnContext, ToolEntry } from '../types/agent.js';
import {
    agyTranscriptStepKey,
    classifyAgyTranscriptRow,
    parseTranscriptLine,
    readTranscriptDelta,
    resolveRecentAgyTranscriptPath,
    resolveAgyTranscriptPath,
} from './agy-transcript.js';

export type AgyTranscriptWatcherHandle = { stop: () => void };

export type AgyTranscriptEmit = (
    ctx: SpawnContext,
    tool: ToolEntry,
    agentLabel: string,
    cli: string,
    empTag: Record<string, unknown>,
    traceAudience: 'public' | 'internal',
) => void;

const POLL_MS = 800;
const WAIT_PATH_MS = 120_000;

function updateFinalPlannerFlag(ctx: SpawnContext, line: string, minCreatedAtMs: number): void {
    let rowType = '';
    let createdAtMs: number | null = null;
    try {
        const parsed = JSON.parse(line) as { created_at?: unknown; type?: unknown };
        rowType = typeof parsed.type === 'string' ? parsed.type : '';
        if (typeof parsed.created_at === 'string') {
            const createdAt = Date.parse(parsed.created_at);
            if (Number.isFinite(createdAt)) {
                createdAtMs = createdAt;
                if (createdAt < minCreatedAtMs) return;
            }
        }
    } catch {
        return;
    }
    // A USER_INPUT row marks the current turn's start: any final-planner flag set by a
    // previous turn's row that slipped inside the lookback buffer (fast resume) is stale.
    if (rowType === 'USER_INPUT') {
        ctx.agyFinalPlannerSeen = false;
        return;
    }
    const { kind } = classifyAgyTranscriptRow(line);
    if (kind === 'final-planner') {
        // The current turn's final answer row is always written after spawn, so require a
        // fresh timestamp (1s allowance for second-truncation). The wider minCreatedAtMs
        // lookback stays for tool display, but a previous turn's final planner inside that
        // buffer must never arm completion — agy may not have flushed any current-turn row
        // yet when the run resumes quickly (reproduced live in the v2 smoke).
        const freshThresholdMs = minCreatedAtMs + 4_000;
        if (createdAtMs !== null && createdAtMs >= freshThresholdMs) {
            ctx.agyFinalPlannerSeen = true;
        }
    } else if (kind === 'tool' || kind === 'planner') {
        ctx.agyFinalPlannerSeen = false;
    }
}

function applyTranscriptTool(
    ctx: SpawnContext,
    line: string,
    minCreatedAtMs: number,
    onEmit: AgyTranscriptEmit,
    agentLabel: string,
    cli: string,
    empTag: Record<string, unknown>,
    traceAudience: 'public' | 'internal',
): void {
    try {
        const parsed = JSON.parse(line) as { created_at?: unknown };
        if (typeof parsed.created_at === 'string') {
            const createdAt = Date.parse(parsed.created_at);
            if (Number.isFinite(createdAt) && createdAt < minCreatedAtMs) return;
        }
    } catch { /* parseTranscriptLine handles malformed rows */ }
    const tool = parseTranscriptLine(line);
    if (!tool?.stepRef) return;
    let dedupeKey = tool.stepRef;
    try {
        const parsed = JSON.parse(line) as { step_index?: unknown; type?: string };
        dedupeKey = agyTranscriptStepKey(parsed.step_index, parsed.type ?? '');
    } catch { /* stepRef */ }
    const existingIdx = ctx.toolLog.findIndex((e) => e.stepRef === tool.stepRef);
    if (existingIdx >= 0) {
        ctx.toolLog[existingIdx] = { ...ctx.toolLog[existingIdx], ...tool };
    } else if (!ctx.seenToolKeys.has(dedupeKey)) {
        ctx.seenToolKeys.add(dedupeKey);
        ctx.toolLog.push(tool);
    }
    ctx.stallWatchdog?.markProgress();
    onEmit(ctx, tool, agentLabel, cli, empTag, traceAudience);
}

export function startAgyTranscriptWatcher(options: {
    cwd: string;
    prompt?: string;
    getSessionId: () => string | null;
    ctx: SpawnContext;
    agentLabel: string;
    cli: string;
    empTag: Record<string, unknown>;
    traceAudience: 'public' | 'internal';
    onEmit: AgyTranscriptEmit;
    onActivity?: () => void;
}): AgyTranscriptWatcherHandle {
    let offset = 0;
    let transcriptPath: string | null = null;
    let conversationId: string | null = null;
    let stopped = false;
    const startedAt = Date.now();

    const tick = () => {
        if (stopped) return;
        const currentSessionId = options.getSessionId();
        if (transcriptPath && currentSessionId && conversationId && currentSessionId !== conversationId) {
            transcriptPath = null;
            conversationId = null;
            offset = 0;
            options.ctx.agyFinalPlannerSeen = false;
        }
        if (!transcriptPath) {
            const resolved = resolveAgyTranscriptPath(options.cwd, currentSessionId);
            const effectiveResolved = resolved.ok
                ? resolved
                : resolveRecentAgyTranscriptPath(startedAt - 5_000, options.prompt);
            if (!effectiveResolved.ok || !effectiveResolved.transcriptPath) {
                if (Date.now() - startedAt > WAIT_PATH_MS) {
                    console.warn(`[jaw:agy:transcript] gave up waiting (${effectiveResolved.reason ?? resolved.reason ?? 'unknown'})`);
                }
                return;
            }
            transcriptPath = effectiveResolved.transcriptPath;
            conversationId = effectiveResolved.conversationId ?? currentSessionId ?? null;
            offset = 0;
            console.log(`[jaw:agy:transcript] tailing ${transcriptPath} (current-turn filter from ${new Date(startedAt).toISOString()})`);
        }
        try {
            const previousOffset = offset;
            const delta = readTranscriptDelta(transcriptPath, offset);
            offset = delta.offset;
            for (const line of delta.lines) {
                updateFinalPlannerFlag(options.ctx, line, startedAt - 5_000);
                applyTranscriptTool(
                    options.ctx,
                    line,
                    startedAt - 5_000,
                    options.onEmit,
                    options.agentLabel,
                    options.cli,
                    options.empTag,
                    options.traceAudience,
                );
            }
            if (delta.offset > previousOffset) {
                // Transcript growth = AGY is still working, regardless of row type
                // (planner/thinking rows are dropped by the tool parser but still count).
                options.ctx.agyTranscriptActive = true;
                options.onActivity?.();
            }
        } catch (e) {
            console.warn('[jaw:agy:transcript] read failed:', (e as Error).message);
        }
    };

    const interval = setInterval(tick, POLL_MS);
    tick();

    return {
        stop: () => {
            stopped = true;
            clearInterval(interval);
            if (!transcriptPath) {
                const resolved = resolveAgyTranscriptPath(options.cwd, options.getSessionId());
                const effectiveResolved = resolved.ok
                    ? resolved
                    : resolveRecentAgyTranscriptPath(startedAt - 5_000, options.prompt);
                if (!effectiveResolved.ok || !effectiveResolved.transcriptPath) return;
                transcriptPath = effectiveResolved.transcriptPath;
                offset = 0;
            }
            try {
                const delta = readTranscriptDelta(transcriptPath, offset);
                for (const line of delta.lines) {
                    updateFinalPlannerFlag(options.ctx, line, startedAt - 5_000);
                    applyTranscriptTool(
                        options.ctx,
                        line,
                        startedAt - 5_000,
                        options.onEmit,
                        options.agentLabel,
                        options.cli,
                        options.empTag,
                        options.traceAudience,
                    );
                }
            } catch { /* best-effort final drain */ }
        },
    };
}
