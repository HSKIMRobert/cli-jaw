import type { DashboardRegistryUi } from '../types';
import type { PanelLayoutState } from './PanelLayoutProvider';
import type { BottomPanelTab, RightPanelMode } from './types';
import { BOTTOM_PANEL_DEFAULT_HEIGHT, RIGHT_PANEL_DEFAULT_WIDTH } from './types';

export function panelLayoutInitialStateFromUi(ui: DashboardRegistryUi): Partial<PanelLayoutState> {
    if (!ui.panelLayoutVersion) return {};
    return {
        rightPanel: {
            open: ui.rightPanelOpen ?? false,
            width: ui.rightPanelWidth ?? RIGHT_PANEL_DEFAULT_WIDTH,
            topMode: (ui.rightPanelTopMode as RightPanelMode | null) ?? null,
            bottomMode: (ui.rightPanelBottomMode as RightPanelMode | null) ?? null,
            splitRatio: ui.rightPanelSplitRatio ?? 0.5,
        },
        bottomPanel: {
            open: ui.bottomPanelOpen ?? false,
            height: ui.bottomPanelHeight ?? BOTTOM_PANEL_DEFAULT_HEIGHT,
            tabs: (ui.bottomPanelTabs ?? []) as BottomPanelTab[],
            activeTab: (ui.bottomPanelActiveTab ?? null) as BottomPanelTab | null,
        },
    };
}

export function panelLayoutUiFromState(state: PanelLayoutState): Partial<DashboardRegistryUi> {
    return {
        panelLayoutVersion: 1,
        rightPanelOpen: state.rightPanel.open,
        rightPanelWidth: state.rightPanel.width,
        rightPanelTopMode: state.rightPanel.topMode,
        rightPanelBottomMode: state.rightPanel.bottomMode,
        rightPanelSplitRatio: state.rightPanel.splitRatio,
        bottomPanelOpen: state.bottomPanel.open,
        bottomPanelHeight: state.bottomPanel.height,
        bottomPanelTabs: state.bottomPanel.tabs,
        bottomPanelActiveTab: state.bottomPanel.activeTab,
    };
}
