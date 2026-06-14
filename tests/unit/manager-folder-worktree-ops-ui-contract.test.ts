import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

test('FolderPanel wires worktree operation dialog without project surface coupling', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const toolbar = read('public/manager/src/folder-panel/FolderPanelToolbar.tsx');

    assert.ok(panel.includes("import { FolderWorktreeOpsDialog } from './FolderWorktreeOpsDialog'"), 'FolderPanel must render the worktree ops dialog');
    assert.ok(panel.includes('runWorktreeOperationClient'), 'FolderPanel must execute through the client boundary');
    assert.ok(panel.includes('setWorktreeOpsOpen(true)'), 'FolderPanel must expose an open handler');
    assert.ok(panel.includes('worktreeState.refresh()'), 'worktree operations must refresh worktree list');
    assert.ok(panel.includes('setGitRefreshToken(token => token + 1)'), 'worktree operations must refresh git status');
    assert.equal(panel.includes('projectDirs'), false, 'worktree ops must not mutate projectDirs');
    assert.equal(panel.includes('terminal'), false, 'worktree ops must not mutate terminal cwd');
    assert.equal(panel.includes('iframe'), false, 'worktree ops must not mutate preview iframe state');
    assert.ok(toolbar.includes('onOpenWorktreeOps'), 'toolbar must accept worktree ops opener');
    assert.ok(toolbar.includes('Ops'), 'toolbar must expose compact Ops entry');
});

test('worktree operation client keeps preview and run signatures aligned', () => {
    const client = read('public/manager/src/folder-panel/folder-worktree-ops-client.ts');
    const bridge = read('public/manager/src/panels/desktop-bridge.ts');
    const types = read('public/manager/src/folder-panel/folder-worktree-types.ts');

    assert.ok(types.includes('export type GitWorktreeOperation ='), 'frontend mirror must own operation type');
    assert.ok(types.includes('export type GitWorktreeOperationPreview ='), 'frontend mirror must own preview type');
    assert.ok(bridge.includes('operation: GitWorktreeOperation'), 'desktop bridge must use frontend operation type');
    assert.equal(client.includes('src/manager/git/worktree-operations'), false, 'frontend client must not import backend operation service');
    assert.ok(client.includes('folderPanelRoot: input.folderPanelRoot'), 'preview/run HTTP bodies must include FolderPanel root');
    assert.ok(client.includes('repoRoot = input.repoRoot ?? undefined'), 'client must normalize nullable repo root');
    assert.ok(client.includes('} catch (error) {'), 'client must catch bridge/fetch/json failures');
});

test('worktree operation dialog owns preview state, confirmation, and force-remove feedback', () => {
    const dialog = read('public/manager/src/folder-panel/FolderWorktreeOpsDialog.tsx');
    const css = read('public/manager/src/folder-panel/folder-panel.css');

    assert.ok(dialog.includes('previewLoading'), 'dialog must own preview loading state');
    assert.ok(dialog.includes('previewError'), 'dialog must own preview error state');
    assert.ok(dialog.includes('previewResult'), 'dialog must own preview result state');
    assert.ok(dialog.includes('disabled={!canRun}'), 'dialog must disable run until preview and confirmation are valid');
    assert.ok(dialog.includes('Force remove dirty worktree'), 'dialog must expose explicit force remove copy');
    assert.ok(dialog.includes('git worktree remove --force'), 'dialog or preview copy must expose force command transition');
    for (const selector of [
        '.folder-worktree-ops',
        '.folder-worktree-ops__panel',
        '.folder-worktree-ops__row',
        '.folder-worktree-ops__preview',
        '.folder-worktree-ops__actions',
        '.folder-worktree-ops__warning',
    ]) {
        assert.ok(css.includes(selector), `folder panel CSS must include ${selector}`);
    }
});
