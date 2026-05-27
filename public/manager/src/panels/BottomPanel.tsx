import { useCallback, type ReactNode } from 'react';
import { PanelResizer } from './PanelResizer';
import { BottomPanelTabBar } from './BottomPanelTabBar';
import { usePanelLayout } from './PanelLayoutProvider';
import type { BottomPanelTab } from './types';

type BottomPanelProps = {
    renderTab: (tab: BottomPanelTab) => ReactNode;
};

export function BottomPanel(props: BottomPanelProps) {
    const { state, dispatch } = usePanelLayout();
    const bp = state.bottomPanel;

    const handleHeightDelta = useCallback((delta: number) => {
        dispatch({ type: 'SET_BOTTOM_HEIGHT', height: bp.height - delta });
    }, [dispatch, bp.height]);

    if (!bp.open || bp.tabs.length === 0) return null;

    return (
        <div className="bottom-panel" aria-label="Bottom panel">
            <PanelResizer direction="vertical" onDelta={handleHeightDelta} />
            <BottomPanelTabBar
                tabs={bp.tabs}
                activeTab={bp.activeTab}
                onActivate={tab => dispatch({ type: 'SET_BOTTOM_ACTIVE_TAB', tab })}
                onClose={tab => dispatch({ type: 'CLOSE_BOTTOM_TAB', tab })}
                onCollapse={() => dispatch({ type: 'SET_BOTTOM_OPEN', open: false })}
            />
            <div className="bottom-panel-content">
                {bp.activeTab && props.renderTab(bp.activeTab)}
            </div>
        </div>
    );
}
