import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const folderPanelSource = readFileSync('public/manager/src/folder-panel/FolderPanel.tsx', 'utf8');
const folderCss = readFileSync('public/manager/src/folder-panel/folder-panel.css', 'utf8');
const shortcutsSource = readFileSync('public/manager/src/manager-shortcuts.ts', 'utf8');

test('FolderPanel keeps folder shortcuts local instead of global Manager actions', () => {
    assert.equal(shortcutsSource.includes('folderCopyPath'), false);
    assert.equal(shortcutsSource.includes('folderRevealPath'), false);
    assert.ok(folderPanelSource.includes('handleEntryKeyDown'), 'FolderPanel must own row-local keyboard actions');
});

test('FolderPanel row shortcuts copy paths and activate rows locally', () => {
    assert.ok(folderPanelSource.includes("event.key.toLowerCase() === 'c'"), 'Cmd/Ctrl+C must be handled on rows');
    assert.ok(folderPanelSource.includes("event.shiftKey ? 'absolute' : 'relative'"), 'Shift+C must select absolute path while Cmd/Ctrl+C uses relative path');
    assert.ok(folderPanelSource.includes('event.stopPropagation()'), 'row copy shortcut must not bubble into global shortcuts');
    assert.ok(folderPanelSource.includes("event.key === 'Enter'"), 'Enter must activate focused row');
    assert.ok(folderPanelSource.includes("event.key === ' '"), 'Space must have explicit row behavior');
    assert.ok(folderPanelSource.indexOf("event.key === ' '") < folderPanelSource.indexOf("if (entry.kind !== 'file') return"), 'Space must prevent native button activation before directory no-op');
    assert.ok(folderPanelSource.includes('selectAndActivateEntry(entry'), 'row activation must share one helper');
});

test('FolderPanel context menu exposes native path actions', () => {
    for (const label of ['Copy Path', 'Copy Relative Path', 'Reveal in Finder', 'Open Folder', 'Refresh']) {
        assert.ok(folderPanelSource.includes(label), `context menu must include ${label}`);
    }
    assert.ok(folderPanelSource.includes('role="menu"'), 'context menu must expose menu role');
    assert.ok(folderPanelSource.includes('role="menuitem"'), 'context menu actions must expose menuitem role');
    assert.ok(folderPanelSource.includes('setContextMenu(null); void copyEntryPath'), 'copy menu actions must close menu before running');
    assert.ok(folderPanelSource.includes('setContextMenu(null); void revealEntryPath'), 'reveal menu action must close menu before running');
    assert.ok(folderPanelSource.includes('setContextMenu(null); void loadDir'), 'refresh menu action must close menu before running');
    assert.ok(folderPanelSource.includes("event.key === 'Escape'"), 'keyboard dismissal must be Escape-only');
    assert.ok(folderPanelSource.includes('onKeyDown={event => event.stopPropagation()}'), 'menu keyboard activation must not be swallowed by window dismissal');
});

test('FolderPanel focus and context menu styles stay compact', () => {
    assert.ok(folderCss.includes('.folder-entry-btn:focus-visible'), 'row buttons need visible keyboard focus');
    assert.ok(folderCss.includes('.folder-context-menu'), 'context menu must have scoped styles');
    assert.ok(folderCss.includes('position: fixed'), 'context menu must not resize tree rows');
    assert.ok(folderCss.includes('text-overflow: ellipsis'), 'menu text must not overflow');
});
