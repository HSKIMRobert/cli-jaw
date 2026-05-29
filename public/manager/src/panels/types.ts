export type RightPanelMode = 'folder' | 'doc' | 'diff' | 'browser';
export type BottomPanelTab = 'terminal' | 'browser' | 'logs' | 'activity';

export const RIGHT_PANEL_MODES: RightPanelMode[] = ['folder', 'doc', 'diff', 'browser'];
export const BOTTOM_PANEL_TABS: BottomPanelTab[] = ['terminal', 'browser', 'logs', 'activity'];

export const RIGHT_PANEL_MIN_WIDTH = 260;
export const RIGHT_PANEL_MAX_WIDTH = 9999;
export const RIGHT_PANEL_DEFAULT_WIDTH = 480;

export const BOTTOM_PANEL_MIN_HEIGHT = 180;
export const BOTTOM_PANEL_MAX_HEIGHT = 520;
export const BOTTOM_PANEL_DEFAULT_HEIGHT = 320;

export const RIGHT_SPLIT_MIN_RATIO = 0.3;
export const RIGHT_SPLIT_MAX_RATIO = 0.7;
