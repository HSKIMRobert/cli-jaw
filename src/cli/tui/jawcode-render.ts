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

const identityTheme = new Proxy({}, { get: () => (s: string) => s });

export function renderMarkdownJawcode(text: string, width: number): string[] {
    ensureInit();
    const md = new _tui.Markdown(text, 1, 0, identityTheme);
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
