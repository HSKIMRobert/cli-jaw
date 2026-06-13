/**
 * jawcode TUI Component bridge — thin import layer over pre-built bundles.
 * Tier 1: jawcode-tui-bundle.mjs (basic components: Box, Text, Markdown, etc.)
 * Tier 2: jawcode-interactive-bundle.mjs (InteractiveMode components: Welcome, StatusLine, etc.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tui: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _interactive: any = null;
let _initialized = false;

export async function initJawcodeTui(): Promise<void> {
    if (_initialized) return;
    await import('../../lib/tui/bun-shim.mjs');
    _tui = await import('../../lib/tui/jawcode-tui-bundle.mjs');
    _interactive = await import('../../lib/tui/jawcode-interactive-bundle.mjs');
    await _interactive.initTheme(false);
    _initialized = true;
}

function ensureInit(): void {
    if (!_initialized) throw new Error('Call initJawcodeTui() before using jawcode render functions');
}

export function isInitialized(): boolean { return _initialized; }
export function getTui(): any { ensureInit(); return _tui; }
export function getInteractive(): any { ensureInit(); return _interactive; }

function buildMarkdownTheme(): Record<string, unknown> {
    const theme = _interactive?.theme;
    if (!theme?.fg) return {};
    return {
        heading: (t: string) => theme.fg('mdHeading', t),
        link: (t: string) => theme.fg('mdLink', t),
        linkUrl: (t: string) => theme.fg('mdLinkUrl', t),
        code: (t: string) => theme.fg('mdCode', t),
        codeBlock: (t: string) => theme.fg('mdCodeBlock', t),
        codeBlockBorder: (t: string) => theme.fg('mdCodeBlockBorder', t),
        quote: (t: string) => theme.fg('mdQuote', t),
        quoteBorder: (t: string) => theme.fg('mdQuoteBorder', t),
        hr: (t: string) => theme.fg('mdHr', t),
        listBullet: (t: string) => theme.fg('mdListBullet', t),
        bold: (t: string) => theme.bold(t),
        italic: (t: string) => theme.italic(t),
        underline: (t: string) => theme.underline(t),
        strikethrough: (t: string) => `\x1b[9m${t}\x1b[29m`,
    };
}

export function renderMarkdownJawcode(text: string, width: number): string[] {
    ensureInit();
    const mdTheme = buildMarkdownTheme();
    const md = new _tui.Markdown(text, 1, 0, mdTheme);
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
