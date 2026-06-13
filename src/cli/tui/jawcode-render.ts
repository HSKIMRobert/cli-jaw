/**
 * jawcode TUI Component→stdout bridge.
 * Renders jawcode-style boxes, status lines, and tool blocks
 * using raw ANSI — no dependency on src/lib/tui/ (avoids 49 TS errors).
 * Uses cli-jaw's existing visualWidth for CJK-aware column math.
 */
import { visualWidth } from './renderers.js';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';

export function renderBox(title: string, lines: string[], width: number, borderColor = DIM): string {
    const cols = process.stdout.columns || 80;
    const w = Math.min(width, cols - 2);
    const inner = w - 2;
    const titleStripped = title ? ` ${title} ` : '';
    const titleVisW = visualWidth(titleStripped);
    const topFill = Math.max(0, inner - titleVisW - 1);
    const topBar = `${borderColor}┌─${RESET}${titleStripped}${borderColor}${'─'.repeat(topFill)}┐${RESET}`;
    const botBar = `${borderColor}└${'─'.repeat(inner + 2)}┘${RESET}`;
    const body = lines.map(l => {
        const vis = visualWidth(l);
        const pad = Math.max(0, inner - vis);
        return `${borderColor}│${RESET} ${l}${' '.repeat(pad)} ${borderColor}│${RESET}`;
    }).join('\n');
    return `${topBar}\n${body}\n${botBar}`;
}

export function renderWelcomeBanner(opts: {
    version: string;
    engine: string;
    engineAccent: string;
    model: string;
    directory: string;
    serverPort: number;
    ideDiff?: string | undefined;
}): string {
    const w = Math.min(60, (process.stdout.columns || 80) - 4);
    const lines: string[] = [];

    // Logo (simplified — keep existing ASCII art)
    lines.push('');

    // Info pills
    const info = [
        `${DIM}engine:${RESET}     ${opts.engineAccent}${BOLD}${opts.engine}${RESET}`,
        `${DIM}model:${RESET}      ${BOLD}${opts.model}${RESET}`,
        `${DIM}directory:${RESET}   ${CYAN}${opts.directory}${RESET}`,
        `${DIM}server:${RESET}     ${GREEN}●${RESET} localhost:${opts.serverPort}`,
    ];
    if (opts.ideDiff) info.push(`${DIM}ide diff:${RESET}   ${GREEN}●${RESET} ${opts.ideDiff}`);
    lines.push(...info);
    lines.push('');
    lines.push(`${DIM}${BOLD}Flow keys${RESET}${DIM}: /  ·  #  ·  !  ·  $  ·  ?${RESET}`);

    return renderBox(`${CYAN}${BOLD}cli-jaw${RESET} ${DIM}v${opts.version}${RESET}`, lines, w);
}

export function renderToolBlock(icon: string, label: string, detail: string, state: 'pending' | 'done' | 'error'): string {
    const stateIcon = state === 'done' ? `${GREEN}✔${RESET}` : state === 'error' ? `${RED}✖${RESET}` : `${YELLOW}⏳${RESET}`;
    const borderColor = state === 'error' ? RED : state === 'done' ? DIM : CYAN;
    return `  ${borderColor}▸${RESET} ${stateIcon} ${CYAN}${icon} ${label}${RESET}${detail ? `${DIM}: ${detail}${RESET}` : ''}`;
}

export function renderStatusLine(segments: {
    model?: string | undefined;
    engine: string;
    engineAccent: string;
    state: string;
    elapsed?: string | undefined;
    bgtask?: number | undefined;
    pabcd?: string | undefined;
    gitBranch?: string | undefined;
    gitDirty?: number | undefined;
    gitUntracked?: number | undefined;
    cwd?: string | undefined;
}): string {
    const sep = `${DIM} │ ${RESET}`;
    const parts: string[] = [];

    if (segments.model) parts.push(`${CYAN}${segments.model}${RESET}`);
    parts.push(`${segments.engineAccent}${BOLD}${segments.engine}${RESET}`);
    parts.push(segments.state === 'idle' ? `${DIM}idle${RESET}` : `${segments.engineAccent}${segments.state}${RESET}`);
    if (segments.elapsed) parts.push(`${DIM}${segments.elapsed}${RESET}`);
    if (segments.bgtask && segments.bgtask > 0) parts.push(`${MAGENTA}⏳${segments.bgtask}${RESET}`);
    if (segments.pabcd) parts.push(`${DIM}▶${segments.pabcd}${RESET}`);
    if (segments.gitBranch) {
        let git = `${DIM}ⴲ ${segments.gitBranch}${RESET}`;
        if (segments.gitDirty) git += ` ${DIM}*${segments.gitDirty}${RESET}`;
        if (segments.gitUntracked) git += ` ${DIM}?${segments.gitUntracked}${RESET}`;
        parts.push(git);
    }
    if (segments.cwd) parts.push(`${DIM}📁 ${segments.cwd.replace(process.env['HOME'] || '', '~')}${RESET}`);
    parts.push(`${DIM}/quit  /clear${RESET}`);

    return `  ${parts.join(sep)}`;
}

export function renderThinkingLine(name: string, spinnerChar: string): string {
    return `\r  ${DIM}${spinnerChar} ${name} thinking…${RESET}          \r`;
}

export function renderErrorBox(message: string): string {
    return renderBox(`${RED}${BOLD}Error${RESET}`, [message], 60, RED);
}
