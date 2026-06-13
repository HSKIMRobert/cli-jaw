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
    ideDiff?: string;
    gitBranch?: string;
}): string[] {
    if (!isInitialized()) return [];
    const lines = [
        `engine:     \x1b[1m${opts.engine}\x1b[0m`,
        `model:      \x1b[1m${opts.model}\x1b[0m`,
        `directory:  \x1b[36m${opts.directory}\x1b[0m`,
        `server:     \x1b[32m●\x1b[0m localhost:${opts.serverPort}`,
    ];
    if (opts.ideDiff) lines.push(`ide diff:   \x1b[32m●\x1b[0m ${opts.ideDiff}`);
    if (opts.gitBranch) lines.push(`branch:     \x1b[2mⴲ ${opts.gitBranch}\x1b[0m`);
    lines.push('');
    lines.push(`\x1b[1mFlow keys\x1b[0m\x1b[2m: /  ·  #  ·  !  ·  $  ·  ?\x1b[0m`);
    return renderTextBox(`\x1b[36mcli-jaw\x1b[0m \x1b[2mv${opts.version}\x1b[0m`, lines, 56);
}

export function renderAssistantChunk(text: string, width: number): string[] {
    if (!isInitialized()) return [text];
    return renderMarkdownJawcode(text, width);
}

export function renderToolLine(icon: string, label: string, detail: string, state: 'pending' | 'done' | 'error'): string {
    const stateIcon = state === 'done' ? '\x1b[32m✔\x1b[0m' : state === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[36m⏳\x1b[0m';
    const labelColor = state === 'error' ? '\x1b[31m' : '\x1b[36m';
    return `  ${stateIcon} ${labelColor}\x1b[1m${icon} ${label}\x1b[0m${detail ? `\x1b[2m: ${detail}\x1b[0m` : ''}`;
}

export function renderStatusBar(segments: {
    model?: string;
    engine: string;
    engineAccent: string;
    state: string;
    elapsed?: string;
    bgtask?: number;
    gitBranch?: string;
    cwd?: string;
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
