import { useCallback, useEffect } from 'react';
import { getDesktop, isElectron, type DroppedPathEntry } from '../panels/desktop-bridge';

export type ElectronDroppedPathsSource = 'manager' | 'preview';

export type ElectronDroppedPathsEvent = {
    source: ElectronDroppedPathsSource;
    entries: DroppedPathEntry[];
};

type UseElectronDroppedPathsOptions = {
    onDroppedPaths: (event: ElectronDroppedPathsEvent) => void;
};

type ClosestTarget = {
    closest: (selector: string) => Element | null;
};

export function isPreviewDropTarget(target: EventTarget | null): boolean {
    const maybeElement = target as Partial<ClosestTarget> | null;
    if (typeof maybeElement?.closest !== 'function') return false;
    return Boolean(maybeElement.closest('.preview-panel, .preview-frame'));
}

export function shouldConsumeManagerDrop(target: EventTarget | null): boolean {
    return !isPreviewDropTarget(target);
}

export function firstDirectory(entries: DroppedPathEntry[]): DroppedPathEntry | null {
    return entries.find(entry => entry.kind === 'directory') ?? null;
}

export function firstFile(entries: DroppedPathEntry[]): DroppedPathEntry | null {
    return entries.find(entry => entry.kind === 'file') ?? null;
}

function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    if (dataTransfer.files.length > 0) return true;
    return Array.from(dataTransfer.types).includes('Files');
}

export function useElectronDroppedPaths(options: UseElectronDroppedPathsOptions): {
    resolveDroppedFiles: (files: File[], source: ElectronDroppedPathsSource) => Promise<DroppedPathEntry[]>;
} {
    const resolveDroppedFiles = useCallback(async (files: File[], source: ElectronDroppedPathsSource): Promise<DroppedPathEntry[]> => {
        const bridge = getDesktop()?.dragDrop;
        if (!bridge || files.length === 0) return [];
        try {
            const result = await bridge.resolveDroppedItems(files);
            const entries = result.ok && result.entries ? result.entries : [];
            if (entries.length > 0) options.onDroppedPaths({ source, entries });
            return entries;
        } catch (error) {
            console.warn('[electron-drop] failed to resolve dropped files', error);
            return [];
        }
    }, [options]);

    useEffect(() => {
        if (!isElectron() || !getDesktop()?.dragDrop) return undefined;

        function onDragOver(event: DragEvent): void {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer || !hasFileTransfer(dataTransfer)) return;
            if (!shouldConsumeManagerDrop(event.target)) return;
            event.preventDefault();
            dataTransfer.dropEffect = 'copy';
        }

        function onDrop(event: DragEvent): void {
            const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
            if (files.length === 0) return;
            if (!shouldConsumeManagerDrop(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            void resolveDroppedFiles(files, 'manager');
        }

        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('drop', onDrop, true);
        return () => {
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
        };
    }, [resolveDroppedFiles]);

    return { resolveDroppedFiles };
}
