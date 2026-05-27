import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type WorkspaceLayoutProps = {
    navigator: ReactNode;
    workbench: ReactNode;
    inspector: ReactNode;
    sidePanel?: ReactNode;
    mobileNav: ReactNode;
    drawer: ReactNode;
    drawerOpen: boolean;
    sidebarCollapsed: boolean;
    inspectorCollapsed: boolean;
    inspectorHeight: number;
    onCloseDrawer: () => void;
    rightPanelContent?: ReactNode;
    rightPanelWidth?: number;
    rightPanelOpen?: boolean;
    bottomPanelContent?: ReactNode;
    bottomPanelHeight?: number;
    bottomPanelOpen?: boolean;
};

type WorkspaceLayoutStyle = CSSProperties & {
    '--activity-dock-height': string;
    '--sidebar-width'?: string | undefined;
    '--right-panel-width'?: string | undefined;
    '--bottom-panel-height'?: string | undefined;
};

const RIGHT_PANEL_RENDER_MIN_WIDTH = 260;
const RIGHT_PANEL_RENDER_MAX_WIDTH = 520;
const WORKSPACE_CENTER_MIN_WIDTH = 360;

function readViewportWidth(): number {
    if (typeof window === 'undefined') return 1440;
    return window.innerWidth;
}

function useViewportWidth(): number {
    const [viewportWidth, setViewportWidth] = useState(readViewportWidth);

    useEffect(() => {
        const handleResize = () => setViewportWidth(readViewportWidth());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return viewportWidth;
}

function clampRightPanelRenderWidth(width: number | undefined, sidebarCollapsed: boolean, viewportWidth: number): number {
    const desired = typeof width === 'number' && Number.isFinite(width)
        ? Math.round(width)
        : RIGHT_PANEL_RENDER_MAX_WIDTH;
    const sidebarWidth = sidebarCollapsed
        ? 56
        : viewportWidth >= 1440 ? 360 : 300;
    const maxByViewport = Math.max(
        RIGHT_PANEL_RENDER_MIN_WIDTH,
        viewportWidth - sidebarWidth - WORKSPACE_CENTER_MIN_WIDTH,
    );
    const responsiveMax = Math.min(
        RIGHT_PANEL_RENDER_MAX_WIDTH,
        Math.floor(viewportWidth * 0.48),
        maxByViewport,
    );
    return Math.max(
        RIGHT_PANEL_RENDER_MIN_WIDTH,
        Math.min(desired, responsiveMax),
    );
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
    const viewportWidth = useViewportWidth();
    const rightPanelWidth = props.rightPanelOpen
        ? clampRightPanelRenderWidth(props.rightPanelWidth, props.sidebarCollapsed, viewportWidth)
        : 0;

    const style: WorkspaceLayoutStyle = {
        '--activity-dock-height': `${props.inspectorHeight}px`,
        '--sidebar-width': props.sidebarCollapsed ? '56px' : undefined,
        '--right-panel-width': props.rightPanelOpen
            ? `${rightPanelWidth}px`
            : props.sidePanel ? undefined : '0px',
        '--bottom-panel-height': props.bottomPanelOpen
            ? `${props.bottomPanelHeight ?? 0}px`
            : undefined,
    };

    const cls = [
        'manager-workspace',
        props.sidebarCollapsed && 'is-sidebar-collapsed',
        props.inspectorCollapsed && 'is-inspector-collapsed',
        !props.rightPanelOpen && !props.sidePanel && 'is-right-panel-closed',
        !props.bottomPanelOpen && 'is-bottom-panel-closed',
        props.sidePanel && 'is-side-panel-open',
        props.drawerOpen && 'is-drawer-open',
    ].filter(Boolean).join(' ');

    return (
        <div className={cls} style={style}>
            {props.drawerOpen && <div className="drawer-backdrop" onClick={props.onCloseDrawer} />}
            <aside className="manager-sidebar" aria-label="Jaw instances">{props.navigator}</aside>
            <section className="manager-detail" aria-label="Manager workbench">{props.workbench}</section>
            <section className="manager-activity" aria-label="Manager inspector">{props.inspector}</section>
            {props.sidePanel && <aside className="manager-ceo-panel" aria-label="Jaw CEO console">{props.sidePanel}</aside>}
            {props.rightPanelContent}
            {props.bottomPanelContent}
            <nav className="manager-mobile-nav" aria-label="Mobile dashboard navigation">
                {props.mobileNav}
            </nav>
            {props.drawer}
        </div>
    );
}
