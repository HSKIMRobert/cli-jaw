import type { SpawnContext, ToolEntry } from '../types/agent.js';

export const AGY_TIMEOUT_PREFIX = 'Error: timed out waiting for response';
export const AGY_COMPLETE_KILL_REASON = 'agy-complete';
export const AGY_PRINT_QUIET_COMPLETION_MS = 5_000;
export const AGY_FALLBACK_QUIET_COMPLETION_MS = 20_000;
const AGY_CONVERSATION_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const AGY_CONVERSATION_ID_RE = new RegExp(
    `(?:\\bagy\\s+)?--conversation(?:=|\\s+)(${AGY_CONVERSATION_ID})\\b|\\b(?:conversation=|Created conversation\\s+)(${AGY_CONVERSATION_ID})\\b`,
    'i',
);

export function isAgyTimeoutOutput(text: string): boolean {
    return text.trimStart().startsWith(AGY_TIMEOUT_PREFIX);
}

export function formatAgyTimeoutMessage(text: string): string {
    const trimmed = text.trim();
    return trimmed || AGY_TIMEOUT_PREFIX;
}

export function stripAgyTrailingTimeoutOutput(text: string): { text: string; stripped: boolean } {
    const idx = text.indexOf(AGY_TIMEOUT_PREFIX);
    if (idx <= 0) return { text, stripped: false };
    const before = text.slice(0, idx).trimEnd();
    if (!before.trim()) return { text, stripped: false };
    return { text: before, stripped: true };
}

export function stripAgyResumeReplayPrefix(text: string, previousAssistantText: string | null | undefined): { text: string; stripped: boolean } {
    const previous = String(previousAssistantText || '').trim();
    if (!previous) return { text, stripped: false };
    const current = String(text || '');
    if (!current.startsWith(previous)) return { text, stripped: false };
    const rest = current.slice(previous.length).replace(/^\s+/, '');
    if (!rest.trim()) return { text, stripped: false };
    return { text: rest, stripped: true };
}

export function stripAgyResumeReplayPrefixes(text: string, previousAssistantTexts: readonly string[]): { text: string; stripped: boolean; replayOnly: boolean } {
    let current = String(text || '');
    let stripped = false;
    const prefixes = [...previousAssistantTexts]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    for (let pass = 0; pass < prefixes.length + 1; pass++) {
        let changed = false;
        for (const previous of [...prefixes].reverse()) {
            if (!current.startsWith(previous)) continue;
            current = current.slice(previous.length).replace(/^\s+/, '');
            stripped = true;
            changed = true;
        }
        if (!changed) break;
    }
    return { text: current, stripped, replayOnly: stripped && !current.trim() };
}

export function hasRunningAgyTranscriptTool(toolLog: Pick<ToolEntry, 'status' | 'stepRef'>[]): boolean {
    return toolLog.some((tool) => {
        if (!tool.stepRef?.startsWith('agy:transcript:')) return false;
        return tool.status === 'running';
    });
}

export function shouldCompleteAgyPrintRun(ctx: Pick<SpawnContext, 'outputTextStarted' | 'liveOutputText' | 'fullText' | 'toolLog'>): boolean {
    if (!ctx.outputTextStarted) return false;
    const visibleText = String(ctx.liveOutputText || ctx.fullText || '').trim();
    if (!visibleText) return false;
    if (isAgyTimeoutOutput(visibleText)) return false;
    return !hasRunningAgyTranscriptTool(ctx.toolLog);
}

export function getAgyQuietCompletionDelayMs(ctx: Pick<SpawnContext,
    'outputTextStarted' | 'liveOutputText' | 'fullText' | 'toolLog' | 'agyTranscriptActive' | 'agyFinalPlannerSeen'
>): number | null {
    if (!shouldCompleteAgyPrintRun(ctx)) return null;
    if (ctx.agyTranscriptActive) {
        // Transcript anchoring: intermediate planner rows always carry tool_calls, the
        // final answer row never does — complete only once that final row has been seen.
        return ctx.agyFinalPlannerSeen ? AGY_PRINT_QUIET_COMPLETION_MS : null;
    }
    // Transcript never resolved (brain dir missing/unreadable): legacy stdout-quiet
    // completion with a wide window so runs cannot hang on a missing transcript.
    return AGY_FALLBACK_QUIET_COMPLETION_MS;
}

export { resolveAgyConversationIdFromCache, agyTranscriptPathForConversation } from './agy-transcript.js';

export function extractAgyConversationId(text: string): string | null {
    const match = AGY_CONVERSATION_ID_RE.exec(text);
    return match?.[1] ?? match?.[2] ?? null;
}

const AGY_STALE_WARNING_RE = /^Warning:\s*conversation\s+"[^"]*"\s+not found\b/im;

export function isAgyStaleSessionOutput(text: string): boolean {
    return AGY_STALE_WARNING_RE.test(text);
}
