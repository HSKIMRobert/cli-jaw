import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type PanelResizerProps = {
    direction: 'horizontal' | 'vertical';
    onDelta: (delta: number) => void;
    onEnd?: (() => void) | undefined;
    className?: string | undefined;
};

export function PanelResizer(props: PanelResizerProps) {
    const dragging = useRef(false);
    const lastPos = useRef(0);
    const { direction, onDelta, onEnd } = props;

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!dragging.current) return;
        const pos = direction === 'horizontal' ? e.clientX : e.clientY;
        const delta = pos - lastPos.current;
        lastPos.current = pos;
        if (delta !== 0) onDelta(delta);
    }, [direction, onDelta]);

    const handlePointerUp = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        document.body.classList.remove('is-resizing-horizontal', 'is-resizing-vertical');
        onEnd?.();
    }, [onEnd]);

    useEffect(() => {
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerUp);
        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerUp);
            document.body.classList.remove('is-resizing-horizontal', 'is-resizing-vertical');
        };
    }, [handlePointerMove, handlePointerUp]);

    function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = true;
        lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
        document.body.classList.add(direction === 'horizontal' ? 'is-resizing-horizontal' : 'is-resizing-vertical');
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        const step = 10;
        if (direction === 'horizontal') {
            if (e.key === 'ArrowLeft') { e.preventDefault(); onDelta(-step); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); onDelta(step); }
        } else {
            if (e.key === 'ArrowUp') { e.preventDefault(); onDelta(-step); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); onDelta(step); }
        }
    }

    return (
        <div
            role="separator"
            tabIndex={0}
            className={`panel-resizer panel-resizer-${direction} ${props.className ?? ''}`}
            aria-label={`Resize ${direction === 'horizontal' ? 'width' : 'height'}`}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
        />
    );
}
