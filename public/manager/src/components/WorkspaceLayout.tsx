import type { CSSProperties, ReactNode } from 'react';

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

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
    const style: WorkspaceLayoutStyle = {
        '--activity-dock-height': `${props.inspectorHeight}px`,
        '--sidebar-width': props.sidebarCollapsed ? '56px' : undefined,
        '--right-panel-width': props.rightPanelOpen
            ? `${props.rightPanelWidth ?? 0}px`
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
