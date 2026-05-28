import { useState, type ReactNode, Suspense } from 'react';
import { ActivityDock } from './components/ActivityDock';
import { InstanceDrawer } from './components/InstanceDrawer';
import { InstanceNavigator } from './components/InstanceNavigator';
import { MobileNav } from './components/MobileNav';
import { SidebarRail } from './components/SidebarRail';
import { Workbench } from './components/Workbench';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { lazy } from 'react';
import { RightSidebar } from './panels/RightSidebar';
import { BottomPanel } from './panels/BottomPanel';
import { usePanelLayout } from './panels/PanelLayoutProvider';
import type { RightPanelMode, BottomPanelTab } from './panels/types';

const TerminalPanel = lazy(() => import('./terminal/TerminalPanel').then(m => ({ default: m.TerminalPanel })));
const DiffPanel = lazy(() => import('./diff-panel/DiffPanel').then(m => ({ default: m.DiffPanel })));
const FolderPanel = lazy(() => import('./folder-panel/FolderPanel').then(m => ({ default: m.FolderPanel })));
const DocPanel = lazy(() => import('./doc-panel/DocPanel').then(m => ({ default: m.DocPanel })));
const BrowserPanel = lazy(() => import('./browser-panel/BrowserPanel').then(m => ({ default: m.BrowserPanel })));
import { InstancePreview } from './InstancePreview';
import { DashboardSettingsSidebar, type DashboardSettingsSection } from './dashboard-settings/DashboardSettingsSidebar';
import { DashboardSettingsWorkspace } from './dashboard-settings/DashboardSettingsWorkspace';
import { NotesSidebar, type NotesSidebarMode } from './notes/NotesSidebar';
import { NotesWorkspace } from './notes/NotesWorkspace';
import { DashboardBoardSidebar } from './dashboard-board/DashboardBoardSidebar';
import { DashboardBoardWorkspace } from './dashboard-board/DashboardBoardWorkspace';
import type { BoardView } from './dashboard-board/board-view';
import { DashboardScheduleSidebar, type ScheduleGroup } from './dashboard-schedule/DashboardScheduleSidebar';
import { DashboardScheduleWorkspace } from './dashboard-schedule/DashboardScheduleWorkspace';
import { DashboardRemindersSidebar, type RemindersView } from './dashboard-reminders/DashboardRemindersSidebar';
import { DashboardRemindersWorkspace } from './dashboard-reminders/DashboardRemindersWorkspace';
import { useRemindersFeed } from './dashboard-reminders/useRemindersFeed';
import type { HelpTopicId } from './help/helpContent';
import { NotesCommandPalette } from './notes/NotesCommandPalette';
import { NotesCommandProvider } from './notes/notes-command-registry';
import type { NotesModelState } from './notes/useNotesModel';
import type {
    DashboardDetailTab,
    DashboardInstance,
    DashboardNotesAuthoringMode,
    DashboardNotesViewMode,
    DashboardScanResult,
    DashboardSidebarMode,
    NoteMetadata,
    DashboardLocale,
    ManagerEvent,
} from './types';

type WorkspaceSurfaceProps = {
    active: boolean;
    children: ReactNode;
};

function WorkspaceSurface(props: WorkspaceSurfaceProps) {
    return <section className={`workspace-surface${props.active ? ' is-active' : ''}`} hidden={!props.active} aria-hidden={!props.active}>{props.children}</section>;
}

type Props = {
    sidebarCollapsed: boolean;
    activityDockCollapsed: boolean;
    activityDockHeight: number;
    drawerOpen: boolean;
    onCloseDrawer: () => void;
    onlineCount: number;
    sidebarMode: DashboardSidebarMode;
    scheduleWorkspaceEnabled: boolean;
    remindersWorkspaceEnabled: boolean;
    onSidebarModeChange: (mode: DashboardSidebarMode) => void;
    onToggleSidebar: () => void;
    helpOpen: boolean;
    onToggleHelp: () => void;
    onOpenHelpTopic: (topic: HelpTopicId) => void;
    settingsSection: DashboardSettingsSection;
    locale: DashboardLocale;
    onSettingsSectionChange: (section: DashboardSettingsSection) => void;
    notesModel: NotesModelState;
    notesSelectedPath: string | null;
    notesSelectedNote: NoteMetadata | null;
    notesDirtyPath: string | null;
    notesTreeWidth: number;
    notesSidebarMode: NotesSidebarMode;
    notesSearchFocusToken: number;
    notesViewMode: DashboardNotesViewMode;
    notesAuthoringMode: DashboardNotesAuthoringMode;
    notesWordWrap: boolean;
    notesVimMode: boolean;
    onNotesSidebarModeChange: (mode: NotesSidebarMode) => void;
    onOpenNotesSearch: () => void;
    onNotesSelectedPathChange: (path: string | null) => void;
    onNotesDirtyPathChange: (path: string | null) => void;
    onNotesViewModeChange: (mode: DashboardNotesViewMode) => void;
    onNotesAuthoringModeChange: (mode: DashboardNotesAuthoringMode) => void;
    onNotesWordWrapChange: (value: boolean) => void;
    onNotesVimModeChange: (value: boolean) => void;
    onNotesTreeWidthChange: (value: number) => void;
    boardView: BoardView;
    onBoardViewChange: (view: BoardView) => void;
    scheduleGroup: ScheduleGroup;
    onScheduleGroupChange: (group: ScheduleGroup) => void;
    instances: DashboardInstance[];
    selectedInstance: DashboardInstance | null;
    data: DashboardScanResult | null;
    titlesByPort: Record<number, string>;
    busyPorts: Set<number>;
    activeDetailTab: DashboardDetailTab;
    onDetailTabChange: (tab: DashboardDetailTab) => void;
    workbenchHeader: ReactNode;
    detailContent: (tab: DashboardDetailTab) => ReactNode;
    previewEnabled: boolean;
    previewRefreshKey: number;
    previewTheme: 'dark' | 'light';
    lifecycleMessage: string | null;
    onDismissLifecycleMessage: () => void;
    instanceListContent: ReactNode;
    jawCeoWorkbenchButton?: ReactNode;
    jawCeoVoiceOverlay?: ReactNode;
    jawCeoConsoleContent?: ReactNode;
    loading: boolean;
    error: string | null;
    registryMessage: string | null;
    managerEvents: ManagerEvent[];
    onToggleActivity: () => void;
    onActivityHeightChange: (height: number) => void;
    onOpenDrawer: () => void;
    onSelectTab: (tab: DashboardDetailTab) => void;
    onToggleActivityFromMobile: () => void;
    drawerProfileFilters: ReactNode;
    dashboardSettingsUi: Parameters<typeof DashboardSettingsWorkspace>[0]['ui'];
    titleSupport: Parameters<typeof DashboardSettingsWorkspace>[0]['titleSupport'];
    onDashboardSettingsPatch: Parameters<typeof DashboardSettingsWorkspace>[0]['onUiPatch'];
};

function renderRightPanelContent(
    mode: RightPanelMode,
    previewFilePath: string | null,
    onPreviewFile: (path: string) => void,
): ReactNode {
    const fallback = <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '12px' }}>Loading...</div>;
    switch (mode) {
        case 'diff': return <Suspense fallback={fallback}><DiffPanel /></Suspense>;
        case 'folder': return <Suspense fallback={fallback}><FolderPanel selectedFilePath={previewFilePath} onPreviewFile={onPreviewFile} /></Suspense>;
        case 'doc': return <Suspense fallback={fallback}><DocPanel filePath={previewFilePath ?? undefined} /></Suspense>;
        case 'browser': return <Suspense fallback={fallback}><BrowserPanel /></Suspense>;
        default: return null;
    }
}

function renderBottomTabContent(tab: BottomPanelTab): ReactNode {
    const fallback = <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '12px' }}>Loading...</div>;
    switch (tab) {
        case 'terminal': return <Suspense fallback={fallback}><TerminalPanel /></Suspense>;
        case 'browser': return <Suspense fallback={fallback}><BrowserPanel /></Suspense>;
        default: return null;
    }
}

export function SidebarRailRouter(props: Props) {
    const panelLayout = usePanelLayout();
    const [rightPreviewFilePath, setRightPreviewFilePath] = useState<string | null>(null);
    const [remindersView, setRemindersView] = useState<RemindersView>('matrix');
    const remindersFeed = useRemindersFeed({ active: props.sidebarMode === 'reminders' });
    const notesSelectedHiddenByFilter = Boolean(
        props.notesModel.tagFilter
        && props.notesSelectedPath
        && props.notesSelectedNote
        && !props.notesSelectedNote.tags?.includes(props.notesModel.tagFilter),
    );
    function handleRightPreviewFile(path: string): void {
        setRightPreviewFilePath(path);
        panelLayout.dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'doc', slot: 'bottom' });
    }

    return (
        <NotesCommandProvider>
        {props.jawCeoVoiceOverlay}
        <WorkspaceLayout
            sidebarCollapsed={props.sidebarCollapsed}
            inspectorCollapsed={props.activityDockCollapsed}
            inspectorHeight={props.activityDockCollapsed ? 48 : props.activityDockHeight}
            drawerOpen={props.drawerOpen}
            onCloseDrawer={props.onCloseDrawer}
            rightPanelOpen={panelLayout.effectiveRightOpen}
            rightPanelWidth={panelLayout.state.rightPanel.width}
            rightPanelContent={panelLayout.effectiveRightOpen ? <RightSidebar renderPanel={mode => renderRightPanelContent(mode, rightPreviewFilePath, handleRightPreviewFile)} /> : undefined}
            bottomPanelOpen={panelLayout.state.bottomPanel.open}
            bottomPanelHeight={panelLayout.state.bottomPanel.height}
            bottomPanelContent={panelLayout.state.bottomPanel.open ? <BottomPanel renderTab={renderBottomTabContent} /> : undefined}
            navigator={(
                <>
                    <SidebarRail
                        onlineCount={props.onlineCount}
                        collapsed={props.sidebarCollapsed}
                        mode={props.sidebarMode}
                        scheduleWorkspaceEnabled={props.scheduleWorkspaceEnabled}
                        remindersWorkspaceEnabled={props.remindersWorkspaceEnabled}
                        onModeChange={props.onSidebarModeChange}
                        onToggleSidebar={props.onToggleSidebar}
                        helpOpen={props.helpOpen}
                        onToggleHelp={props.onToggleHelp}
                    />
                    <div id="manager-sidebar-list" className="manager-sidebar-list">
                        {props.sidebarMode === 'settings' ? (
                            <DashboardSettingsSidebar activeSection={props.settingsSection} locale={props.locale} onSectionChange={props.onSettingsSectionChange} />
                        ) : props.sidebarMode === 'notes' ? (
                            <NotesSidebar tree={props.notesModel.filteredTree} loading={props.notesModel.loading} error={props.notesModel.error} notesRoot={props.notesModel.notesRoot} selectedPath={props.notesSelectedPath} dirtyPath={props.notesDirtyPath} treeWidth={props.notesTreeWidth} mode={props.notesSidebarMode} searchFocusToken={props.notesSearchFocusToken} tagFilter={props.notesModel.tagFilter} selectedHiddenByFilter={notesSelectedHiddenByFilter} onModeChange={props.onNotesSidebarModeChange} onOpenSearch={props.onOpenNotesSearch} onSelectedPathChange={props.onNotesSelectedPathChange} onRefreshTree={props.notesModel.refresh} onClearTagFilter={() => props.notesModel.setTagFilter(null)} />
                        ) : props.sidebarMode === 'board' ? (
                            <DashboardBoardSidebar view={props.boardView} onViewChange={props.onBoardViewChange} instances={props.instances} titlesByPort={props.titlesByPort} busyPorts={props.busyPorts} />
                        ) : props.scheduleWorkspaceEnabled && props.sidebarMode === 'schedule' ? (
                            <DashboardScheduleSidebar activeGroup={props.scheduleGroup} onGroupChange={props.onScheduleGroupChange} />
                        ) : props.remindersWorkspaceEnabled && props.sidebarMode === 'reminders' ? (
                            <DashboardRemindersSidebar view={remindersView} onViewChange={setRemindersView} items={remindersFeed.items} loading={remindersFeed.loading} onRefresh={() => void remindersFeed.refresh()} onUpdate={(id, patch) => void remindersFeed.update(id, patch)} />
                        ) : (
                            <InstanceNavigator active={props.selectedInstance} hiddenCount={props.instances.filter(instance => instance.hidden).length} collapsed={props.sidebarCollapsed}>
                                {props.instanceListContent}
                            </InstanceNavigator>
                        )}
                    </div>
                </>
            )}
            workbench={(
                <div className="workspace-surface-stack">
                    <NotesCommandPalette active={props.sidebarMode === 'notes'} />
                    {props.lifecycleMessage && (
                        <section className="state lifecycle-state" role="status">
                            <span>{props.lifecycleMessage}</span>
                            <button type="button" className="state-dismiss" aria-label="Dismiss lifecycle message" onClick={props.onDismissLifecycleMessage}>X</button>
                        </section>
                    )}
                    <div className="workspace-surface-layer">
                        <WorkspaceSurface active={props.sidebarMode === 'instances'}>
                            <Workbench mode={props.activeDetailTab} onModeChange={props.onDetailTabChange} header={props.workbenchHeader} modeActions={props.jawCeoWorkbenchButton} overview={props.detailContent('overview')} preview={(
                                <InstancePreview instance={props.selectedInstance} data={props.data} enabled={props.previewEnabled} active={props.sidebarMode === 'instances' && props.activeDetailTab === 'preview'} refreshKey={props.previewRefreshKey} theme={props.previewTheme} />
                            )} logs={props.detailContent('logs')} settings={props.detailContent('settings')} />
                        </WorkspaceSurface>
                        <WorkspaceSurface active={props.sidebarMode === 'notes'}>
                            <NotesWorkspace active={props.sidebarMode === 'notes'} selectedPath={props.notesSelectedPath} selectedNote={props.notesSelectedNote} vaultIndex={props.notesModel.index} viewMode={props.notesViewMode} authoringMode={props.notesAuthoringMode} wordWrap={props.notesWordWrap} vimMode={props.notesVimMode} treeWidth={props.notesTreeWidth} tagFilter={props.notesModel.tagFilter} onOpenSidebarSearch={props.onOpenNotesSearch} onSelectedPathChange={props.onNotesSelectedPathChange} onDirtyPathChange={props.onNotesDirtyPathChange} onViewModeChange={props.onNotesViewModeChange} onAuthoringModeChange={props.onNotesAuthoringModeChange} onWordWrapChange={props.onNotesWordWrapChange} onVimModeChange={props.onNotesVimModeChange} onTreeWidthChange={props.onNotesTreeWidthChange} onTagSelect={props.notesModel.setTagFilter} onWikiLinkNavigate={props.onNotesSelectedPathChange} />
                        </WorkspaceSurface>
                        <WorkspaceSurface active={props.sidebarMode === 'settings'}>
                            <DashboardSettingsWorkspace activeSection={props.settingsSection} ui={props.dashboardSettingsUi} titleSupport={props.titleSupport} onUiPatch={props.onDashboardSettingsPatch} onOpenHelpTopic={props.onOpenHelpTopic} />
                        </WorkspaceSurface>
                        <WorkspaceSurface active={props.sidebarMode === 'board'}>
                            <DashboardBoardWorkspace active={props.sidebarMode === 'board'} view={props.boardView} onViewChange={props.onBoardViewChange} instances={props.instances} selectedPort={props.selectedInstance?.port ?? null} titlesByPort={props.titlesByPort} busyPorts={props.busyPorts} onOpenHelpTopic={props.onOpenHelpTopic} />
                        </WorkspaceSurface>
                        {props.scheduleWorkspaceEnabled ? (
                            <WorkspaceSurface active={props.sidebarMode === 'schedule'}>
                                <DashboardScheduleWorkspace active={props.sidebarMode === 'schedule'} activeGroup={props.scheduleGroup} busyPorts={props.busyPorts} onOpenHelpTopic={props.onOpenHelpTopic} />
                            </WorkspaceSurface>
                        ) : null}
                        {props.remindersWorkspaceEnabled ? (
                            <WorkspaceSurface active={props.sidebarMode === 'reminders'}>
                                <DashboardRemindersWorkspace active={props.sidebarMode === 'reminders'} view={remindersView} feed={remindersFeed} onRefresh={() => void remindersFeed.refresh()} onCreate={(input) => void remindersFeed.create(input)} onUpdate={(id, patch) => void remindersFeed.update(id, patch)} onOpenHelpTopic={props.onOpenHelpTopic} />
                            </WorkspaceSurface>
                        ) : null}
                    </div>
                </div>
            )}
            inspector={(
                <ActivityDock
                    collapsed={props.activityDockCollapsed}
                    height={props.activityDockHeight}
                    loading={props.loading}
                    error={props.error}
                    lifecycleMessage={props.lifecycleMessage}
                    selectedInstance={props.selectedInstance}
                    registryMessage={props.registryMessage}
                    events={props.managerEvents}
                    onToggle={props.onToggleActivity}
                    onHeightChange={props.onActivityHeightChange}
                />
            )}
            sidePanel={props.jawCeoConsoleContent}
            mobileNav={<MobileNav activeTab={props.activeDetailTab} onOpenInstances={props.onOpenDrawer} onSelectTab={props.onSelectTab} onToggleActivity={props.onToggleActivityFromMobile} />}
            drawer={(
                <InstanceDrawer open={props.drawerOpen} profileFilters={props.drawerProfileFilters} onClose={props.onCloseDrawer}>
                    {props.instanceListContent}
                </InstanceDrawer>
            )}
        />
        </NotesCommandProvider>
    );
}
