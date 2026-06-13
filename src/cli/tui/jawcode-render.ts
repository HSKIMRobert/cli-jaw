/**
 * jawcode TUI Component bridge — imports from the pre-built bundle.
 * bun-shim.mjs must be loaded before this module (sets globalThis.Bun).
 */

// Dynamic import to avoid TS compilation of the bundle
let _tui: any = null;

async function getTui() {
    if (_tui) return _tui;
    await import('../../lib/tui/bun-shim.mjs');
    _tui = await import('../../lib/tui/jawcode-tui-bundle.mjs');
    return _tui;
}

// identity theme — all style functions pass through text unchanged for now.
// Next step: add ANSI color functions matching jawcode's dark theme.
const identityTheme = new Proxy({}, { get: () => (s: string) => s });

export async function renderMarkdownJawcode(text: string, width: number): Promise<string[]> {
    const { Markdown } = await getTui();
    const md = new Markdown(text, 1, 0, identityTheme);
    return md.render(width);
}

export async function renderTextBox(_title: string, lines: string[], width: number): Promise<string[]> {
    const { Box, Text } = await getTui();
    const box = new Box(1, 0);
    for (const line of lines) {
        const t = new Text(line, 0, 0);
        box.addChild(t);
    }
    return box.render(width);
}

export { getTui };
