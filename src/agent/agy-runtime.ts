export const AGY_TIMEOUT_PREFIX = 'Error: timed out waiting for response';
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

export { resolveAgyConversationIdFromCache, agyTranscriptPathForConversation } from './agy-transcript.js';

export function extractAgyConversationId(text: string): string | null {
    const match = AGY_CONVERSATION_ID_RE.exec(text);
    return match?.[1] ?? match?.[2] ?? null;
}

const AGY_STALE_WARNING_RE = /^Warning:\s*conversation\s+"[^"]*"\s+not found\b/im;

export function isAgyStaleSessionOutput(text: string): boolean {
    return AGY_STALE_WARNING_RE.test(text);
}
