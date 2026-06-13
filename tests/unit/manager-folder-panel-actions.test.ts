import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createNotesVaultFolderSource } from '../../public/manager/src/folder-panel/folder-sources.js';

const root = join(import.meta.dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

test('FolderPanel wires native move, copy, reveal, and confirmation actions', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');

    assert.ok(panel.includes("import { copyText } from '../clipboard/copy-text'"), 'FolderPanel must use the shared copyText helper');
    assert.ok(panel.includes('draggable={canUseNativeActions}'), 'FolderPanel rows must become draggable in Electron mode');
    assert.ok(panel.includes('const [pendingMove'), 'FolderPanel must store pending move confirmation state');
    assert.ok(panel.includes('skipInternalMoveConfirm'), 'FolderPanel must support session-local skip confirmation state');
    assert.ok(panel.includes("className=\"folder-move-confirm\""), 'FolderPanel must render a move confirmation surface');
    assert.ok(panel.includes('source.movePath'), 'FolderPanel must call the source move path API');
    assert.ok(panel.includes('source.revealPath'), 'FolderPanel must call the source reveal path API');
    assert.ok(panel.includes('props.onPreviewFile?.(entry.path)'), 'file clicks must keep preview behavior');
    assert.ok(panel.includes('toggleExpand(entry.path)'), 'directory clicks must keep expand behavior');
});

test('FolderPanel separates preview selection from local action selection', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');

    assert.ok(panel.includes('selectedPath === entry.path'), 'local action selection must use selectedPath');
    assert.ok(
        panel.includes("aria-selected={entry.kind === 'file' && entry.path === props.selectedFilePath}"),
        'aria-selected must preserve the selected preview file meaning',
    );
    assert.ok(panel.includes("'is-selected'"), 'local selection must use a separate CSS class');
});

test('folder panel CSS exposes selected, drop target, drag, action, and confirm states', () => {
    const css = read('public/manager/src/folder-panel/folder-panel.css');

    for (const selector of [
        '.folder-entry.is-selected',
        '.folder-entry.is-drop-target',
        '.folder-entry.is-dragging',
        '.folder-action-row',
        '.folder-action-btn',
        '.folder-move-confirm',
        '.folder-move-confirm__actions',
        '.folder-status',
    ]) {
        assert.ok(css.includes(selector), `folder panel CSS must include ${selector}`);
    }
});

test('notes-vault folder source remains read-only for native filesystem actions', () => {
    const source = createNotesVaultFolderSource([], 'notes');

    assert.equal(source.kind, 'notes-vault');
    assert.equal(source.canPickRoot, false);
    assert.equal(source.movePath, undefined);
    assert.equal(source.revealPath, undefined);
});
