import { toGraphemes } from './text-buffer.js';

export function visualWidth(str: string): number {
    // Strip ANSI escape codes first so width matches visible cells.
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    let width = 0;
    for (const ch of stripped) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) {
            width += 1;
            continue;
        }
        if ((cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x303E) ||
            (cp >= 0x3040 && cp <= 0x33BF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
            (cp >= 0x4E00 && cp <= 0xA4CF) || (cp >= 0xA960 && cp <= 0xA97C) ||
            (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xD7B0 && cp <= 0xD7FF) ||
            (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) ||
            (cp >= 0xFF01 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6) ||
            (cp >= 0x20000 && cp <= 0x2FA1F)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

export function clipTextToCols(str: string, maxCols: number): string {
    if (maxCols <= 0) return '';
    let out = '';
    let width = 0;
    for (const ch of str) {
        const charWidth = visualWidth(ch);
        if (width + charWidth > maxCols) break;
        out += ch;
        width += charWidth;
    }
    return out;
}

/**
 * On-screen position of a cursor within rendered composer text. The display text
 * splits into logical lines by '\n' (first line uses firstPrefixWidth, the rest
 * contPrefixWidth); lines soft-wrap at `cols`. Returns the cursor screen {row,col}
 * and total rows rendered. Pure — used to place the terminal cursor after a redraw.
 */
export function cursorScreenPos(
    displayText: string,
    cursorOffset: number,
    firstPrefixWidth: number,
    contPrefixWidth: number,
    cols: number,
): { row: number; col: number; totalRows: number } {
    const safeCols = Math.max(1, cols);
    const g = toGraphemes(displayText);
    const cur = Math.max(0, Math.min(cursorOffset, g.length));
    let row = 0;
    let scol = firstPrefixWidth;
    let curRow = 0;
    let curCol = firstPrefixWidth;
    for (let i = 0; i <= g.length; i += 1) {
        if (i === cur) { curRow = row; curCol = scol; }
        if (i === g.length) break;
        const ch = g[i] ?? '';
        if (ch === '\n') { row += 1; scol = contPrefixWidth; continue; }
        const w = Math.max(1, visualWidth(ch));
        if (scol + w > safeCols) { row += 1; scol = 0; }
        scol += w;
    }
    return { row: curRow, col: curCol, totalRows: row + 1 };
}
