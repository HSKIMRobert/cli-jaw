import type { FolderBridgeApi } from '../panels/desktop-bridge';
import { fetchNoteFile } from '../notes/notes-api';
import type { NotesTreeEntry } from '../notes/notes-types';
import type { FolderPanelEntry, FolderPanelSource } from './folder-panel-types';
export type {
    FolderPanelEntry,
    FolderPanelMoveResult,
    FolderPanelRootState,
    FolderPanelRowDecoration,
    FolderPanelSource,
    FolderPanelSourceKind,
} from './folder-panel-types';

function notesEntryToFolderEntry(entry: NotesTreeEntry): FolderPanelEntry {
    return {
        name: entry.name,
        path: entry.path,
        kind: entry.kind === 'folder' ? 'directory' : 'file',
        size: entry.size,
    };
}

function findNotesEntry(entries: NotesTreeEntry[], path: string): NotesTreeEntry | null {
    for (const entry of entries) {
        if (entry.path === path) return entry;
        const child = findNotesEntry(entry.children ?? [], path);
        if (child) return child;
    }
    return null;
}

export function createElectronFolderSource(bridge: FolderBridgeApi): FolderPanelSource {
    return {
        kind: 'electron-folder',
        label: 'Folder',
        canPickRoot: true,
        getInitialRoot: async () => null,
        pickRoot: async () => {
            const result = await bridge.pickFolder();
            if (!result.ok) throw new Error(result.error ?? 'Failed to pick folder');
            return result.path ?? null;
        },
        listDir: async (path: string) => {
            const result = await bridge.listDir(path);
            if (!result.ok || !result.entries) throw new Error(result.error ?? 'Failed to list directory');
            return result.entries;
        },
        readFile: async (path: string) => {
            const result = await bridge.readFile(path);
            if (!result.ok || result.content === undefined) throw new Error(result.error ?? 'Failed to read file');
            return { content: result.content, ...(result.binary !== undefined ? { binary: result.binary } : {}) };
        },
        movePath: async (sourcePath: string, targetDirectory: string) => {
            const result = await bridge.movePath(sourcePath, targetDirectory);
            if (!result.ok) throw new Error(result.error ?? 'Failed to move path');
            return result;
        },
        revealPath: async (path: string) => {
            const result = await bridge.revealPath(path);
            if (!result.ok) throw new Error(result.error ?? 'Failed to reveal path');
        },
        watchDir: path => bridge.watchDir(path),
        unwatchDir: path => bridge.unwatchDir(path),
        onDirChange: cb => bridge.onDirChange(cb),
    };
}

export function createNotesVaultFolderSource(entries: NotesTreeEntry[], root: string | null): FolderPanelSource {
    return {
        kind: 'notes-vault',
        label: root ? `Notes: ${root.split('/').pop() || root}` : 'Notes vault',
        canPickRoot: false,
        getInitialRoot: async () => '',
        listDir: async (path: string) => {
            if (!path) return entries.map(notesEntryToFolderEntry);
            const entry = findNotesEntry(entries, path);
            if (!entry || entry.kind !== 'folder') return [];
            return (entry.children ?? []).map(notesEntryToFolderEntry);
        },
        readFile: async (path: string) => {
            const file = await fetchNoteFile(path);
            return { content: file.content, binary: false };
        },
    };
}
