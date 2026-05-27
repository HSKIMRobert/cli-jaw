import type { DashboardShortcutAction } from '../types';

type PanelShortcutHandler = (action: DashboardShortcutAction) => boolean;

let handler: PanelShortcutHandler | null = null;

export const panelShortcutBus = {
    register(fn: PanelShortcutHandler): () => void {
        handler = fn;
        return () => { if (handler === fn) handler = null; };
    },
    dispatch(action: DashboardShortcutAction): boolean {
        return handler?.(action) ?? false;
    },
};
