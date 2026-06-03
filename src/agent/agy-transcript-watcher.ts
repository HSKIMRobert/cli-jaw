import fs from 'node:fs';
import type { SpawnContext, ToolEntry } from '../types/agent.js';
import {
    agyTranscriptStepKey,
    parseTranscriptLine,
    readTranscriptDelta,
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

function applyTranscriptTool(
    ctx: SpawnContext,
    line: string,
    onEmit: AgyTranscriptEmit,
    agentLabel: string,
    cli: string,
    empTag: Record<string, unknown>,
    traceAudience: 'public' | 'internal',
): void {
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
    getSessionId: () => string | null;
    ctx: SpawnContext;
    agentLabel: string;
    cli: string;
    empTag: Record<string, unknown>;
    traceAudience: 'public' | 'internal';
    onEmit: AgyTranscriptEmit;
}): AgyTranscriptWatcherHandle {
    let offset = 0;
    let transcriptPath: string | null = null;
    let stopped = false;
    const startedAt = Date.now();

    const tick = () => {
        if (stopped) return;
        if (!transcriptPath) {
            const resolved = resolveAgyTranscriptPath(options.cwd, options.getSessionId());
            if (!resolved.ok || !resolved.transcriptPath) {
                if (Date.now() - startedAt > WAIT_PATH_MS) {
                    console.warn(`[jaw:agy:transcript] gave up waiting (${resolved.reason ?? 'unknown'})`);
                }
                return;
            }
            transcriptPath = resolved.transcriptPath;
            try { offset = fs.statSync(transcriptPath).size; } catch { /* start from 0 */ }
            console.log(`[jaw:agy:transcript] tailing ${transcriptPath} (skip ${offset} bytes)`);
        }
        try {
            const delta = readTranscriptDelta(transcriptPath, offset);
            offset = delta.offset;
            for (const line of delta.lines) {
                applyTranscriptTool(
                    options.ctx,
                    line,
                    options.onEmit,
                    options.agentLabel,
                    options.cli,
                    options.empTag,
                    options.traceAudience,
                );
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
            if (!transcriptPath) return;
            try {
                const delta = readTranscriptDelta(transcriptPath, offset);
                for (const line of delta.lines) {
                    applyTranscriptTool(
                        options.ctx,
                        line,
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