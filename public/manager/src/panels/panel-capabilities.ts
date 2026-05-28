import { isElectron } from './desktop-bridge';

export type ManagerSurface = 'web' | 'electron';
export type PanelFeature = 'terminal' | 'browser' | 'folder' | 'doc' | 'diff';
export type PanelCapabilityState = 'enabled' | 'disabled' | 'limited';

export type PanelCapability = {
    feature: PanelFeature;
    state: PanelCapabilityState;
    reason?: string;
};

export type PanelCapabilities = Record<PanelFeature, PanelCapability>;

function capability(feature: PanelFeature, state: PanelCapabilityState, reason?: string): PanelCapability {
    return { feature, state, ...(reason ? { reason } : {}) };
}

export function currentManagerSurface(): ManagerSurface {
    return isElectron() ? 'electron' : 'web';
}

export function resolvePanelCapabilities(surface: ManagerSurface): PanelCapabilities {
    if (surface === 'electron') {
        return {
            terminal: capability('terminal', 'enabled'),
            browser: capability('browser', 'enabled'),
            folder: capability('folder', 'enabled'),
            doc: capability('doc', 'enabled'),
            diff: capability('diff', 'enabled'),
        };
    }
    return {
        terminal: capability('terminal', 'disabled', 'Terminal requires the desktop PTY bridge.'),
        browser: capability('browser', 'limited', 'Web dashboard opens external URLs outside the app shell.'),
        folder: capability('folder', 'limited', 'Web dashboard can browse the Jawsidian notes vault only.'),
        doc: capability('doc', 'limited', 'Web dashboard can preview notes-vault files only.'),
        diff: capability('diff', 'limited', 'Web dashboard can use the manager git API for selected instance roots.'),
    };
}

export function panelCapabilityEnabled(capability: PanelCapability): boolean {
    return capability.state === 'enabled' || capability.state === 'limited';
}
