import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { isWithinHome, assertContainedLexical, isValidRef } from '../path-security.js';
import { isAllowedSender } from '../ipc-origin-guard.js';

const OUTPUT_CAP = 1024 * 1024;
const DIFF_MODES = new Set(['unstaged', 'staged', 'head', 'base']);
const CANDIDATE_SOURCES = new Set(['project', 'working-dir', 'pinned', 'home']);

type DiffMode = 'unstaged' | 'staged' | 'head' | 'base';
type DiffOptions = {
    mode: DiffMode;
    ref?: string;
    includeUntracked: boolean;
};

type DiffRootCandidate = {
    path: string;
    label: string;
    source: 'project' | 'working-dir' | 'pinned' | 'home';
};

type DiffResolvedRoot = DiffRootCandidate & {
    root: string;
    branch: string | null;
    head: string | null;
    dirty: boolean;
};

function git(args: string[], cwd: string, allowExitCodes: number[] = [0]): Promise<string> {
    return new Promise((res, rej) => {
        execFile('git', args, { cwd, maxBuffer: OUTPUT_CAP, timeout: 30_000 }, (err, stdout, stderr) => {
            if (!err) {
                res(stdout);
                return;
            }
            const exitCode = typeof err.code === 'number' ? err.code : null;
            if (exitCode !== null && allowExitCodes.includes(exitCode)) {
                res(stdout);
                return;
            }
            rej(new Error(stderr.trim() || err.message));
        });
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readDiffOptions(value: unknown): { ok: true; options: DiffOptions } | { ok: false; error: string } {
    const input = isRecord(value) ? value : {};
    const mode = DIFF_MODES.has(String(input['mode'])) ? input['mode'] as DiffMode : 'unstaged';
    const rawRef = typeof input['ref'] === 'string' && input['ref'].trim() ? input['ref'].trim() : undefined;
    if (rawRef !== undefined && !isValidRef(rawRef)) return { ok: false, error: 'invalid ref' };
    return {
        ok: true,
        options: {
            mode,
            ref: mode === 'base' ? rawRef ?? 'HEAD' : mode === 'head' ? 'HEAD' : undefined,
            includeUntracked: input['includeUntracked'] === true,
        },
    };
}

function readCandidate(value: unknown): DiffRootCandidate | null {
    if (!isRecord(value)) return null;
    const path = typeof value['path'] === 'string' ? value['path'].trim() : '';
    const label = typeof value['label'] === 'string' && value['label'].trim() ? value['label'].trim() : path;
    const source = CANDIDATE_SOURCES.has(String(value['source'])) ? value['source'] as DiffRootCandidate['source'] : 'project';
    if (!path) return null;
    return { path, label: label.slice(0, 120), source };
}

function pushDiffModeArgs(args: string[], options: DiffOptions): void {
    if (options.mode === 'staged') args.push('--cached');
    if (options.ref) args.push('--end-of-options', options.ref);
}

function parseNumstat(output: string): Array<{ path: string; status: string; insertions: number; deletions: number }> {
    return output.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('\t');
        const ins = parseInt(parts[0] ?? '0', 10) || 0;
        const del = parseInt(parts[1] ?? '0', 10) || 0;
        const path = parts[2] ?? '';
        const status = ins > 0 && del === 0 ? 'added'
            : ins === 0 && del > 0 ? 'deleted'
            : 'modified';
        return { path, status, insertions: ins, deletions: del };
    }).filter(f => f.path);
}

async function listUntracked(repoRoot: string): Promise<Array<{ path: string; status: string; insertions: number; deletions: number }>> {
    const output = await git(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'], repoRoot);
    return output.trim().split('\n').filter(Boolean).map(path => ({
        path,
        status: 'untracked',
        insertions: 0,
        deletions: 0,
    }));
}

async function isUntracked(repoRoot: string, filePath: string): Promise<boolean> {
    const output = await git(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '--', filePath], repoRoot);
    return output.trim().split('\n').includes(filePath);
}

export function registerDiffIpc(): void {
    ipcMain.handle('diff:getRepoRoot', async (event, cwd: string) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
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

    ipcMain.handle('diff:getRepoCandidates', async (event, rawCandidates: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        const candidates = Array.isArray(rawCandidates)
            ? rawCandidates.map(readCandidate).filter((candidate): candidate is DiffRootCandidate => candidate !== null)
            : [];
        const seen = new Set<string>();
        const resolvedCandidates: DiffResolvedRoot[] = [];
        for (const candidate of candidates) {
            if (!isWithinHome(candidate.path)) continue;
            const resolved = resolve(candidate.path);
            if (!existsSync(resolved)) continue;
            try {
                const root = (await git(['rev-parse', '--show-toplevel'], resolved)).trim();
                if (!root || seen.has(root) || !isWithinHome(root)) continue;
                seen.add(root);
                const branch = (await git(['branch', '--show-current'], root).catch(() => '')).trim() || null;
                const head = (await git(['rev-parse', '--short', 'HEAD'], root).catch(() => '')).trim() || null;
                const dirty = Boolean((await git(['status', '--porcelain'], root).catch(() => '')).trim());
                resolvedCandidates.push({ ...candidate, root, branch, head, dirty });
            } catch {
                // Candidate is not a git repository.
            }
        }
        return { ok: true, candidates: resolvedCandidates };
    });

    ipcMain.handle('diff:getDiffSummary', async (event, repoRoot: string, rawOptions?: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        if (!isWithinHome(repoRoot)) return { ok: false, error: 'path not allowed' };
        const parsed = readDiffOptions(rawOptions);
        if (!parsed.ok) return parsed;
        try {
            const args = ['-c', 'core.quotepath=false', 'diff', '--numstat'];
            pushDiffModeArgs(args, parsed.options);
            args.push('--');
            const output = await git(args, repoRoot);
            const files = parseNumstat(output);
            if (parsed.options.includeUntracked) files.push(...await listUntracked(repoRoot));
            return { ok: true, files };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('diff:getFileDiff', async (event, repoRoot: string, filePath: string, rawOptions?: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        if (!isWithinHome(repoRoot)) return { ok: false, error: 'path not allowed' };
        if (!assertContainedLexical(repoRoot, filePath)) return { ok: false, error: 'path traversal' };
        const parsed = readDiffOptions(rawOptions);
        if (!parsed.ok) return parsed;
        try {
            if (await isUntracked(repoRoot, filePath)) {
                const diff = await git(['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath], repoRoot, [0, 1]);
                return { ok: true, diff };
            }
            const args = ['-c', 'core.quotepath=false', 'diff', '--no-color'];
            pushDiffModeArgs(args, parsed.options);
            args.push('--', filePath);
            const diff = await git(args, repoRoot);
            return { ok: true, diff };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
}
