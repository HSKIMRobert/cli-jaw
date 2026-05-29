/**
 * Minimal TUI theme tokens (Phase 1 of TUI modernization — devlog 260529_tui_parity).
 * Full system (256/16-color, light theme, capability detection) lands in Phase 3 (doc 14).
 * Colors are aligned to the product tokens in public/manager/src/manager-tokens.css.
 */
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const ITALIC = '\x1b[3m';
export const UNDER = '\x1b[4m';

export type ColorLevel = 'truecolor' | 'mono';

/** Computed live (not cached) so tests and runtime env changes are honored. */
export function colorLevel(): ColorLevel {
    if (process.env['NO_COLOR'] != null) return 'mono';
    if (!process.stdout.isTTY && process.env['FORCE_COLOR'] == null) return 'mono';
    return 'truecolor';
}

const TOK = {
    'text.primary': '#e7edf5', 'text.muted': '#657283', 'accent': '#62a8f5',
    'heading': '#e7edf5', 'code.fence': '#657283', 'quote': '#9aa6b5', 'link': '#62a8f5',
    'status.error': '#f87171',
    // diff tokens (consumed by diffview.ts)
    'diff.add': '#34d399', 'diff.del': '#f87171',
    // syntax tokens (consumed by highlight.ts)
    'code.keyword': '#62a8f5', 'code.string': '#34d399', 'code.number': '#f5a524',
    'code.comment': '#657283', 'code.title': '#8fb8f7', 'code.type': '#5eead4',
    'code.built_in': '#f87171',
} as const;
export type Token = keyof typeof TOK;

function fg(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

/** Raw fg escape for a token ('' in mono). highlight.ts manages its own RESET. */
export function fgToken(t: Token): string {
    return colorLevel() === 'mono' ? '' : fg(TOK[t]);
}

/** Wrap text in a token color (+ optional attributes). Mono keeps attributes only. */
export function paint(t: Token, s: string, attrs = ''): string {
    if (colorLevel() === 'mono') return attrs ? `${attrs}${s}${RESET}` : s;
    return `${attrs}${fg(TOK[t])}${s}${RESET}`;
}

/** Apply raw ANSI attributes (bold/italic/…) to text. */
export function attr(s: string, a: string): string {
    if (a === '') return s;
    return `${a}${s}${RESET}`;
}
