import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { readdir, stat, lstat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { watch, type FSWatcher } from 'node:fs';
import { isWithinHome, assertContained } from '../path-security.js';

const READ_CAP = 512 * 1024;
const DEPTH_LIMIT = 5;
const MAX_WATCHERS = 4;

const watchers = new Map<string, FSWatcher>();
let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const pickedRoots = new Set<string>();

function isAllowedByRoot(p: string): boolean {
    if (pickedRoots.size === 0) return false;
    for (const root of pickedRoots) {
        if (assertContained(root, p)) return true;
    }
    return false;
}

function isBinary(buf: Buffer): boolean {
    for (let i = 0; i < Math.min(buf.length, 8000); i++) {
        if (buf[i] === 0) return true;
    }
    return false;
}

export function registerFolderIpc(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle('folder:pick', async () => {
        const win = getWindow();
        if (!win) return { ok: false, error: 'no window' };
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            defaultPath: homedir(),
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' };
        const picked = result.filePaths[0];
        if (!isWithinHome(picked)) return { ok: false, error: 'path not allowed' };
        pickedRoots.add(resolve(picked));
        return { ok: true, path: picked };
    });

    ipcMain.handle('folder:listDir', async (_event, dirPath: string, _depth?: number) => {
        if (!isAllowedByRoot(dirPath)) return { ok: false, error: 'path not allowed — pick a folder first' };
        const resolved = resolve(dirPath);
        try {
            const names = await readdir(resolved);
            const entries = [];
            for (const name of names.slice(0, 500)) {
                if (name.startsWith('.')) continue;
                try {
                    const full = join(resolved, name);
                    const ls = await lstat(full);
                    if (ls.isSymbolicLink()) continue;
                    const s = ls;
                    entries.push({
                        name,
                        path: full,
                        kind: s.isDirectory() ? 'directory' as const : 'file' as const,
                        size: s.size,
                    });
                } catch {
                    // skip unreadable entries
                }
            }
            entries.sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            return { ok: true, entries };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('folder:readFile', async (_event, filePath: string) => {
        if (!isAllowedByRoot(filePath)) return { ok: false, error: 'path not allowed — pick a folder first' };
        try {
            const ls = await lstat(resolve(filePath));
            if (ls.isSymbolicLink()) return { ok: false, error: 'symlinks not allowed' };
        } catch {
            return { ok: false, error: 'file not accessible' };
        }
        const resolved = resolve(filePath);
        try {
            const s = await stat(resolved);
            if (s.size > READ_CAP) return { ok: true, content: '', truncated: true };
            const buf = await readFile(resolved);
            if (isBinary(buf)) return { ok: true, content: '', binary: true };
            return { ok: true, content: buf.toString('utf-8'), truncated: false, binary: false };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('folder:watchDir', async (_event, dirPath: string) => {
        if (!isAllowedByRoot(dirPath)) return;
        const resolved = resolve(dirPath);
        if (watchers.has(resolved)) return;
        if (watchers.size >= MAX_WATCHERS) return;
        try {
            const w = watch(resolved, { recursive: false }, () => {
                const existing = debounceTimers.get(resolved);
                if (existing) clearTimeout(existing);
                debounceTimers.set(resolved, setTimeout(() => {
                    debounceTimers.delete(resolved);
                    const win = getWindow();
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('folder:changed', resolved);
                    }
                }, 500));
            });
            watchers.set(resolved, w);
        } catch {
            // ignore watch failures
        }
    });

    ipcMain.handle('folder:unwatchDir', async (_event, dirPath: string) => {
        const resolved = resolve(dirPath);
        const w = watchers.get(resolved);
        if (w) {
            w.close();
            watchers.delete(resolved);
        }
    });
}

export function cleanupFolderWatchers(): void {
    for (const [, w] of watchers) {
        try { w.close(); } catch { /* ignore */ }
    }
    watchers.clear();
    for (const [, t] of debounceTimers) clearTimeout(t);
    debounceTimers = new Map();
}
