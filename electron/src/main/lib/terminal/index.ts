import { ipcMain, type BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { discoverShell } from './shell-discovery.js';
import { sanitizeEnv } from './env-sanitize.js';

const MAX_SESSIONS = 8;
const BUFFER_CAP = 1024 * 1024;

type TermSession = {
    id: string;
    proc: ChildProcess;
    buffer: string;
};

const sessions = new Map<string, TermSession>();
let counter = 0;

function isAllowedCwd(cwd: string): boolean {
    const home = homedir();
    const resolved = resolve(cwd);
    return resolved.startsWith(home);
}

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle('terminal:create', (_event, opts?: { cwd?: string }) => {
        if (sessions.size >= MAX_SESSIONS) {
            return { ok: false, error: 'max sessions reached' };
        }
        const id = `term_${++counter}`;
        const shell = discoverShell();
        let cwd = opts?.cwd ?? homedir();
        if (!isAllowedCwd(cwd) || !existsSync(cwd)) cwd = homedir();
        const env = sanitizeEnv();

        const proc = spawn(shell, ['-l'], {
            cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        const session: TermSession = { id, proc, buffer: '' };
        sessions.set(id, session);

        proc.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            session.buffer += text;
            if (session.buffer.length > BUFFER_CAP) {
                session.buffer = session.buffer.slice(-BUFFER_CAP);
            }
            const win = getWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:data', id, text);
            }
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            const win = getWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:data', id, text);
            }
        });

        proc.on('exit', (code) => {
            sessions.delete(id);
            const win = getWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:exit', id, code);
            }
        });

        return { ok: true, id, shell, cwd };
    });

    ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
        const session = sessions.get(id);
        if (!session) return;
        session.proc.stdin?.write(data);
    });

    ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
        // resize only works with node-pty; with spawn we send SIGWINCH
        const session = sessions.get(id);
        if (!session) return;
        try {
            // Environment variable approach for shell resize
            session.proc.stdin?.write(`\x1b[8;${rows};${cols}t`);
        } catch {
            // ignore
        }
    });

    ipcMain.handle('terminal:kill', (_event, id: string) => {
        const session = sessions.get(id);
        if (!session) return;
        session.proc.kill('SIGTERM');
        sessions.delete(id);
    });
}

export function cleanupTerminals(): void {
    for (const [, session] of sessions) {
        try { session.proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    sessions.clear();
}
