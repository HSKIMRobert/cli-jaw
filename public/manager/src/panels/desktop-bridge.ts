export type TerminalBridgeApi = {
    create: (opts?: { cwd?: string }) => Promise<{ ok: boolean; id?: string; shell?: string; cwd?: string; error?: string }>;
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
    pickFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    listDir: (dirPath: string, depth?: number) => Promise<{ ok: boolean; entries?: Array<{ name: string; path: string; kind: 'file' | 'directory'; size: number }>; error?: string }>;
    readFile: (filePath: string) => Promise<{ ok: boolean; content?: string; truncated?: boolean; binary?: boolean; error?: string }>;
    watchDir: (dirPath: string) => Promise<void>;
    unwatchDir: (dirPath: string) => Promise<void>;
    onDirChange: (cb: (dirPath: string) => void) => () => void;
};

export type CliJawDesktopApi = {
    identify: () => { name: string; electron: boolean; header: string };
    getMetrics: () => unknown;
    terminal?: TerminalBridgeApi | undefined;
    diff?: DiffBridgeApi | undefined;
    folder?: FolderBridgeApi | undefined;
};

export function getDesktop(): CliJawDesktopApi | null {
    return (window as unknown as { cliJawDesktop?: CliJawDesktopApi }).cliJawDesktop ?? null;
}

export function isElectron(): boolean {
    return getDesktop()?.identify?.()?.electron === true;
}
