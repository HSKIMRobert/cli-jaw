/**
 * jawcode TUI Component bridge — imports from the pre-built bundle.
 * Call initJawcodeTui() once at startup (async), then use sync render functions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bundle has no TS types at runtime
let _tui: any = null;
let _initialized = false;

export async function initJawcodeTui(): Promise<void> {
    if (_initialized) return;
    await import('../../lib/tui/bun-shim.mjs');
    _tui = await import('../../lib/tui/jawcode-tui-bundle.mjs');
    _initialized = true;
}

function ensureInit(): void {
    if (!_initialized) throw new Error('Call initJawcodeTui() before using jawcode render functions');
}

// jawcode dark theme — ANSI color functions matching jawcode's TUI palette
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const ITALIC = '\x1b[3m';
const UNDER = '\x1b[4m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_GRAY = '\x1b[48;5;236m';

const darkTheme: Record<string, (...args: string[]) => string> = {
    heading: (s: string) => `${BOLD}${CYAN}${s}${RESET}`,
    bold: (s: string) => `${BOLD}${s}${RESET}`,
    italic: (s: string) => `${ITALIC}${s}${RESET}`,
    strikethrough: (s: string) => `${DIM}${s}${RESET}`,
    link: (s: string) => `${UNDER}${CYAN}${s}${RESET}`,
    linkTitle: (s: string) => `${DIM}${s}${RESET}`,
    code: (s: string) => `${BG_GRAY}${WHITE}${s}${RESET}`,
    codeBlock: (s: string) => `${s}`,
    codeBlockBorder: (s: string) => `${DIM}${s}${RESET}`,
    blockquote: (s: string) => `${DIM}${ITALIC}${s}${RESET}`,
    listMarker: (s: string) => `${CYAN}${s}${RESET}`,
    hr: (s: string) => `${DIM}${s}${RESET}`,
    html: (s: string) => `${DIM}${s}${RESET}`,
    image: (s: string) => `${DIM}[img: ${s}]${RESET}`,
    table: (s: string) => `${s}`,
    tableHeader: (s: string) => `${BOLD}${s}${RESET}`,
    tableBorder: (s: string) => `${DIM}${s}${RESET}`,
    del: (s: string) => `${DIM}${s}${RESET}`,
    text: (s: string) => s,
    paragraph: (s: string) => s,
    highlightCode: null as unknown as (...args: string[]) => string,
};

const jawcodeTheme = new Proxy(darkTheme, {
    get: (target, prop: string) => target[prop] ?? ((s: string) => s),
});

export function renderMarkdownJawcode(text: string, width: number): string[] {
    ensureInit();
    const md = new _tui.Markdown(text, 1, 0, jawcodeTheme);
    return md.render(width) as string[];
}

export function renderTextBox(_title: string, lines: string[], width: number): string[] {
    ensureInit();
    const box = new _tui.Box(1, 0);
    for (const line of lines) {
        const t = new _tui.Text(line, 0, 0);
        box.addChild(t);
    }
    return box.render(width) as string[];
}

export function getVisibleWidth(str: string): number {
    ensureInit();
    return _tui.visibleWidth(str) as number;
}

export function isInitialized(): boolean { return _initialized; }
