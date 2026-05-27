import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { isWithinHome, assertContainedLexical, isValidRef } from '../path-security.js';

const OUTPUT_CAP = 1024 * 1024;

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
        if (!isWithinHome(cwd)) return { ok: false, error: 'path not allowed' };
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
        if (!isWithinHome(repoRoot)) return { ok: false, error: 'path not allowed' };
        if (ref !== undefined && !isValidRef(ref)) return { ok: false, error: 'invalid ref' };
        try {
            const args = ['diff', '--numstat'];
            if (ref) args.push('--end-of-options', ref);
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
        if (!isWithinHome(repoRoot)) return { ok: false, error: 'path not allowed' };
        if (!assertContainedLexical(repoRoot, filePath)) return { ok: false, error: 'path traversal' };
        if (ref !== undefined && !isValidRef(ref)) return { ok: false, error: 'invalid ref' };
        try {
            const args = ['diff', '--no-color'];
            if (ref) args.push('--end-of-options', ref);
            args.push('--', filePath);
            const diff = await git(args, repoRoot);
            return { ok: true, diff };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
}
