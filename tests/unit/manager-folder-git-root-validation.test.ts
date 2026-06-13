import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveFolderGitRoot } from '../../src/manager/git/folder-root-validation.js';

function makeRepo(): string {
    const repo = mkdtempSync(join(homedir(), 'folder-git-root-'));
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    return repo;
}

test('folder git root validation resolves a home-contained repo root', async () => {
    const repo = makeRepo();
    mkdirSync(join(repo, 'nested'));

    const resolved = await resolveFolderGitRoot(join(repo, 'nested'), repo);

    assert.equal(resolved.repoRoot, repo);
    assert.equal(resolved.folderPanelRoot, join(repo, 'nested'));
});

test('folder git root validation rejects non-git folders quietly', async () => {
    const folder = mkdtempSync(join(homedir(), 'folder-non-git-'));

    await assert.rejects(
        async () => resolveFolderGitRoot(folder),
        /not a git repository/,
    );
});

test('folder git root validation rejects outside-home roots and mismatched repo roots', async () => {
    const repo = makeRepo();
    const otherRepo = makeRepo();

    await assert.rejects(
        async () => resolveFolderGitRoot('/'),
        /folder root is outside home/,
    );
    await assert.rejects(
        async () => resolveFolderGitRoot(repo, otherRepo),
        /repo root mismatch/,
    );
});
