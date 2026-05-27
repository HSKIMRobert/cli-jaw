import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

const OUTPUT_CAP = 1024 * 1024;

function isAllowedPath(p: string): boolean {
    const resolved = resolve(p);
    return resolved.startsWith(homedir());
}

function git(args: string[], cwd: string): Promise<string> {
    return new Promise((res, rej) => {
        execFile('git', args, { cwd, maxBuffer: OUTPUT_CAP, timeout: 30_000 }, (err, stdout) => {
            if (err) rej(err);
            else res(stdout);
        });
    });
}

export function registerDiffIpc(): void {
    ipcMain.handle('diff:getRepoRoot', async (_event, cwd: string) => {
        if (!isAllowedPath(cwd)) return { ok: false, error: 'path not allowed' };
        const resolved = resolve(cwd);
        if (!existsSync(resolved)) return { ok: false, error: 'path does not exist' };
        try {
            const root = (await git(['rev-parse', '--show-toplevel'], resolved)).trim();
            return { ok: true, root };
        } catch {
            return { ok: false, error: 'not a git repository' };
        }
    });

    ipcMain.handle('diff:getDiffSummary', async (_event, repoRoot: string, ref?: string) => {
        if (!isAllowedPath(repoRoot)) return { ok: false, error: 'path not allowed' };
        try {
            const args = ['diff', '--stat', '--numstat'];
            if (ref) args.push(ref);
            const output = await git(args, repoRoot);
            const files = output.trim().split('\n').filter(Boolean).map(line => {
                const parts = line.split('\t');
                const ins = parseInt(parts[0] ?? '0', 10) || 0;
                const del = parseInt(parts[1] ?? '0', 10) || 0;
                const path = parts[2] ?? '';
                const status = ins > 0 && del === 0 ? 'added' as const
                    : ins === 0 && del > 0 ? 'deleted' as const
                    : 'modified' as const;
                return { path, status, insertions: ins, deletions: del };
            }).filter(f => f.path);
            return { ok: true, files };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('diff:getFileDiff', async (_event, repoRoot: string, filePath: string, ref?: string) => {
        if (!isAllowedPath(repoRoot)) return { ok: false, error: 'path not allowed' };
        const resolvedFile = resolve(repoRoot, filePath);
        if (!resolvedFile.startsWith(resolve(repoRoot))) return { ok: false, error: 'path traversal' };
        try {
            const args = ['diff', '--no-color'];
            if (ref) args.push(ref);
            args.push('--', filePath);
            const diff = await git(args, repoRoot);
            return { ok: true, diff };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
}
