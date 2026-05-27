import type { DashboardShortcutAction } from '../types';

export type TerminalBridgeApi = {
    create: (opts?: { cwd?: string; cols?: number; rows?: number }) => Promise<{ ok: boolean; id?: string; shell?: string; cwd?: string; error?: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (cb: (id: string, data: string) => void) => () => void;
    onExit: (cb: (id: string, code: number | null) => void) => () => void;
};

export type DiffBridgeApi = {
    getRepoRoot: (cwd: string) => Promise<{ ok: boolean; root?: string; error?: string }>;
    getDiffSummary: (repoRoot: string, ref?: string) => Promise<{ ok: boolean; files?: Array<{ path: string; status: string; insertions: number; deletions: number }>; error?: string }>;
    getFileDiff: (repoRoot: string, filePath: string, ref?: string) => Promise<{ ok: boolean; diff?: string; error?: string }>;
};

export type FolderBridgeApi = {
    getDefaultRoot: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    pickFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    listDir: (dirPath: string, depth?: number) => Promise<{ ok: boolean; entries?: Array<{ name: string; path: string; kind: 'file' | 'directory'; size: number }>; error?: string }>;
    readFile: (filePath: string) => Promise<{ ok: boolean; content?: string; truncated?: boolean; binary?: boolean; error?: string }>;
    watchDir: (dirPath: string) => Promise<void>;
    unwatchDir: (dirPath: string) => Promise<void>;
    onDirChange: (cb: (dirPath: string) => void) => () => void;
};

export type ShortcutBridgeApi = {
    onAction: (cb: (action: DashboardShortcutAction) => void) => () => void;
};

export type CliJawDesktopApi = {
    identify: () => { name: string; electron: boolean; header: string };
    getMetrics: () => unknown;
    getHomePath?: (() => string) | undefined;
    terminal?: TerminalBridgeApi | undefined;
    diff?: DiffBridgeApi | undefined;
    folder?: FolderBridgeApi | undefined;
    shortcuts?: ShortcutBridgeApi | undefined;
};

export function getDesktop(): CliJawDesktopApi | null {
    return (window as unknown as { cliJawDesktop?: CliJawDesktopApi }).cliJawDesktop ?? null;
}

function hasDesktopDocumentMarker(): boolean {
    if (typeof document === 'undefined') return false;
    return document.documentElement.dataset['cliJawDesktop'] === 'true';
}

function hasDesktopUserAgent(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /\bcli-jaw-desktop(?:\/|\b)/.test(navigator.userAgent);
}

export function isElectron(): boolean {
    return getDesktop()?.identify?.()?.electron === true || hasDesktopDocumentMarker() || hasDesktopUserAgent();
}
