/**
 * Inline frame buffer + differential rendering (no alt-screen).
 * Renders on the main screen buffer so Welcome/scrollback are preserved.
 * Uses synchronized output (CSI 2026) for flicker-free updates.
 */

import { clipTextToCols } from '../renderers.js';

export const VIEWPORT_FILL = '\x00__VIEWPORT_FILL__\x00';

export interface Frame {
    rows: string[];
    cursorPos?: { row: number; col: number };
}

/** Legacy diffFrames for test compatibility. */
export function diffFrames(prev: Frame | null, next: Frame): string {
    if (!prev || prev.rows.length === 0) {
        let out = '';
        for (let i = 0; i < next.rows.length; i++) {
            if (i > 0) out += '\r\n';
            out += '\x1b[2K' + (next.rows[i] ?? '');
        }
        return out;
    }
    const max = Math.max(prev.rows.length, next.rows.length);
    let out = '';
    for (let i = 0; i < max; i++) {
        const a = prev.rows[i] ?? '';
        const b = next.rows[i] ?? '';
        if (a !== b) {
            out += `\x1b[${i + 1};1H\x1b[2K${b}`;
        }
    }
    return out;
}

/**
 * Expand VIEWPORT_FILL sentinel: replace it with enough blank lines to pad
 * the frame to terminal height, pinning actual content at the bottom.
 * If content exceeds terminal height, sentinel is removed (no padding).
 */
function normalizeFrameRows(lines: string[], height: number): { rows: string[]; droppedTop: number; paddedTop: number; sentinelIndex: number; sentinelDelta: number } {
    const safeHeight = Math.max(1, height);
    const idx = lines.indexOf(VIEWPORT_FILL);
    let rows = [...lines];
    let sentinelDelta = 0;
    if (idx !== -1) {
        const contentCount = rows.length - 1;
        const fillCount = Math.max(0, safeHeight - contentCount);
        sentinelDelta = fillCount - 1;
        rows.splice(idx, 1, ...new Array(fillCount).fill(''));
    }
    let paddedTop = 0;
    if (rows.length < safeHeight) {
        paddedTop = safeHeight - rows.length;
        rows = [...new Array(paddedTop).fill(''), ...rows];
    }
    if (rows.length <= safeHeight) return { rows, droppedTop: 0, paddedTop, sentinelIndex: idx, sentinelDelta };
    const droppedTop = rows.length - safeHeight;
    return { rows: rows.slice(droppedTop), droppedTop, paddedTop, sentinelIndex: idx, sentinelDelta };
}

function normalizeFrameRow(row: string, width: number): string {
    return clipTextToCols(row.replace(/[\r\n]+/g, ' '), width);
}

function normalizeCursorRow(row: number, normalized: ReturnType<typeof normalizeFrameRows>, rowCount: number): number {
    let nextRow = row;
    if (normalized.sentinelIndex >= 0 && row > normalized.sentinelIndex) {
        nextRow += normalized.sentinelDelta;
    }
    nextRow += normalized.paddedTop;
    nextRow -= normalized.droppedTop;
    return Math.max(0, Math.min(rowCount - 1, nextRow));
}

/**
 * Inline Screen: renders frames on the main terminal buffer using relative
 * cursor movement and differential row updates. No alternate screen buffer.
 *
 * VIEWPORT_FILL sentinel in frame rows is expanded to blank lines that push
 * content to the terminal bottom — preserving Welcome banner in scrollback.
 */
export class Screen {
    private prevLines: string[] = [];
    private inlineActive = false;
    private cursorRow = 0;
    private fullRedrawPending = false;

    get active(): boolean {
        return this.inlineActive;
    }

    enter(): void {
        if (this.inlineActive) return;
        process.stdout.write('\x1b[?25l');
        this.inlineActive = true;
        this.prevLines = [];
        this.cursorRow = 0;
        this.fullRedrawPending = false;
    }

    exit(): void {
        if (!this.inlineActive) return;
        const lastRow = this.prevLines.length - 1;
        if (lastRow > this.cursorRow) {
            process.stdout.write(`\x1b[${lastRow - this.cursorRow}B`);
        }
        process.stdout.write('\r\n\x1b[?25h');
        this.inlineActive = false;
        this.prevLines = [];
        this.cursorRow = 0;
        this.fullRedrawPending = false;
    }

    render(next: Frame): void {
        if (!this.inlineActive) return;
        const height = process.stdout.rows || 24;
        const width = Math.max(1, process.stdout.columns || 80);
        const normalized = normalizeFrameRows(next.rows.map(row => normalizeFrameRow(row, width)), height);
        const lines = normalized.rows;
        const cursorPos = next.cursorPos
            ? {
                row: normalizeCursorRow(next.cursorPos.row, normalized, lines.length),
                col: Math.max(0, Math.min(width - 1, next.cursorPos.col)),
            }
            : undefined;

        let buf = '\x1b[?2026h';

        if (this.fullRedrawPending || this.prevLines.length === 0) {
            if (this.fullRedrawPending && this.prevLines.length > 0 && this.cursorRow > 0) {
                buf += `\x1b[${this.cursorRow}A`;
            }
            buf += '\r';
            const redrawRows = Math.min(height, Math.max(lines.length, this.prevLines.length));
            for (let i = 0; i < redrawRows; i++) {
                if (i > 0) buf += '\r\n';
                buf += '\x1b[2K' + (i < lines.length ? (lines[i] ?? '') : '');
            }
            this.cursorRow = Math.max(0, Math.min(lines.length, redrawRows) - 1);
            this.fullRedrawPending = false;
        } else {
            const prevLen = this.prevLines.length;
            const nextLen = lines.length;

            if (nextLen > prevLen) {
                let firstChanged = -1;
                for (let i = 0; i < prevLen; i++) {
                    if (this.prevLines[i] !== lines[i]) { firstChanged = i; break; }
                }
                if (firstChanged === -1) firstChanged = prevLen;

                if (firstChanged < prevLen) {
                    const moveUp = this.cursorRow - firstChanged;
                    if (moveUp > 0) buf += `\x1b[${moveUp}A`;
                    else if (moveUp < 0) buf += `\x1b[${-moveUp}B`;
                    buf += '\r';
                    for (let i = firstChanged; i < prevLen; i++) {
                        if (i > firstChanged) buf += '\r\n';
                        buf += '\x1b[2K' + (lines[i] ?? '');
                    }
                    this.cursorRow = prevLen - 1;
                }

                const moveToEnd = (prevLen - 1) - this.cursorRow;
                if (moveToEnd > 0) buf += `\x1b[${moveToEnd}B`;
                for (let i = prevLen; i < nextLen; i++) {
                    buf += '\r\n\x1b[2K' + (lines[i] ?? '');
                }
                this.cursorRow = nextLen - 1;
            } else {
                let firstChanged = -1;
                let lastChanged = -1;
                const max = Math.max(prevLen, nextLen);
                for (let i = 0; i < max; i++) {
                    const a = i < prevLen ? this.prevLines[i] : '';
                    const b = i < nextLen ? lines[i] : '';
                    if (a !== b) {
                        if (firstChanged === -1) firstChanged = i;
                        lastChanged = i;
                    }
                }

                if (firstChanged >= 0) {
                    const moveUp = this.cursorRow - firstChanged;
                    if (moveUp > 0) buf += `\x1b[${moveUp}A`;
                    else if (moveUp < 0) buf += `\x1b[${-moveUp}B`;
                    buf += '\r';

                    for (let i = firstChanged; i <= lastChanged; i++) {
                        if (i > firstChanged) buf += '\r\n';
                        buf += '\x1b[2K' + (i < nextLen ? (lines[i] ?? '') : '');
                    }
                    this.cursorRow = lastChanged;
                }

                if (nextLen < prevLen) {
                    for (let i = nextLen; i < prevLen; i++) {
                        buf += '\r\n\x1b[2K';
                    }
                    const backUp = prevLen - nextLen;
                    if (backUp > 0) buf += `\x1b[${backUp}A`;
                    this.cursorRow = Math.min(this.cursorRow, nextLen - 1);
                }
            }
        }

        buf += '\x1b[?2026l';
        if (cursorPos) {
            const targetRow = cursorPos.row;
            const move = targetRow - this.cursorRow;
            if (move > 0) buf += `\x1b[${move}B`;
            else if (move < 0) buf += `\x1b[${-move}A`;
            buf += `\r\x1b[${cursorPos.col}C`;
            buf += '\x1b[?25h';
            this.cursorRow = targetRow;
        } else {
            buf += '\x1b[?25l';
        }
        process.stdout.write(buf);
        this.prevLines = [...lines];
    }

    commitLines(lines: string[]): boolean {
        if (!this.inlineActive || lines.length === 0) return true;
        const height = process.stdout.rows || 24;
        const width = Math.max(1, process.stdout.columns || 80);
        const liveZoneTop = Math.min(lines.length, this.prevLines.length, height);
        if (liveZoneTop <= 0 || liveZoneTop < lines.length) return false;
        const prepared = lines.slice(0, liveZoneTop).map(line => normalizeFrameRow(line, width));
        const buf = `\x1b[?2026h${buildInsertHistorySequence(prepared, {
            liveZoneTop,
            screenRows: height,
            cursor: { row: this.cursorRow, col: 0 },
        })}\x1b[?2026l`;
        process.stdout.write(buf);
        this.fullRedrawPending = true;
        return true;
    }

    forceRedraw(): void {
        this.fullRedrawPending = true;
    }

    resetViewport(): void {
        if (!this.inlineActive) return;
        let buf = '\x1b[?2026h';
        if (this.prevLines.length > 0) {
            if (this.cursorRow > 0) buf += `\x1b[${this.cursorRow}A`;
            buf += '\r';
            for (let i = 0; i < this.prevLines.length; i += 1) {
                if (i > 0) buf += '\x1b[1B\r';
                buf += '\x1b[2K';
            }
            if (this.prevLines.length > 1) buf += `\x1b[${this.prevLines.length - 1}A`;
            buf += '\r';
        }
        buf += '\x1b[?2026l';
        process.stdout.write(buf);
        this.prevLines = [];
        this.cursorRow = 0;
        this.fullRedrawPending = true;
    }

    enableMouse(): void {
        process.stdout.write('\x1b[?1000h\x1b[?1006h');
    }

    disableMouse(): void {
        process.stdout.write('\x1b[?1006l\x1b[?1000l');
    }
}

function buildInsertHistorySequence(
    lines: string[],
    geometry: { liveZoneTop: number; screenRows: number; cursor: { row: number; col: number } },
): string {
    if (lines.length === 0) return '';
    const liveZoneTop = Math.min(geometry.liveZoneTop, geometry.screenRows);
    if (liveZoneTop < 1) return '';
    let out = '';
    out += `\x1b[1;${liveZoneTop}r`;
    out += `\x1b[${liveZoneTop};1H`;
    for (let i = 0; i < lines.length; i += 1) {
        out += '\r\n';
        out += '\x1b[2K';
    }
    out += '\x1b[r';
    out += `\x1b[${geometry.cursor.row + 1};${geometry.cursor.col + 1}H`;
    return out;
}

export function registerScreenCleanup(screen: Screen): void {
    const cleanup = () => {
        screen.disableMouse();
        screen.exit();
    };
    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(130); });
    process.once('SIGTERM', () => { cleanup(); process.exit(143); });
}
