import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routerSource = readFileSync('public/manager/src/SidebarRailRouter.tsx', 'utf8');
const diffPanelSource = readFileSync('public/manager/src/diff-panel/DiffPanel.tsx', 'utf8');

test('right sidebar router passes the shared folder state into DiffPanel', () => {
    assert.ok(routerSource.includes('folderRootPath={folderRootPath}'), 'DiffPanel must receive the right sidebar folder root');
    assert.ok(routerSource.includes('selectedFilePath={previewFilePath}'), 'DiffPanel must receive the right sidebar selected file');
    assert.ok(routerSource.includes('onFolderRootChange={onFolderRootChange}'), 'DiffPanel must be able to update the FolderPanel root');
    assert.ok(routerSource.includes('onPreviewFile={onPreviewFile}'), 'DiffPanel must be able to update the shared preview file');
});

test('DiffPanel treats FolderPanel root as a first-class repo candidate', () => {
    assert.ok(diffPanelSource.includes('folderRootPath?: string | null'), 'DiffPanel props must expose FolderPanel root');
    assert.ok(diffPanelSource.includes('selectedFilePath?: string | null'), 'DiffPanel props must expose selected FolderPanel file');
    assert.ok(diffPanelSource.includes('function folderRepoCandidate'), 'DiffPanel must label the FolderPanel root as a repo candidate');
    assert.ok(diffPanelSource.includes('candidates.unshift(folderRepoCandidate(props.folderRootPath))'), 'FolderPanel root must be preferred before instance/home candidates');
    assert.ok(diffPanelSource.includes('const folderRoot = props.folderRootPath'), 'repo selection must inspect the shared FolderPanel root');
    assert.ok(diffPanelSource.includes('if (folderRoot) return folderRoot'), 'FolderPanel root must override a stale valid DiffPanel root');
});

test('DiffPanel and FolderPanel keep file selection synchronized both ways', () => {
    assert.ok(diffPanelSource.includes('function absoluteDiffPath'), 'DiffPanel must convert repo-relative diff paths to absolute FolderPanel paths');
    assert.ok(diffPanelSource.includes('function relativeDiffPath'), 'DiffPanel must convert absolute FolderPanel paths to repo-relative diff paths');
    assert.ok(diffPanelSource.includes('props.onFolderRootChange?.(root)'), 'DiffPanel root changes must update FolderPanel root');
    assert.ok(diffPanelSource.includes('props.onPreviewFile?.(absolutePath)'), 'DiffPanel file clicks must update shared preview/folder selection');
    assert.ok(diffPanelSource.includes('relativeDiffPath(repoRoot, props.selectedFilePath ?? null)'), 'FolderPanel file selection must be able to select the matching diff item');
    assert.ok(diffPanelSource.includes('onClick={() => handleFileSelect(f.path)}'), 'diff file rows must route through the synchronized selection helper');
});
