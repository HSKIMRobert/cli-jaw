import { ipcMain } from 'electron';
import { isAllowedSender } from '../ipc-origin-guard.js';
import {
    getDiffSummary,
    getFileDiff,
    getRepoRoot,
    readCandidate,
    readDiffOptions,
    resolveRepoCandidates,
    type DiffRootCandidate,
} from '../../../../../src/manager/git/diff-service.js';

export function registerDiffIpc(): void {
    ipcMain.handle('diff:getRepoRoot', async (event, cwd: string) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        try {
            const root = await getRepoRoot(cwd);
            return { ok: true, root };
        } catch (error) {
            return { ok: false, error: (error as Error).message || 'not a git repository' };
        }
    });

    ipcMain.handle('diff:getRepoCandidates', async (event, rawCandidates: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        const candidates = Array.isArray(rawCandidates)
            ? rawCandidates.map(readCandidate).filter((candidate): candidate is DiffRootCandidate => candidate !== null)
            : [];
        return { ok: true, candidates: await resolveRepoCandidates(candidates) };
    });

    ipcMain.handle('diff:getDiffSummary', async (event, repoRoot: string, rawOptions?: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        const parsed = readDiffOptions(rawOptions);
        if (!parsed.ok) return parsed;
        try {
            const files = await getDiffSummary(repoRoot, parsed.options);
            return { ok: true, files };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('diff:getFileDiff', async (event, repoRoot: string, filePath: string, rawOptions?: unknown) => {
        if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
        const parsed = readDiffOptions(rawOptions);
        if (!parsed.ok) return parsed;
        try {
            const diff = await getFileDiff(repoRoot, filePath, parsed.options);
            return { ok: true, diff };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
}
