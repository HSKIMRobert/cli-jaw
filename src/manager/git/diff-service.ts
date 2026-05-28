import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DashboardDiffMode, DashboardDiffRootPolicy, DashboardInstance } from '../types.js';

const OUTPUT_CAP = 1024 * 1024;
const DIFF_MODES = new Set(['unstaged', 'staged', 'head', 'base']);
const CANDIDATE_SOURCES = new Set(['project', 'working-dir', 'pinned', 'home']);

export type DiffMode = DashboardDiffMode;
export type DiffOptions = {
    mode: DiffMode;
    ref?: string;
    includeUntracked: boolean;
};

export type DiffRootCandidate = {
    path: string;
    label: string;
    source: 'project' | 'working-dir' | 'pinned' | 'home';
};

export type DiffResolvedRoot = DiffRootCandidate & {
    root: string;
    branch: string | null;
    head: string | null;
    dirty: boolean;
};

export type DiffRootSettings = {
    diffRootPolicy: DashboardDiffRootPolicy;
    diffPinnedRootByPort: Record<string, string>;
};

export type DiffFileSummary = {
    path: string;
    status: string;
    insertions: number;
    deletions: number;
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

function resolvedHome(): string {
    try {
        return realpathSync(homedir());
    } catch {
        return resolve(homedir());
    }
}

export function isWithinHome(target: string): boolean {
    const home = resolvedHome();
    let realTarget: string;
    try {
        realTarget = realpathSync(resolve(target));
    } catch {
        const resolved = resolve(target);
        return resolved === home || resolved.startsWith(home + sep);
    }
    return realTarget === home || realTarget.startsWith(home + sep);
}

export function assertContainedLexical(base: string, target: string): boolean {
    let realBase: string;
    try {
        realBase = realpathSync(resolve(base));
    } catch {
        return false;
    }
    const resolved = resolve(realBase, target);
    const rel = relative(realBase, resolved);
    if (!rel || rel === '.') return false;
    return !rel.startsWith('..') && !isAbsolute(rel);
}

export function isValidRef(ref: string): boolean {
    if (!ref || ref.startsWith('-')) return false;
    return /^[a-zA-Z0-9_.\/~^@{}\-]+$/.test(ref);
}

export function readDiffOptions(value: unknown): { ok: true; options: DiffOptions } | { ok: false; error: string } {
    const input = isRecord(value) ? value : {};
    const mode = DIFF_MODES.has(String(input['mode'])) ? input['mode'] as DiffMode : 'unstaged';
    const rawRef = typeof input['ref'] === 'string' && input['ref'].trim() ? input['ref'].trim() : undefined;
    if (rawRef !== undefined && !isValidRef(rawRef)) return { ok: false, error: 'invalid ref' };
    return {
        ok: true,
        options: {
            mode,
            includeUntracked: input['includeUntracked'] === true,
            ...((mode === 'base' || mode === 'head') ? { ref: mode === 'base' ? rawRef ?? 'HEAD' : 'HEAD' } : {}),
        },
    };
}

export function readCandidate(value: unknown): DiffRootCandidate | null {
    if (!isRecord(value)) return null;
    const path = typeof value['path'] === 'string' ? value['path'].trim() : '';
    const label = typeof value['label'] === 'string' && value['label'].trim() ? value['label'].trim() : path;
    const source = CANDIDATE_SOURCES.has(String(value['source'])) ? value['source'] as DiffRootCandidate['source'] : 'project';
    if (!path) return null;
    return { path, label: label.slice(0, 120), source };
}

function pushCandidate(candidates: DiffRootCandidate[], seen: Set<string>, candidate: DiffRootCandidate): void {
    const path = candidate.path.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    candidates.push({ ...candidate, path });
}

export function buildDiffRootCandidates(instance: DashboardInstance | null, homePath: string, settings: DiffRootSettings): DiffRootCandidate[] {
    const candidates: DiffRootCandidate[] = [];
    const seen = new Set<string>();
    const port = instance?.port == null ? null : String(instance.port);
    const pinned = port ? settings.diffPinnedRootByPort[port] : null;
    const projectDirs = instance?.projectDirs?.filter(Boolean) ?? [];
    const workingDir = instance?.workingDir ?? null;

    if (settings.diffRootPolicy === 'manual' && pinned) pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    const projectCandidates = projectDirs.map((path, index) => ({ path, label: index === 0 ? 'Project root' : `Project root ${index + 1}`, source: 'project' as const }));
    const workingCandidates = workingDir ? [{ path: workingDir, label: 'Working dir', source: 'working-dir' as const }] : [];
    const ordered = settings.diffRootPolicy === 'working-dir-first' ? [...workingCandidates, ...projectCandidates] : [...projectCandidates, ...workingCandidates];
    for (const candidate of ordered) pushCandidate(candidates, seen, candidate);
    if (settings.diffRootPolicy !== 'manual' && pinned) pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    if (homePath) pushCandidate(candidates, seen, { path: homePath, label: 'Home fallback', source: 'home' });
    return candidates;
}

function pushDiffModeArgs(args: string[], options: DiffOptions): void {
    if (options.mode === 'staged') args.push('--cached');
    if (options.ref) args.push('--end-of-options', options.ref);
}

function parseNumstat(output: string): DiffFileSummary[] {
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

async function listUntracked(repoRoot: string): Promise<DiffFileSummary[]> {
    const output = await git(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'], repoRoot);
    return output.trim().split('\n').filter(Boolean).map(path => ({ path, status: 'untracked', insertions: 0, deletions: 0 }));
}

async function isUntracked(repoRoot: string, filePath: string): Promise<boolean> {
    const output = await git(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '--', filePath], repoRoot);
    return output.trim().split('\n').includes(filePath);
}

export async function resolveRepoCandidates(candidates: DiffRootCandidate[]): Promise<DiffResolvedRoot[]> {
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
    return resolvedCandidates;
}

export async function getDiffSummary(repoRoot: string, options: DiffOptions): Promise<DiffFileSummary[]> {
    const args = ['-c', 'core.quotepath=false', 'diff', '--numstat'];
    pushDiffModeArgs(args, options);
    args.push('--');
    const output = await git(args, repoRoot);
    const files = parseNumstat(output);
    if (options.includeUntracked) files.push(...await listUntracked(repoRoot));
    return files;
}

export async function getFileDiff(repoRoot: string, filePath: string, options: DiffOptions): Promise<string> {
    if (!assertContainedLexical(repoRoot, filePath)) throw new Error('path traversal');
    if (await isUntracked(repoRoot, filePath)) {
        return await git(['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath], repoRoot, [0, 1]);
    }
    const args = ['-c', 'core.quotepath=false', 'diff', '--no-color'];
    pushDiffModeArgs(args, options);
    args.push('--', filePath);
    return await git(args, repoRoot);
}
