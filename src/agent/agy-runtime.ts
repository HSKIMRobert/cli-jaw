import type { SpawnContext, ToolEntry } from '../types/agent.js';

export const AGY_TIMEOUT_PREFIX = 'Error: timed out waiting for response';
export const AGY_COMPLETE_KILL_REASON = 'agy-complete';
export const AGY_PRINT_QUIET_COMPLETION_MS = 2_500;
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

export function isAgyInterimProgressOutput(text: string): boolean {
    const value = String(text || '').trim();
    if (!value || value.length > 3_000) return false;
    if (/\bFINAL_[A-Z0-9_]*DONE\b/i.test(value)) return false;
    const compact = value.replace(/\s+/g, ' ');
    if (
        /(?:먼저|이제|다음으로|바로|계속|기반으로).{0,900}(?:읽겠습니다|찾겠습니다|확인하겠습니다|살펴보겠습니다|조사하겠습니다|실행하겠습니다|생성하겠습니다|수정하겠습니다|만들겠습니다|만들어보겠습니다|시작하겠습니다|진행하겠습니다|보겠습니다)/.test(compact)
        || /(?:바로|먼저|이제).{0,400}(?:하겠습니다|보겠습니다)\.?$/.test(compact)
        || /\b(?:Proceeding|Continuing|Moving on)\b.{0,500}\b(?:create|write|edit|run|read|check|verify|inspect|execute|generate|update|fix)\b/i.test(compact)
        || /\b(?:Now|Next),?\s+(?:let me|I(?:'ll| will| am going to| need to)|proceeding)\b/i.test(compact)
        || /\balready read(?:\s+earlier)?\b.{0,500}\b(?:proceeding|creating|writing|editing|running|checking|verifying)\b/i.test(compact)
        || /^(?:Creating|Writing|Editing|Reading|Checking|Verifying|Running|Executing|Generating|Updating|Fixing)\b.{0,500}\b(?:now|next|first|then)?\.?$/i.test(compact)
    ) return true;
    if (value.split('\n').filter(line => line.trim()).length > 5) return false;
    return /^(?:I\s+(?:will|am going to|need to|should)\b|I'll\b|Let me\b)/i.test(value)
        || /\b(?:I\s+will|I\s+need\s+to|I'll|Let me|First,\s+checking)\b/i.test(value)
        || /(?:먼저|이제|다음으로|계속)\s*.*(?:확인|검색|읽|살펴|조사|실행|생성|시작|수정|만들|보겠|하겠|합니다|할게)/.test(value)
        || /(?:확인하고|검색하고|읽고|살펴보고|조사하고|실행하고|생성하고|수정하고|만들고)\s*(?:진행|시작|하겠|할게|합니다)/.test(value);
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

export function getAgyQuietCompletionDelayMs(ctx: Pick<SpawnContext, 'outputTextStarted' | 'liveOutputText' | 'fullText' | 'toolLog'>): number | null {
    if (!shouldCompleteAgyPrintRun(ctx)) return null;
    const visibleText = String(ctx.liveOutputText || ctx.fullText || '').trim();
    if (isAgyInterimProgressOutput(visibleText)) return null;
    return AGY_PRINT_QUIET_COMPLETION_MS;
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
