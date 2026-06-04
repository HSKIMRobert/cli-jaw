import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ToolEntry } from '../types/agent.js';

export const AGY_ANTIGRAVITY_HOME = path.join(os.homedir(), '.gemini', 'antigravity-cli');
export const AGY_BRAIN_ROOT = path.join(AGY_ANTIGRAVITY_HOME, 'brain');
export const AGY_LAST_CONVERSATIONS = path.join(AGY_ANTIGRAVITY_HOME, 'cache', 'last_conversations.json');

const TOOL_STEP_TYPES = new Set([
    'RUN_COMMAND',
    'VIEW_FILE',
    'LIST_DIRECTORY',
    'GREP_SEARCH',
    'READ_FILE',
    'WRITE_FILE',
    'EDIT_FILE',
]);

const LABEL_MAX = 120;
const DETAIL_MAX = 400;

export function resolveAgyConversationIdFromCache(cwd: string): string | null {
    try {
        if (!fs.existsSync(AGY_LAST_CONVERSATIONS)) return null;
        const map = JSON.parse(fs.readFileSync(AGY_LAST_CONVERSATIONS, 'utf8')) as Record<string, string>;
        const id = map[cwd];
        return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
        return null;
    }
}

export function agyTranscriptPathForConversation(conversationId: string): string {
    return path.join(AGY_BRAIN_ROOT, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
}

export function resolveAgyTranscriptPath(cwd: string, sessionId?: string | null): {
    ok: boolean;
    conversationId?: string;
    transcriptPath?: string;
    reason?: string;
} {
    const conversationId = sessionId || resolveAgyConversationIdFromCache(cwd);
    if (!conversationId) {
        return { ok: false, reason: 'no conversation id (stdout or last_conversations.json)' };
    }
    const transcriptPath = agyTranscriptPathForConversation(conversationId);
    if (!fs.existsSync(transcriptPath)) {
        return { ok: false, conversationId, reason: 'transcript.jsonl not found yet' };
    }
    return { ok: true, conversationId, transcriptPath };
}

function sanitizeSnippet(text: string, max: number): string {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= max) return oneLine;
    return `${oneLine.slice(0, max - 1)}…`;
}

function stripAgyMeta(raw: string): string {
    const lines = raw.split('\n');
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!.trim();
        if (l.startsWith('Output:')) { start = i + 1; break; }
        if (l.startsWith('Task Description:')) { start = i; break; }
    }
    return lines.slice(start).join('\n').replace(/^\s+/, '');
}

function labelForStep(type: string, content: string): { label: string; detail: string; icon: string; toolType: string } {
    const snippet = sanitizeSnippet(content, DETAIL_MAX);
    switch (type) {
        case 'RUN_COMMAND': {
            const cleaned = stripAgyMeta(content);
            const firstLine = cleaned.split('\n')[0]?.trim() || 'run command';
            return { icon: '🔧', toolType: 'tool', label: sanitizeSnippet(firstLine, LABEL_MAX), detail: sanitizeSnippet(cleaned, DETAIL_MAX) };
        }
        case 'VIEW_FILE':
            return { icon: '📄', toolType: 'tool', label: 'view file', detail: snippet };
        case 'LIST_DIRECTORY':
            return { icon: '📂', toolType: 'tool', label: 'list directory', detail: snippet };
        case 'GREP_SEARCH':
            return { icon: '🔍', toolType: 'search', label: 'grep search', detail: snippet };
        case 'PLANNER_RESPONSE':
            return { icon: '💭', toolType: 'thinking', label: sanitizeSnippet(snippet, LABEL_MAX) || 'planner', detail: snippet };
        default:
            return { icon: '🔧', toolType: 'tool', label: type.toLowerCase().replace(/_/g, ' '), detail: snippet };
    }
}

export function agyTranscriptStepKey(stepIndex: unknown, type: string): string {
    return `${stepIndex ?? 'x'}:${type}`;
}

export function parseTranscriptLine(line: string): ToolEntry | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let row: Record<string, unknown>;
    try {
        row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        return null;
    }
    const type = typeof row['type'] === 'string' ? row['type'] : '';
    if (!TOOL_STEP_TYPES.has(type) && type !== 'PLANNER_RESPONSE') return null;
    const content = typeof row['content'] === 'string' ? row['content'] : '';
    const stepIndex = row['step_index'];
    const statusRaw = typeof row['status'] === 'string' ? row['status'] : '';
    const { icon, label, detail, toolType } = labelForStep(type, content);
    const entry: ToolEntry = {
        icon,
        label,
        detail,
        toolType,
        stepRef: `agy:transcript:${stepIndex}:${type}`,
    };
    if (statusRaw === 'DONE') entry.status = 'done';
    else if (statusRaw) entry.status = 'running';
    return entry;
}

export function readTranscriptDelta(transcriptPath: string, offset: number): { offset: number; lines: string[] } {
    const stat = fs.statSync(transcriptPath);
    if (stat.size <= offset) return { offset, lines: [] };
    const len = stat.size - offset;
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(transcriptPath, 'r');
    try {
        fs.readSync(fd, buf, 0, len, offset);
    } finally {
        fs.closeSync(fd);
    }
    const chunk = buf.toString('utf8');
    const atEof = offset + len >= stat.size;
    const parts = chunk.split('\n');
    const completeLines: string[] = [];
    let remainder = '';
    if (!chunk.endsWith('\n') && parts.length > 0) {
        remainder = parts[parts.length - 1] ?? '';
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i] ?? '';
            if (part.trim()) completeLines.push(part);
        }
        if (atEof && remainder.trim()) completeLines.push(remainder);
        remainder = atEof ? '' : remainder;
    } else {
        for (const p of parts) {
            if (p.trim()) completeLines.push(p);
        }
    }
    const newOffset = stat.size - Buffer.byteLength(remainder, 'utf8');
    return { offset: newOffset, lines: completeLines };
}