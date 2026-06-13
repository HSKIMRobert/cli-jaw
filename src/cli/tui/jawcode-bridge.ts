/**
 * jawcode Component bridge — uses actual jawcode InteractiveMode components.
 * Replaces the old ANSI hardcoding adapter with real Component.render() calls.
 */
import { initJawcodeTui, isInitialized, getInteractive, renderMarkdownJawcode } from './jawcode-render.js';
import { renderJawWelcome } from './welcome-jaw.js';

export interface JawcodeAdapterState {
    initialized: boolean;
    welcomeRendered: boolean;
    currentAssistant: string | null;
    toolStates: Map<string, 'pending' | 'done' | 'error'>;
}

export function createAdapterState(): JawcodeAdapterState {
    return {
        initialized: false,
        welcomeRendered: false,
        currentAssistant: null,
        toolStates: new Map(),
    };
}

export async function ensureInitialized(state: JawcodeAdapterState): Promise<void> {
    if (state.initialized) return;
    await initJawcodeTui();
    state.initialized = true;
}

export function renderWelcome(opts: {
    version: string;
    engine: string;
    engineAccent: string;
    model: string;
    directory: string;
    serverPort: number;
    ideDiff?: string | undefined;
    gitBranch?: string | undefined;
    projectRoot?: string | undefined;
    port?: number | undefined;
    recentSessions?: Array<{ label: string; ago: string }> | undefined;
}): string[] {
    return renderJawWelcome({
        version: opts.version,
        model: opts.model,
        engine: opts.engine,
        projectRoot: opts.projectRoot ?? opts.directory,
        port: opts.port ?? opts.serverPort,
        gitBranch: opts.gitBranch,
        recentSessions: opts.recentSessions,
    }, process.stdout.columns || 80);
}

export function renderAssistantChunk(text: string, width: number): string[] {
    if (!isInitialized()) return [text];
    return renderMarkdownJawcode(text, width);
}

function getTheme(): { fg: (color: string, text: string) => string; bold: (text: string) => string; italic: (text: string) => string } | null {
    if (!isInitialized()) return null;
    try { return getInteractive().theme; } catch { return null; }
}

export function renderToolLine(icon: string, label: string, detail: string, state: 'pending' | 'done' | 'error', opts?: { depth?: number; isLast?: boolean; elapsed?: string }): string {
    const theme = getTheme();
    if (!theme) {
        const stateIcon = state === 'done' ? '\x1b[32m✔\x1b[0m' : state === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[36m⏳\x1b[0m';
        return `  ${stateIcon} ${icon} ${label}${detail ? `: ${detail}` : ''}`;
    }
    const stateIcon = state === 'done' ? theme.fg('success', '✔') : state === 'error' ? theme.fg('error', '✖') : theme.fg('accent', '⏳');
    const depth = opts?.depth || 0;
    const treePre = depth > 0 ? `${'  '.repeat(depth - 1)}${opts?.isLast ? '└─ ' : '├─ '}` : '';
    const elapsedStr = opts?.elapsed ? ` ${theme.fg('muted', opts.elapsed)}` : '';
    const collapsedHint = state === 'done' && detail ? ` ${theme.fg('muted', `… +${detail.split('\n').length} lines`)}` : '';
    return `  ${treePre}${stateIcon} ${theme.bold(`${icon} ${label}`)}${detail && state !== 'done' ? theme.fg('muted', `: ${detail}`) : collapsedHint}${elapsedStr}`;
}

export function renderThinkingCollapse(text: string, lineCount: number, expanded: boolean): string {
    const theme = getTheme();
    if (!theme) return `  \x1b[3m\x1b[2m${expanded ? text : `Thinking … +${lineCount} lines`}\x1b[0m`;
    if (expanded || lineCount <= 1) return `  ${theme.fg('muted', theme.italic(text))}`;
    return `  ${theme.fg('muted', theme.italic(`Thinking … +${lineCount} lines`))}`;
}

export function renderSubagentTree(agents: Array<{
    name: string;
    status: string;
    elapsed?: string;
    model?: string;
    description?: string;
    children?: Array<{ label: string; detail?: string }>;
}>): string[] {
    const theme = getTheme();
    if (!theme) return [];
    const lines: string[] = [];
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i]!;
        const isLast = i === agents.length - 1;
        const pre = isLast ? '└─' : '├─';
        const stIcon = a.status === 'completed' ? theme.fg('success', '✔') : a.status === 'running' ? theme.fg('accent', '⏳') : theme.fg('warning', '①');
        lines.push(`  ${pre} ${stIcon} ${theme.bold(a.name)}${a.elapsed ? ` ${theme.fg('muted', a.elapsed)}` : ''}`);
        if (a.description) lines.push(`  ${isLast ? '   ' : '│  '}${theme.fg('muted', `Description: ${a.description}`)}`);
        if (a.model) lines.push(`  ${isLast ? '   ' : '│  '}${theme.fg('muted', `Agent: ${a.model}`)}`);
        if (a.children) {
            for (let j = 0; j < a.children.length; j++) {
                const ch = a.children[j]!;
                const chPre = j === a.children.length - 1 ? '└─' : '├─';
                lines.push(`  ${isLast ? '   ' : '│  '}${chPre} ${theme.fg('muted', `${ch.label}${ch.detail ? `: ${ch.detail}` : ''}`)}`);
            }
        }
    }
    return lines;
}

export function renderStatusBar(segments: {
    model?: string;
    engine: string;
    engineAccent: string;
    state: string;
    elapsed?: string | undefined;
    bgtask?: number | undefined;
    gitBranch?: string | undefined;
    cwd?: string | undefined;
    port?: number | undefined;
}): string {
    const theme = getTheme();
    if (!theme) return `  ${segments.engine} | ${segments.state}`;
    const icon = (() => { try { const { sharkIcon } = require('./icons.js'); return sharkIcon(); } catch { return '🦈'; } })();
    const sep = theme.fg('muted', ' │ ');
    const parts: string[] = [];
    if (segments.model) parts.push(theme.fg('accent', segments.model));
    parts.push(`${segments.engineAccent}${theme.bold(`${icon} ${segments.engine}`)}`);
    const stateColor = segments.state === 'idle' ? 'muted' : 'accent';
    parts.push(theme.fg(stateColor, segments.state));
    if (segments.elapsed) parts.push(theme.fg('muted', segments.elapsed));
    if (segments.bgtask && segments.bgtask > 0) parts.push(theme.fg('warning', `⏳${segments.bgtask}`));
    if (segments.gitBranch) parts.push(theme.fg('muted', `ⴲ ${segments.gitBranch}`));
    if (segments.cwd) parts.push(theme.fg('muted', `📁 ${segments.cwd}`));
    if (segments.port) parts.push(theme.fg('muted', `:${segments.port}`));
    parts.push(theme.fg('muted', '/quit  /clear'));
    const cols = process.stdout.columns || 80;
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    let result = `  ${parts.join(sep)}`;
    while (stripAnsi(result).length > cols && parts.length > 3) {
        parts.splice(-2, 1);
        result = `  ${parts.join(sep)}`;
    }
    return result;
}
