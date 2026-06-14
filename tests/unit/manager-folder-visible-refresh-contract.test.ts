import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const folderPanelSource = readFileSync('public/manager/src/folder-panel/FolderPanel.tsx', 'utf8');

test('FolderPanel refresh reloads the visible expanded tree and git summaries', () => {
    assert.ok(folderPanelSource.includes('const refreshVisibleTree = useCallback'), 'FolderPanel must expose a visible-tree refresh helper');
    assert.ok(folderPanelSource.includes('const expandedPaths = Array.from(expanded)'), 'refresh must snapshot expanded paths');
    assert.ok(folderPanelSource.includes('await loadDir(rootPath)'), 'refresh must reload the root entries');
    assert.ok(folderPanelSource.includes('await loadChildren(path, { force: true })'), 'refresh must force reload expanded child entries');
    assert.ok(folderPanelSource.includes('worktreeState.refresh()'), 'refresh must also refresh git worktree summaries');
    assert.ok(folderPanelSource.includes('void refreshVisibleTree()'), 'toolbar/context actions must call visible-tree refresh');
    assert.ok(folderPanelSource.includes('source.onDirChange(() => { void refreshVisibleTree(); })'), 'filesystem watch updates must use the same visible-tree refresh path');
});
