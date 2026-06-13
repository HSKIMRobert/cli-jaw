/**
 * ws event → jawcode Component state adapter.
 * Bridges cli-jaw's WS-based event system to jawcode TUI components.
 * This is the key integration layer — ws events from the server are
 * translated into jawcode Component tree mutations.
 */
import { initJawcodeTui, renderMarkdownJawcode, renderTextBox, isInitialized } from './jawcode-render.js';

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
    recentSessions?: Array<{ label: string; ago: string }> | undefined;
}): string[] {
    if (!isInitialized()) return [];
    const DIM = '\x1b[2m';
    const BOLD = '\x1b[1m';
    const CYAN = '\x1b[36m';
    const GREEN = '\x1b[32m';
    const RST = '\x1b[0m';

    // Left pane: info
    const left = [
        `${BOLD}${opts.engineAccent}${opts.engine}${RST}`,
        `${DIM}bite · build · ship${RST}`,
        `${DIM}v${opts.version}${RST}`,
        '',
        `${DIM}model:${RST}      ${BOLD}${opts.model}${RST}`,
        `${DIM}directory:${RST}   ${CYAN}${opts.directory}${RST}`,
        `${DIM}server:${RST}     ${GREEN}●${RST} localhost:${opts.serverPort}`,
    ];
    if (opts.ideDiff) left.push(`${DIM}ide diff:${RST}   ${GREEN}●${RST} ${opts.ideDiff}`);
    if (opts.gitBranch) left.push(`${DIM}branch:${RST}     ${DIM}ⴲ ${opts.gitBranch}${RST}`);

    // Right pane: flow keys + session trail
    const right = [
        `${BOLD}Flow keys${RST}`,
        `${DIM}/  ·  #  ·  !  ·  $  ·  ?${RST}`,
        `${DIM}ctrl+l · shift+tab${RST}`,
        '',
        `${BOLD}Session trail${RST}`,
    ];
    if (opts.recentSessions && opts.recentSessions.length > 0) {
        for (const s of opts.recentSessions.slice(0, 3)) {
            right.push(`${DIM}▸ ${s.label} (${s.ago})${RST}`);
        }
    } else {
        right.push(`${DIM}No recent sessions${RST}`);
    }
    right.push('');
    right.push(`${DIM}/resume${RST}`);

    // Merge dual-pane
    const maxRows = Math.max(left.length, right.length);
    const leftW = 30;
    const merged: string[] = [];
    for (let i = 0; i < maxRows; i++) {
        const l = left[i] || '';
        const r = right[i] || '';
        const lVisible = l.replace(/\x1b\[[0-9;]*m/g, '');
        const pad = Math.max(0, leftW - lVisible.length);
        merged.push(`${l}${' '.repeat(pad)}${DIM}│${RST} ${r}`);
    }

    return renderTextBox(`${CYAN}${BOLD}cli-jaw${RST} ${DIM}v${opts.version}${RST}`, merged, 70);
}

export function renderAssistantChunk(text: string, width: number): string[] {
    if (!isInitialized()) return [text];
    return renderMarkdownJawcode(text, width);
}

export function renderToolLine(icon: string, label: string, detail: string, state: 'pending' | 'done' | 'error', opts?: { depth?: number; isLast?: boolean; elapsed?: string }): string {
    const stateIcon = state === 'done' ? '\x1b[32m✔\x1b[0m' : state === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[36m⏳\x1b[0m';
    const labelColor = state === 'error' ? '\x1b[31m' : '\x1b[36m';
    const depth = opts?.depth || 0;
    const treePre = depth > 0 ? `${'  '.repeat(depth - 1)}${opts?.isLast ? '└─ ' : '├─ '}` : '';
    const elapsedStr = opts?.elapsed ? ` \x1b[2m${opts.elapsed}\x1b[0m` : '';
    const collapsedHint = state === 'done' && detail ? ` \x1b[2m… +${detail.split('\n').length} lines\x1b[0m` : '';
    return `  ${treePre}${stateIcon} ${labelColor}\x1b[1m${icon} ${label}\x1b[0m${detail && state !== 'done' ? `\x1b[2m: ${detail}\x1b[0m` : collapsedHint}${elapsedStr}`;
}

export function renderThinkingCollapse(text: string, lineCount: number, expanded: boolean): string {
    if (expanded || lineCount <= 1) return `  \x1b[3m\x1b[2m${text}\x1b[0m`;
    return `  \x1b[3m\x1b[2mThinking … +${lineCount} lines\x1b[0m`;
}

export function renderSubagentTree(agents: Array<{
    name: string;
    status: string;
    elapsed?: string;
    model?: string;
    description?: string;
    children?: Array<{ label: string; detail?: string }>;
}>): string[] {
    const lines: string[] = [];
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i]!;
        const isLast = i === agents.length - 1;
        const pre = isLast ? '└─' : '├─';
        const stIcon = a.status === 'completed' ? '\x1b[32m✔\x1b[0m' : a.status === 'running' ? '\x1b[36m⏳\x1b[0m' : '\x1b[33m①\x1b[0m';
        lines.push(`  ${pre} ${stIcon} \x1b[1m${a.name}\x1b[0m${a.elapsed ? ` \x1b[2m${a.elapsed}\x1b[0m` : ''}`);
        if (a.description) lines.push(`  ${isLast ? '   ' : '│  '}\x1b[2mDescription: ${a.description}\x1b[0m`);
        if (a.model) lines.push(`  ${isLast ? '   ' : '│  '}\x1b[2mAgent: ${a.model}\x1b[0m`);
        if (a.children) {
            for (let j = 0; j < a.children.length; j++) {
                const ch = a.children[j]!;
                const chPre = j === a.children.length - 1 ? '└─' : '├─';
                lines.push(`  ${isLast ? '   ' : '│  '}${chPre} \x1b[2m${ch.label}${ch.detail ? `: ${ch.detail}` : ''}\x1b[0m`);
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
}): string {
    const sep = '\x1b[2m │ \x1b[0m';
    const parts: string[] = [];
    if (segments.model) parts.push(`\x1b[36m${segments.model}\x1b[0m`);
    parts.push(`${segments.engineAccent}\x1b[1m${segments.engine}\x1b[0m`);
    const stateColor = segments.state === 'idle' ? '\x1b[2m' : segments.engineAccent;
    parts.push(`${stateColor}${segments.state}\x1b[0m`);
    if (segments.elapsed) parts.push(`\x1b[2m${segments.elapsed}\x1b[0m`);
    if (segments.bgtask && segments.bgtask > 0) parts.push(`\x1b[35m⏳${segments.bgtask}\x1b[0m`);
    if (segments.gitBranch) parts.push(`\x1b[2mⴲ ${segments.gitBranch}\x1b[0m`);
    if (segments.cwd) parts.push(`\x1b[2m📁 ${segments.cwd.replace(process.env['HOME'] || '', '~')}\x1b[0m`);
    parts.push('\x1b[2m/quit  /clear\x1b[0m');
    return `  ${parts.join(sep)}`;
}
