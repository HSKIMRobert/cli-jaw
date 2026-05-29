/**
 * TUI shared types, constants, and helpers.
 */
import type { TuiStore } from '../../../src/cli/tui/store.js';
import type { StreamSink } from '../../../src/cli/tui/stream.js';
import type { IdeType } from '../../../src/ide/diff.js';
import type WebSocket from 'ws';

// ─── ANSI color codes ────────────────────────
export const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

export const cliLabel: Record<string, string> = {
    agy: 'Antigravity',
    'ai-e': 'AI-E',
    claude: 'Claude Code',
    'claude-e': 'Claude E',
    codex: 'Codex',
    'codex-app': 'Codex App',
    cursor: 'Cursor',
    gemini: 'Gemini CLI',
    grok: 'Grok',
    opencode: 'OpenCode',
    copilot: 'Copilot',
};
export const cliColor: Record<string, string> = {
    agy: c.green,
    'ai-e': c.green,
    claude: c.magenta,
    'claude-e': c.magenta,
    codex: c.red,
    'codex-app': c.red,
    cursor: c.cyan,
    gemini: c.blue,
    grok: c.gray,
    opencode: c.yellow,
    copilot: c.cyan,
};

export const ESC_WAIT_MS = 70;

// ─── Terminal dimension helpers ──────────────
export const W = () => Math.max(20, Math.min((process.stdout.columns || 60) - 4, 60));
export const hrLine = () => '-'.repeat(W());
export const getRows = () => process.stdout.rows || 24;

export function renderCommandText(text: string) {
    return String(text || '').replace(/\n/g, '\n  ');
}

/** Footer string with a live state segment. Pure — used by rebuildFooter. */
export function formatFooter(
    label: string,
    accent: string,
    state: 'idle' | 'responding' | 'tool',
    elapsedMs?: number,
): string {
    const stateLabel = state === 'responding' ? 'responding…' : state === 'tool' ? 'working…' : 'idle';
    const stateColored = state === 'idle' ? `${c.dim}${stateLabel}${c.reset}` : `${accent}${stateLabel}${c.reset}`;
    const elapsed = elapsedMs && elapsedMs > 0 ? `  ${c.dim}${(elapsedMs / 1000).toFixed(1)}s${c.reset}` : '';
    return `  ${accent}${label}${c.reset}  ${c.dim}·${c.reset}  ${stateColored}${elapsed}  ${c.dim}|  /quit  /clear${c.reset}`;
}

// ─── Shared state interface ──────────────────
export interface TuiContext {
    ws: WebSocket;
    apiUrl: string;

    info: { cli: string; workingDir: string; model: string };
    accent: string;
    label: string;
    dir: string;
    runtimeLocale: string;
    tuiConfig: { pasteCollapseLines: number; pasteCollapseChars: number; [k: string]: unknown };
    values: { port: string; raw: boolean; simple: boolean };
    isRaw: boolean;

    store: TuiStore;

    overlayBoxHeight: number;
    inputActive: boolean;
    streaming: boolean;
    streamState: 'idle' | 'responding' | 'tool';
    turnStartedAt: number;
    streamSink: StreamSink | null;
    commandRunning: boolean;
    escPending: boolean;
    escTimer: ReturnType<typeof setTimeout> | null;
    prevLineCount: number;
    promptCursorRow: number;
    resizeTimer: ReturnType<typeof setTimeout> | null;

    ideEnabled: boolean;
    idePopEnabled: boolean;
    preFileSetQueue: Map<string, string>[];
    chatCwd: string;
    isGit: boolean;
    detectedIde: IdeType;

    promptPrefix: string;
    footer: string;
}
