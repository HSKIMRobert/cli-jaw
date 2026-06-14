import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FolderBridgeApi } from '../../public/manager/src/panels/desktop-bridge.js';
import { createElectronFolderSource, createNotesVaultFolderSource } from '../../public/manager/src/folder-panel/folder-sources.js';

const root = join(import.meta.dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

test('FolderPanel wires native move, copy, reveal, and confirmation actions', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const rows = read('public/manager/src/folder-panel/FolderTreeRows.tsx');

    assert.ok(panel.includes("import { copyText } from '../clipboard/copy-text'"), 'FolderPanel must use the shared copyText helper');
    assert.ok(rows.includes('draggable={props.canUseNativeActions}'), 'FolderPanel rows must become draggable in Electron mode');
    assert.ok(panel.includes('const [pendingMove'), 'FolderPanel must store pending move confirmation state');
    assert.ok(panel.includes('skipInternalMoveConfirm'), 'FolderPanel must support session-local skip confirmation state');
    assert.ok(panel.includes("className=\"folder-move-confirm\""), 'FolderPanel must render a move confirmation surface');
    assert.ok(panel.includes('source.movePath'), 'FolderPanel must call the source move path API');
    assert.ok(panel.includes('source.revealPath'), 'FolderPanel must call the source reveal path API');
    assert.ok(panel.includes('props.onPreviewFile?.(entry.path)'), 'file clicks must keep preview behavior');
    assert.ok(panel.includes('toggleExpand(entry.path)'), 'directory clicks must keep expand behavior');
    assert.ok(panel.includes('<FolderTreeRows'), 'FolderPanel must delegate row rendering to the extracted component');
});

test('FolderPanel separates preview selection from local action selection', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const rows = read('public/manager/src/folder-panel/FolderTreeRows.tsx');

    assert.ok(rows.includes('props.selectedPath === entry.path'), 'local action selection must use selectedPath');
    assert.ok(
        rows.includes("aria-selected={entry.kind === 'file' && entry.path === props.selectedFilePath}"),
        'aria-selected must preserve the selected preview file meaning',
    );
    assert.ok(rows.includes("'is-selected'"), 'local selection must use a separate CSS class');
});

test('FolderPanel starts from explicit initial root policy instead of project roots', () => {
    const panel = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const sources = read('public/manager/src/folder-panel/folder-sources.ts');

    assert.ok(panel.includes('source.getInitialRoot()'), 'FolderPanel must use the source initial-root policy');
    assert.equal(panel.includes('source.getDefaultRoot()'), false, 'FolderPanel must not call getDefaultRoot on mount');
    assert.equal(panel.includes('projectDirs'), false, 'FolderPanel must not import or mutate projectDirs');
    assert.ok(panel.includes('props.onRootChange?.(nextRoot)'), 'manual Open Folder picks must sync the parent external root state through the shared opener');
    assert.ok(panel.includes('try {'), 'manual Open Folder must guard async picker failures');
    assert.ok(panel.includes('setError((err as Error).message)'), 'manual Open Folder must surface non-cancel picker failures in the panel');
    assert.ok(panel.includes('rootPath !== null &&'), 'empty root state must keep the action row hidden until a root exists');
    assert.ok(sources.includes("result.error === 'cancelled'"), 'Electron source must normalize picker cancellation into a null result');
    assert.ok(sources.includes('getInitialRoot: async () => null'), 'Electron source must start with an empty root');
    assert.ok(sources.includes("getInitialRoot: async () => ''"), 'notes-vault source must keep its virtual notes root');
});

test('electron folder source treats picker cancellation as a non-error', async () => {
    const bridge = mockFolderBridge(async () => ({ ok: false, error: 'cancelled' }));
    const source = createElectronFolderSource(bridge);

    await assert.doesNotReject(async () => {
        assert.equal(await source.pickRoot?.(), null);
    });
});

test('electron folder source still rejects real picker failures', async () => {
    const bridge = mockFolderBridge(async () => ({ ok: false, error: 'permission denied' }));
    const source = createElectronFolderSource(bridge);

    await assert.rejects(
        async () => source.pickRoot?.(),
        /permission denied/,
    );
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

function mockFolderBridge(pickFolder: FolderBridgeApi['pickFolder']): FolderBridgeApi {
    return {
        getDefaultRoot: async () => ({ ok: true, path: '/tmp' }),
        pickFolder,
        listDir: async () => ({ ok: true, entries: [] }),
        readFile: async () => ({ ok: true, content: '' }),
        movePath: async () => ({ ok: true }),
        revealPath: async () => ({ ok: true }),
        watchDir: async () => undefined,
        unwatchDir: async () => undefined,
        onDirChange: () => () => undefined,
    };
}
