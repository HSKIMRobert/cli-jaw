/**
 * Inline frame buffer + differential rendering (no alt-screen).
 * Renders on the main screen buffer so Welcome/scrollback are preserved.
 * Uses synchronized output (CSI 2026) for flicker-free updates.
 */

export const VIEWPORT_FILL = '\x00__VIEWPORT_FILL__\x00';

export interface Frame {
    rows: string[];
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
function expandViewportFill(lines: string[], height: number): string[] {
    const idx = lines.indexOf(VIEWPORT_FILL);
    if (idx === -1) return lines;
    const contentCount = lines.length - 1;
    const fillCount = Math.max(0, height - contentCount);
    const result = [...lines];
    result.splice(idx, 1, ...new Array(fillCount).fill(''));
    return result;
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

    get active(): boolean {
        return this.inlineActive;
    }

    enter(): void {
        if (this.inlineActive) return;
        process.stdout.write('\x1b[?25l');
        this.inlineActive = true;
        this.prevLines = [];
        this.cursorRow = 0;
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
    }

    render(next: Frame): void {
        if (!this.inlineActive) return;
        const height = process.stdout.rows || 24;
        const lines = expandViewportFill(next.rows, height);

        let buf = '\x1b[?2026h';

        if (this.prevLines.length === 0) {
            for (let i = 0; i < lines.length; i++) {
                if (i > 0) buf += '\r\n';
                buf += '\x1b[2K' + (lines[i] ?? '');
            }
            this.cursorRow = Math.max(0, lines.length - 1);
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
        process.stdout.write(buf);
        this.prevLines = [...lines];
    }

    forceRedraw(): void {
        this.prevLines = [];
    }

    enableMouse(): void {
        process.stdout.write('\x1b[?1000h\x1b[?1006h');
    }

    disableMouse(): void {
        process.stdout.write('\x1b[?1006l\x1b[?1000l');
    }
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
