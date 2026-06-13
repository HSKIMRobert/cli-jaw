import type { FolderPanelEntry } from './folder-sources';

export const FOLDER_PANEL_DRAG_MIME = 'application/x-cli-jaw-folder-entry';

export type FolderPanelDragPayload = {
    path: string;
    name: string;
    kind: 'file' | 'directory';
};

export function encodeFolderPanelDragPayload(entry: FolderPanelEntry): string {
    return JSON.stringify({ path: entry.path, name: entry.name, kind: entry.kind });
}

export function decodeFolderPanelDragPayload(value: string): FolderPanelDragPayload | null {
    try {
        const parsed = JSON.parse(value) as Partial<FolderPanelDragPayload>;
        if (typeof parsed.path !== 'string' || parsed.path.length === 0) return null;
        if (typeof parsed.name !== 'string' || parsed.name.length === 0) return null;
        if (parsed.kind !== 'file' && parsed.kind !== 'directory') return null;
        return { path: parsed.path, name: parsed.name, kind: parsed.kind };
    } catch {
        return null;
    }
}

export function hasFolderPanelDragPayload(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    return Array.from(dataTransfer.types).includes(FOLDER_PANEL_DRAG_MIME);
}

export function readFolderPanelDragPayload(dataTransfer: DataTransfer | null): FolderPanelDragPayload | null {
    if (!hasFolderPanelDragPayload(dataTransfer)) return null;
    return decodeFolderPanelDragPayload(dataTransfer!.getData(FOLDER_PANEL_DRAG_MIME));
}

export function shellEscapePath(path: string): string {
    return `'${path.replace(/'/g, `'\\''`)}'`;
}
