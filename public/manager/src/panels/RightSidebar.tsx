import { useCallback, useRef, type ReactNode } from 'react';
import { PanelResizer } from './PanelResizer';
import { usePanelLayout } from './PanelLayoutProvider';
import type { RightPanelMode } from './types';

type RightSidebarProps = {
    renderPanel: (mode: RightPanelMode) => ReactNode;
};

const MODE_LABELS: Record<RightPanelMode, string> = {
    doc: 'Document',
    folder: 'Folders',
    diff: 'Diff',
};

export function RightSidebar(props: RightSidebarProps) {
    const { state, dispatch, effectiveRightOpen, rightPanelSplit } = usePanelLayout();
    const rp = state.rightPanel;
    const bodyRef = useRef<HTMLDivElement>(null);

    const handleWidthDelta = useCallback((delta: number) => {
        dispatch({ type: 'SET_RIGHT_WIDTH', width: rp.width - delta });
    }, [dispatch, rp.width]);

    const handleWidthEnd = useCallback(() => {
        // save trigger handled by parent persistence layer (L7)
    }, []);

    const handleSplitDelta = useCallback((delta: number) => {
        const el = bodyRef.current;
        if (!el) return;
        const totalHeight = el.clientHeight;
        if (totalHeight === 0) return;
        dispatch({ type: 'SET_RIGHT_SPLIT_RATIO', ratio: rp.splitRatio + delta / totalHeight });
    }, [dispatch, rp.splitRatio]);

    if (!effectiveRightOpen) return null;

    const isSplit = rightPanelSplit;
    const topFr = isSplit ? rp.splitRatio : 1;
    const bottomFr = isSplit ? 1 - rp.splitRatio : 0;

    return (
        <aside className="right-panel" aria-label="Right sidebar">
            <PanelResizer direction="horizontal" onDelta={handleWidthDelta} onEnd={handleWidthEnd} />
            <div
                ref={bodyRef}
                className={`right-panel-body ${isSplit ? 'is-split-panel' : 'is-single-panel'}`}
                style={isSplit ? { gridTemplateRows: `${topFr}fr auto ${bottomFr}fr` } : undefined}
            >
                {rp.topMode && (
                    <div className="right-sub-panel" aria-label={MODE_LABELS[rp.topMode]}>
                        <div className="right-sub-header">
                            <span>{MODE_LABELS[rp.topMode]}</span>
                            <button type="button" className="right-sub-close" aria-label={`Close ${MODE_LABELS[rp.topMode]}`} onClick={() => dispatch({ type: 'CLOSE_RIGHT_SUB', slot: 'top' })}>×</button>
                        </div>
                        <div className="right-sub-content">
                            {props.renderPanel(rp.topMode)}
                        </div>
                    </div>
                )}
                {isSplit && (
                    <PanelResizer direction="vertical" onDelta={handleSplitDelta} className="right-split-resizer" />
                )}
                {rp.bottomMode && (
                    <div className="right-sub-panel" aria-label={MODE_LABELS[rp.bottomMode]}>
                        <div className="right-sub-header">
                            <span>{MODE_LABELS[rp.bottomMode]}</span>
                            <button type="button" className="right-sub-close" aria-label={`Close ${MODE_LABELS[rp.bottomMode]}`} onClick={() => dispatch({ type: 'CLOSE_RIGHT_SUB', slot: 'bottom' })}>×</button>
                        </div>
                        <div className="right-sub-content">
                            {props.renderPanel(rp.bottomMode)}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
