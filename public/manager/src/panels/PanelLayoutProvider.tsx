import { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { panelShortcutBus } from './panel-shortcut-bus';
import type { RightPanelMode, BottomPanelTab } from './types';
import {
    RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH,
    RIGHT_SPLIT_MIN_RATIO, RIGHT_SPLIT_MAX_RATIO,
    BOTTOM_PANEL_DEFAULT_HEIGHT, BOTTOM_PANEL_MIN_HEIGHT, BOTTOM_PANEL_MAX_HEIGHT,
} from './types';

export type PanelLayoutState = {
    rightPanel: {
        open: boolean;
        width: number;
        topMode: RightPanelMode | null;
        bottomMode: RightPanelMode | null;
        splitRatio: number;
    };
    bottomPanel: {
        open: boolean;
        height: number;
        tabs: BottomPanelTab[];
        activeTab: BottomPanelTab | null;
    };
};

type Action =
    | { type: 'SET_RIGHT_OPEN'; open: boolean }
    | { type: 'SET_RIGHT_WIDTH'; width: number }
    | { type: 'SET_RIGHT_TOP_MODE'; mode: RightPanelMode | null }
    | { type: 'SET_RIGHT_BOTTOM_MODE'; mode: RightPanelMode | null }
    | { type: 'SET_RIGHT_SPLIT_RATIO'; ratio: number }
    | { type: 'OPEN_RIGHT_PANEL'; mode: RightPanelMode; slot?: 'top' | 'bottom' | undefined }
    | { type: 'CLOSE_RIGHT_SUB'; slot: 'top' | 'bottom' }
    | { type: 'SET_BOTTOM_OPEN'; open: boolean }
    | { type: 'SET_BOTTOM_HEIGHT'; height: number }
    | { type: 'OPEN_BOTTOM_TAB'; tab: BottomPanelTab }
    | { type: 'CLOSE_BOTTOM_TAB'; tab: BottomPanelTab }
    | { type: 'SET_BOTTOM_ACTIVE_TAB'; tab: BottomPanelTab }
    | { type: 'HYDRATE'; state: Partial<PanelLayoutState> };

function clampWidth(w: number): number {
    return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(w)));
}

function clampHeight(h: number): number {
    return Math.min(BOTTOM_PANEL_MAX_HEIGHT, Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.round(h)));
}

function clampRatio(r: number): number {
    return Math.min(RIGHT_SPLIT_MAX_RATIO, Math.max(RIGHT_SPLIT_MIN_RATIO, r));
}

function reducer(state: PanelLayoutState, action: Action): PanelLayoutState {
    switch (action.type) {
        case 'SET_RIGHT_OPEN':
            return { ...state, rightPanel: { ...state.rightPanel, open: action.open } };
        case 'SET_RIGHT_WIDTH':
            return { ...state, rightPanel: { ...state.rightPanel, width: clampWidth(action.width) } };
        case 'SET_RIGHT_TOP_MODE':
            return { ...state, rightPanel: { ...state.rightPanel, topMode: action.mode } };
        case 'SET_RIGHT_BOTTOM_MODE':
            return { ...state, rightPanel: { ...state.rightPanel, bottomMode: action.mode } };
        case 'SET_RIGHT_SPLIT_RATIO':
            return { ...state, rightPanel: { ...state.rightPanel, splitRatio: clampRatio(action.ratio) } };
        case 'OPEN_RIGHT_PANEL': {
            const rp = state.rightPanel;
            const slot = action.slot ?? (rp.topMode === null ? 'top' : 'bottom');
            return {
                ...state,
                rightPanel: {
                    ...rp,
                    open: true,
                    [slot === 'top' ? 'topMode' : 'bottomMode']: action.mode,
                },
            };
        }
        case 'CLOSE_RIGHT_SUB': {
            const rp = state.rightPanel;
            const next = {
                ...rp,
                [action.slot === 'top' ? 'topMode' : 'bottomMode']: null,
            };
            if (next.topMode === null && next.bottomMode === null) next.open = false;
            return { ...state, rightPanel: next };
        }
        case 'SET_BOTTOM_OPEN':
            return { ...state, bottomPanel: { ...state.bottomPanel, open: action.open } };
        case 'SET_BOTTOM_HEIGHT':
            return { ...state, bottomPanel: { ...state.bottomPanel, height: clampHeight(action.height) } };
        case 'OPEN_BOTTOM_TAB': {
            const bp = state.bottomPanel;
            const tabs = bp.tabs.includes(action.tab) ? bp.tabs : [...bp.tabs, action.tab];
            return { ...state, bottomPanel: { ...bp, open: true, tabs, activeTab: action.tab } };
        }
        case 'CLOSE_BOTTOM_TAB': {
            const bp = state.bottomPanel;
            const tabs = bp.tabs.filter(t => t !== action.tab);
            const activeTab = bp.activeTab === action.tab ? (tabs[0] ?? null) : bp.activeTab;
            const open = tabs.length > 0;
            return { ...state, bottomPanel: { ...bp, tabs, activeTab, open } };
        }
        case 'SET_BOTTOM_ACTIVE_TAB':
            return { ...state, bottomPanel: { ...state.bottomPanel, activeTab: action.tab } };
        case 'HYDRATE': {
            const h = action.state;
            return {
                rightPanel: { ...state.rightPanel, ...h.rightPanel },
                bottomPanel: { ...state.bottomPanel, ...h.bottomPanel },
            };
        }
        default:
            return state;
    }
}

const initialState: PanelLayoutState = {
    rightPanel: {
        open: false,
        width: RIGHT_PANEL_DEFAULT_WIDTH,
        topMode: null,
        bottomMode: null,
        splitRatio: 0.5,
    },
    bottomPanel: {
        open: false,
        height: BOTTOM_PANEL_DEFAULT_HEIGHT,
        tabs: [],
        activeTab: null,
    },
};

type PanelLayoutContextValue = {
    state: PanelLayoutState;
    dispatch: React.Dispatch<Action>;
    effectiveRightOpen: boolean;
    rightPanelSplit: boolean;
};

const PanelLayoutContext = createContext<PanelLayoutContextValue | null>(null);

export function PanelLayoutProvider(props: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const effectiveRightOpen = state.rightPanel.open
        && (state.rightPanel.topMode !== null || state.rightPanel.bottomMode !== null);
    const rightPanelSplit = state.rightPanel.topMode !== null && state.rightPanel.bottomMode !== null;

    useEffect(() => {
        return panelShortcutBus.register((action) => {
            switch (action) {
                case 'toggleBottomPanel':
                    dispatch({ type: 'SET_BOTTOM_OPEN', open: !state.bottomPanel.open });
                    return true;
                case 'toggleRightPanel':
                    dispatch({ type: 'SET_RIGHT_OPEN', open: !state.rightPanel.open });
                    return true;
                case 'focusTerminal':
                    dispatch({ type: 'OPEN_BOTTOM_TAB', tab: 'terminal' });
                    return true;
                case 'openDiff':
                    dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'diff' });
                    return true;
                case 'openFolderTree':
                    dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'folder' });
                    return true;
                default:
                    return false;
            }
        });
    }, [state.bottomPanel.open, state.rightPanel.open]);

    const value = useMemo(() => ({
        state, dispatch, effectiveRightOpen, rightPanelSplit,
    }), [state, effectiveRightOpen, rightPanelSplit]);

    return (
        <PanelLayoutContext.Provider value={value}>
            {props.children}
        </PanelLayoutContext.Provider>
    );
}

export function usePanelLayout(): PanelLayoutContextValue {
    const ctx = useContext(PanelLayoutContext);
    if (!ctx) throw new Error('usePanelLayout must be used within PanelLayoutProvider');
    return ctx;
}

export function usePanelActions() {
    const { dispatch } = usePanelLayout();

    return useMemo(() => ({
        openRightPanel: (mode: RightPanelMode, slot?: 'top' | 'bottom') =>
            dispatch({ type: 'OPEN_RIGHT_PANEL', mode, slot }),
        closeRightSub: (slot: 'top' | 'bottom') =>
            dispatch({ type: 'CLOSE_RIGHT_SUB', slot }),
        setRightWidth: (width: number) =>
            dispatch({ type: 'SET_RIGHT_WIDTH', width }),
        setRightSplitRatio: (ratio: number) =>
            dispatch({ type: 'SET_RIGHT_SPLIT_RATIO', ratio }),
        toggleRightPanel: () =>
            dispatch({ type: 'SET_RIGHT_OPEN', open: false }),
        openBottomTab: (tab: BottomPanelTab) =>
            dispatch({ type: 'OPEN_BOTTOM_TAB', tab }),
        closeBottomTab: (tab: BottomPanelTab) =>
            dispatch({ type: 'CLOSE_BOTTOM_TAB', tab }),
        setBottomActiveTab: (tab: BottomPanelTab) =>
            dispatch({ type: 'SET_BOTTOM_ACTIVE_TAB', tab }),
        setBottomHeight: (height: number) =>
            dispatch({ type: 'SET_BOTTOM_HEIGHT', height }),
        toggleBottomPanel: () =>
            dispatch({ type: 'SET_BOTTOM_OPEN', open: false }),
        hydrate: (s: Partial<PanelLayoutState>) =>
            dispatch({ type: 'HYDRATE', state: s }),
    }), [dispatch]);
}
