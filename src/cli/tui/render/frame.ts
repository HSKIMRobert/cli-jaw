/**
 * Alt-screen frame buffer + minimal row diff (Phase 4, devlog 260529_tui_parity).
 */

export interface Frame {
    rows: string[];
}

/** Compose minimal ANSI to update prev → next (changed rows only). */
export function diffFrames(prev: Frame | null, next: Frame): string {
    if (!prev || prev.rows.length === 0) {
        let out = '';
        for (let i = 0; i < next.rows.length; i++) {
            if (i > 0) out += '\x1b[1E'; // cursor down + col 1
            out += '\r\x1b[2K' + (next.rows[i] ?? '');
        }
        return out;
    }

    const max = Math.max(prev.rows.length, next.rows.length);
    let out = '';
    for (let i = 0; i < max; i++) {
        const a = prev.rows[i] ?? '';
        const b = next.rows[i] ?? '';
        if (a === b) continue;
        out += `\x1b[${i + 1};1H\r\x1b[2K${b}`;
    }
    return out;
}

export class Screen {
    private front: Frame | null = null;
    private altActive = false;

    get active(): boolean {
        return this.altActive;
    }

    enter(): void {
        if (this.altActive) return;
        process.stdout.write('\x1b[?1049h\x1b[?25l');
        this.altActive = true;
        this.front = null;
    }

    /** Restore cursor + leave alt-screen. Safe to call multiple times. */
    exit(): void {
        if (!this.altActive) return;
        process.stdout.write('\x1b[?25h\x1b[?1049l');
        this.altActive = false;
        this.front = null;
    }

    render(next: Frame): void {
        if (!this.altActive) return;
        const patch = diffFrames(this.front, next);
        if (patch) process.stdout.write(patch);
        this.front = { rows: [...next.rows] };
    }

    /** Enable SGR mouse reporting (wheel + click). */
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
