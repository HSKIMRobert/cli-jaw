import { toGraphemes } from './text-buffer.js';

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

export interface TextSegment {
    kind: 'text';
    text: string;
}

export interface PasteSegment {
    kind: 'paste';
    rawText: string;
    label: string;
    lineCount: number;
    charCount: number;
    ordinal: number;
}

export type ComposerSegment = TextSegment | PasteSegment;

export interface ComposerState {
    segments: ComposerSegment[];
    nextPasteOrdinal: number;
    /** Cursor as a grapheme index within the trailing text segment (the active edit area). */
    cursor: number;
}

export interface PasteCaptureState {
    active: boolean;
    buffer: string;
    carry: string;
}

export function createComposerState(): ComposerState {
    return {
        segments: [{ kind: 'text', text: '' }],
        nextPasteOrdinal: 1,
        cursor: 0,
    };
}

/** Grapheme count of the trailing text segment (the cursor's domain). */
function trailingLen(state: ComposerState): number {
    return toGraphemes(getTrailingTextSegment(state).text).length;
}

function clampCursor(state: ComposerState): void {
    const max = trailingLen(state);
    if (state.cursor < 0) state.cursor = 0;
    else if (state.cursor > max) state.cursor = max;
}

export function createPasteCaptureState(): PasteCaptureState {
    return { active: false, buffer: '', carry: '' };
}

export function ensureTrailingTextSegment(state: ComposerState): void {
    const last = state.segments[state.segments.length - 1];
    if (!last) {
        state.segments.push({ kind: 'text', text: '' });
        return;
    }
    if (last.kind !== 'text') state.segments.push({ kind: 'text', text: '' });
}

export function getTrailingTextSegment(state: ComposerState): TextSegment {
    ensureTrailingTextSegment(state);
    const last = state.segments[state.segments.length - 1];
    if (!last || last.kind !== 'text') return { kind: 'text', text: '' };
    return last;
}

function normalizeComposerState(state: ComposerState): void {
    const next: ComposerSegment[] = [];
    for (const seg of state.segments) {
        const prev = next[next.length - 1];
        if (seg.kind === 'text' && prev?.kind === 'text') {
            prev.text += seg.text;
            continue;
        }
        next.push(seg.kind === 'text' ? { kind: 'text', text: seg.text } : { ...seg });
    }
    state.segments = next;
    ensureTrailingTextSegment(state);
    for (let i = 0; i < state.segments.length - 1; i++) {
        const seg = state.segments[i];
        if (seg?.kind === 'text' && seg.text === '') {
            state.segments.splice(i, 1);
            i -= 1;
        }
    }
}

export function appendTextToComposer(state: ComposerState, text: string): void {
    if (!text) return;
    const seg = getTrailingTextSegment(state);
    const g = toGraphemes(seg.text);
    const ins = toGraphemes(text);
    const at = Math.max(0, Math.min(state.cursor, g.length));
    g.splice(at, 0, ...ins);
    seg.text = g.join('');
    state.cursor = at + ins.length; // insert at cursor; cursor defaults to end so typing appends
}

export function appendNewlineToComposer(state: ComposerState): void {
    appendTextToComposer(state, '\n');
}

function countTextMetrics(text: string) {
    return {
        lineCount: text.split('\n').length,
        charCount: text.length,
    };
}

export function makePasteLabel(ordinal: number, lineCount: number, charCount: number): string {
    if (lineCount >= 2) return `[Pasted text #${ordinal} +${lineCount - 1} lines]`;
    return `[Pasted text #${ordinal} +${charCount} chars]`;
}

export interface PasteCollapseConfig {
    collapseLines: number;
    collapseChars: number;
}

export function appendPasteToComposer(state: ComposerState, rawText: string, config?: PasteCollapseConfig): void {
    const collapseLines = config?.collapseLines ?? 2;
    const collapseChars = config?.collapseChars ?? 160;
    const { lineCount, charCount } = countTextMetrics(rawText);
    if (lineCount < collapseLines && charCount < collapseChars) {
        appendTextToComposer(state, rawText);
        return;
    }
    const paste: PasteSegment = {
        kind: 'paste',
        rawText,
        label: makePasteLabel(state.nextPasteOrdinal, lineCount, charCount),
        lineCount,
        charCount,
        ordinal: state.nextPasteOrdinal,
    };
    state.nextPasteOrdinal += 1;
    ensureTrailingTextSegment(state);
    const trailing = getTrailingTextSegment(state);
    if (trailing.text === '') {
        state.segments.splice(state.segments.length - 1, 0, paste);
    } else {
        state.segments.push(paste, { kind: 'text', text: '' });
    }
    normalizeComposerState(state);
    state.cursor = trailingLen(state); // continue typing after the paste
}

export function backspaceComposer(state: ComposerState): void {
    const trailing = getTrailingTextSegment(state);
    const g = toGraphemes(trailing.text);
    if (state.cursor > 0 && g.length > 0) {
        const at = Math.min(state.cursor, g.length);
        g.splice(at - 1, 1);
        trailing.text = g.join('');
        state.cursor = at - 1;
        return;
    }
    // cursor at start of trailing text → remove the preceding paste/char (legacy behavior)
    if (state.segments.length <= 1) return;
    const prev = state.segments[state.segments.length - 2];
    if (!prev) return;
    if (prev.kind === 'paste') {
        state.segments.splice(state.segments.length - 2, 1);
    } else {
        prev.text = prev.text.slice(0, -1);
    }
    normalizeComposerState(state);
    clampCursor(state);
}

/** Delete the grapheme at the cursor (Delete key). */
export function deleteForwardComposer(state: ComposerState): void {
    const seg = getTrailingTextSegment(state);
    const g = toGraphemes(seg.text);
    if (state.cursor < g.length) {
        g.splice(state.cursor, 1);
        seg.text = g.join('');
    }
}

// ─── Cursor movement (within the trailing text segment) ──────────────
export function moveCursorLeft(state: ComposerState): void { if (state.cursor > 0) state.cursor -= 1; }
export function moveCursorRight(state: ComposerState): void { if (state.cursor < trailingLen(state)) state.cursor += 1; }
export function moveCursorHome(state: ComposerState): void { state.cursor = 0; }
export function moveCursorEnd(state: ComposerState): void { state.cursor = trailingLen(state); }
export function moveCursorWordLeft(state: ComposerState): void {
    const g = toGraphemes(getTrailingTextSegment(state).text);
    let i = Math.min(state.cursor, g.length);
    while (i > 0 && /\s/.test(g[i - 1] ?? '')) i -= 1;
    while (i > 0 && !/\s/.test(g[i - 1] ?? '')) i -= 1;
    state.cursor = i;
}
export function moveCursorWordRight(state: ComposerState): void {
    const g = toGraphemes(getTrailingTextSegment(state).text);
    let i = Math.min(state.cursor, g.length);
    while (i < g.length && /\s/.test(g[i] ?? '')) i += 1;
    while (i < g.length && !/\s/.test(g[i] ?? '')) i += 1;
    state.cursor = i;
}

/** Cursor's grapheme offset within the full display text (getComposerDisplayText). */
export function getDisplayCursorOffset(state: ComposerState): number {
    let before = 0;
    for (let i = 0; i < state.segments.length - 1; i += 1) {
        const seg = state.segments[i];
        if (!seg) continue;
        before += toGraphemes(seg.kind === 'text' ? seg.text : seg.label).length;
    }
    return before + Math.min(state.cursor, trailingLen(state));
}

export function clearComposer(state: ComposerState): void {
    state.segments = [{ kind: 'text', text: '' }];
    state.nextPasteOrdinal = 1;
    state.cursor = 0;
}

export function getComposerDisplayText(state: ComposerState): string {
    return state.segments.map(seg => seg.kind === 'text' ? seg.text : seg.label).join('');
}

export function flattenComposerForSubmit(state: ComposerState): string {
    return state.segments.map(seg => seg.kind === 'text' ? seg.text : seg.rawText).join('');
}

export function getPlainCommandDraft(state: ComposerState): string | null {
    if (state.segments.length !== 1) return null;
    const only = state.segments[0];
    if (!only || only.kind !== 'text') return null;
    if (only.text.includes('\n')) return null;
    return only.text;
}

export function setBracketedPaste(enabled: boolean): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;
    process.stdout.write(enabled ? '\x1b[?2004h' : '\x1b[?2004l');
}

function longestPartialSuffix(text: string, marker: string): number {
    const max = Math.min(text.length, marker.length - 1);
    for (let len = max; len > 0; len--) {
        if (text.endsWith(marker.slice(0, len))) return len;
    }
    return 0;
}

export function consumePasteProtocol(
    chunk: string,
    capture: PasteCaptureState,
    composer: ComposerState,
    pasteConfig?: PasteCollapseConfig,
): string[] {
    let data = capture.carry + chunk;
    capture.carry = '';
    const out: string[] = [];

    while (data.length > 0) {
        if (capture.active) {
            const endIdx = data.indexOf(BRACKETED_PASTE_END);
            if (endIdx === -1) {
                const partialLen = longestPartialSuffix(data, BRACKETED_PASTE_END);
                capture.buffer += data.slice(0, data.length - partialLen);
                capture.carry = data.slice(data.length - partialLen);
                break;
            }
            capture.buffer += data.slice(0, endIdx);
            appendPasteToComposer(composer, capture.buffer, pasteConfig);
            capture.buffer = '';
            capture.active = false;
            data = data.slice(endIdx + BRACKETED_PASTE_END.length);
            continue;
        }

        const startIdx = data.indexOf(BRACKETED_PASTE_START);
        if (startIdx === -1) {
            const partialLen = longestPartialSuffix(data, BRACKETED_PASTE_START);
            const emit = data.slice(0, data.length - partialLen);
            if (emit) out.push(emit);
            capture.carry = data.slice(data.length - partialLen);
            break;
        }

        const before = data.slice(0, startIdx);
        if (before) out.push(before);
        capture.active = true;
        capture.buffer = '';
        data = data.slice(startIdx + BRACKETED_PASTE_START.length);
    }

    return out;
}
