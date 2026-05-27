import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStrictPropertyAccess } from './source-normalize';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

function read(path: string): string {
    return normalizeStrictPropertyAccess(readFileSync(join(projectRoot, path), 'utf8'));
}

test('Electron desktop build refreshes manager frontend assets before packaging', () => {
    const pkg = read('package.json');

    assert.ok(
        pkg.includes('"electron:dist:mac": "npm run build:frontend && npm --prefix electron run build && CSC_IDENTITY_AUTO_DISCOVERY=false npm --prefix electron run dist:mac"'),
        'electron:dist:mac must rebuild the manager frontend before packaging the desktop shell',
    );
});

test('serve command honors persisted dashboard port when no explicit port is passed', () => {
    const serve = read('bin/commands/serve.ts');

    assert.ok(serve.includes('settings, loadSettings'), 'serve command must import settings and loadSettings');
    assert.ok(serve.includes('loadSettings();'), 'serve command must hydrate settings before parseArgs defaults are evaluated');
    assert.ok(
        serve.includes('process.env.PORT || settings.port || \'3457\''),
        'serve command must default to persisted settings.port before falling back to 3457',
    );
});

test('Electron desktop mode hides the browser-only desktop link', () => {
    const desktopLink = read('public/manager/src/desktop-link.tsx');
    const desktopBridge = read('public/manager/src/panels/desktop-bridge.ts');

    assert.ok(desktopLink.includes('const inElectron = isElectron()'), 'DesktopLink must read Electron state without changing hook order');
    assert.ok(desktopLink.includes('if (inElectron) return;'), 'DesktopLink effect must skip desktop-status fetch inside Electron');
    assert.ok(desktopLink.includes('if (inElectron) return null;'), 'DesktopLink must render nothing inside Electron');
    assert.ok(desktopBridge.includes('hasDesktopDocumentMarker()'), 'Electron detection must fall back to the preload document marker');
    assert.ok(
        desktopBridge.includes("document.documentElement.dataset.cliJawDesktop === 'true'"),
        'Electron detection must use the preload marker when the bridge object is unavailable',
    );
    assert.ok(desktopBridge.includes('hasDesktopUserAgent()'), 'Electron detection must fall back to the Electron user-agent token');
    assert.ok(desktopBridge.includes('cli-jaw-desktop'), 'Electron detection must use the desktop user-agent token');
});

test('Electron shell stamps manager requests with a desktop user-agent token', () => {
    const main = read('electron/src/main/index.ts');

    assert.ok(main.includes("const DESKTOP_USER_AGENT_TOKEN = 'cli-jaw-desktop'"), 'Electron main must define a stable desktop user-agent token');
    assert.ok(main.includes('mainWindow.webContents.setUserAgent'), 'Electron main must stamp BrowserWindow user-agent before loading manager UI');
    assert.ok(main.includes('app.getVersion()'), 'desktop user-agent token should include the packaged app version');
});

test('Electron default launch owns its manager server instead of attaching to web UI', () => {
    const main = read('electron/src/main/index.ts');

    assert.ok(main.includes('managerUrlExplicit'), 'Electron flags must track whether the manager URL was explicitly supplied');
    assert.ok(main.includes('function shouldAttachToExistingManager()'), 'Electron main must make attach mode explicit');
    assert.ok(
        main.includes('return FLAGS.attachOnly || (FLAGS.managerUrlExplicit && !FLAGS.spawn);'),
        'Electron should only attach to an existing manager when attach-only or an explicit manager URL is used',
    );
    assert.ok(main.includes('function isTcpPortAvailable'), 'Electron must check port ownership before spawning its own dashboard');
    assert.ok(main.includes('function findAvailableManagerPort'), 'Electron must find a free manager port when the default port is busy');
    assert.ok(
        main.includes('ringBuffer.append(`[manager port] ${MANAGER_URL} is busy; spawning dashboard at ${url}\\n`)'),
        'Electron must log when it avoids a busy web dashboard port',
    );
    assert.ok(!main.includes('const PROBE_PORTS'), 'Electron must not probe and attach to arbitrary web dashboard ports by default');
});

test('Electron window fits within the visible display work area', () => {
    const main = read('electron/src/main/index.ts');

    assert.ok(main.includes("import { app, BrowserWindow, dialog, screen, session, shell } from 'electron'"), 'Electron main must import screen for work-area sizing');
    assert.ok(main.includes('function getInitialWindowBounds()'), 'Electron main must compute initial bounds before creating BrowserWindow');
    assert.ok(main.includes('screen.getPrimaryDisplay()'), 'initial bounds must use the active display work area');
    assert.ok(main.includes('workArea.height - WINDOW_WORK_AREA_MARGIN'), 'initial height must leave a margin inside the visible work area');
    assert.ok(main.includes('...initialWindowBounds'), 'BrowserWindow must use the clamped work-area bounds');
    assert.ok(main.includes('minHeight: MIN_VISIBLE_WINDOW_HEIGHT'), 'BrowserWindow must keep a sane minimum after fitting to the work area');
});

test('Electron titlebar spacing survives React timing and CSS cascade', () => {
    const preload = read('electron/src/preload/index.ts');
    const compact = read('public/manager/src/manager-p0-1-1.css');

    assert.ok(preload.includes("document.documentElement.dataset.cliJawDesktop = 'true'"), 'preload must mark the document as cli-jaw Desktop');
    assert.ok(compact.includes(':root[data-cli-jaw-desktop="true"] .command-center.command-bar'), 'desktop titlebar CSS must work from the preload document marker');
    assert.ok(compact.includes('padding: 6px 10px 6px 92px'), 'desktop titlebar padding must reserve room for macOS traffic lights');
    assert.ok(compact.includes('-webkit-app-region: no-drag'), 'desktop titlebar controls must remain clickable');
});

test('Electron preload bridge avoids unsupported sandbox Node builtins', () => {
    const preload = read('electron/src/preload/index.ts');
    const diffPanel = read('public/manager/src/diff-panel/DiffPanel.tsx');

    assert.ok(!preload.includes('node:os'), 'sandboxed preload must not import node:os because it prevents cliJawDesktop from being exposed');
    assert.ok(preload.includes('contextBridge.exposeInMainWorld'), 'preload must expose cliJawDesktop through contextBridge');
    assert.ok(preload.includes('getHomePath'), 'preload must still provide a home-path bridge helper');
    assert.ok(diffPanel.includes("desktop?.getHomePath?.() || '/tmp'"), 'diff panel must tolerate an empty home path from the sandbox preload');
});

test('manager sidebar rail keeps IDE panel toggles visible', () => {
    const rail = read('public/manager/src/components/SidebarRail.tsx');
    const layout = read('public/manager/src/manager-layout.css');
    const compact = read('public/manager/src/manager-p0-1-1.css');

    assert.ok(rail.includes("import { isElectron } from '../panels/desktop-bridge'"), 'SidebarRail must gate desktop-only controls through Electron detection');
    assert.ok(rail.includes('const showDesktopPanelToggles = isElectron()'), 'SidebarRail must compute whether desktop panel toggles should render');
    assert.ok(rail.includes('showDesktopPanelToggles ? ('), 'web UI must not render desktop-only panel toggles');
    assert.ok(rail.includes('aria-label="Toggle terminal panel"'), 'SidebarRail must expose the bottom terminal panel toggle');
    assert.ok(rail.includes("panelActions.openBottomTab('terminal')"), 'bottom panel toggle must open the terminal tab when closed');
    assert.ok(rail.includes('aria-label="Toggle right panel"'), 'SidebarRail must expose the right panel toggle');
    assert.ok(rail.includes("panelActions.openRightPanel('folder')"), 'right panel toggle must open the folder panel when closed');
    assert.ok(layout.includes('display: flex'), 'manager sidebar must allow rail height to grow without clipping its list');
    assert.ok(layout.includes('.manager-sidebar-list { flex: 1 1 auto;'), 'sidebar list must size from remaining space, not a fixed rail height');
    assert.ok(compact.includes('flex-wrap: wrap'), 'expanded rail must wrap utility buttons instead of clipping them');
    assert.ok(compact.includes('flex: 0 0 100%'), 'expanded rail spacer must force panel toggles onto a second row instead of pushing them past the sidebar edge');
    assert.ok(
        compact.includes('.dashboard-shell.manager-shell:not(.is-sidebar-collapsed) .sidebar-rail {\n    min-height: 54px;'),
        'web manager rail must keep the normal single-line height',
    );
    assert.ok(
        compact.includes(':root[data-cli-jaw-desktop="true"] .dashboard-shell.manager-shell:not(.is-sidebar-collapsed) .sidebar-rail'),
        'only Electron should reserve two-line rail height for desktop panel toggles',
    );
    assert.ok(compact.includes('min-height: 76px'), 'Electron expanded rail must reserve enough height for its wrapped controls');
    assert.ok(compact.includes('overflow: visible'), 'expanded rail must not crop wrapped controls');
    assert.ok(compact.includes('.rail-panel-toggle'), 'panel toggles must have distinct visible styling');
});

test('Electron right sidebar exposes icon panel switcher and document preview path', () => {
    const types = read('public/manager/src/panels/types.ts');
    const sidebar = read('public/manager/src/panels/RightSidebar.tsx');
    const router = read('public/manager/src/SidebarRailRouter.tsx');
    const folder = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const doc = read('public/manager/src/doc-panel/DocPanel.tsx');
    const css = read('public/manager/src/panels/panels.css');

    assert.ok(types.includes("RightPanelMode = 'folder' | 'doc' | 'diff' | 'browser'"), 'right panel modes must include folders, document preview, diff, and browser');
    assert.ok(types.includes("['folder', 'doc', 'diff', 'browser']"), 'right panel mode order must match the toolbar order');
    assert.ok(sidebar.includes('RIGHT_PANEL_TOOLBAR_MODES'), 'RightSidebar must render a mode toolbar');
    assert.ok(sidebar.includes('right-panel-mode-button'), 'right sidebar mode controls must be compact icon buttons');
    assert.ok(sidebar.includes("aria-label={MODE_LABELS[mode]}"), 'icon buttons must keep accessible names');
    assert.ok(sidebar.includes("dispatch({ type: 'SET_RIGHT_BOTTOM_MODE', mode: null })"), 'toolbar buttons must collapse split state into a single visible panel');
    assert.ok(sidebar.includes("dispatch({ type: 'OPEN_RIGHT_PANEL', mode, slot: 'top' })"), 'toolbar buttons must switch the visible top panel');
    assert.ok(sidebar.includes('key={`${slot}-${mode}`}'), 'switching modes must remount the visible panel instead of leaving stale content painted');
    assert.ok(router.includes("case 'browser': return <Suspense fallback={fallback}><BrowserPanel /></Suspense>;"), 'right sidebar must be able to render the browser panel');
    assert.ok(router.includes('rightPreviewFilePath'), 'router must keep the selected file path for document preview');
    assert.ok(router.includes("panelLayout.dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'doc', slot: 'bottom' })"), 'selecting a file must open document preview in a folder/file split view');
    assert.ok(folder.includes('onPreviewFile'), 'folder panel must expose file selection to the preview panel');
    assert.ok(folder.includes("props.onPreviewFile?.(entry.path)"), 'clicking a file in Folders must open it in preview');
    assert.ok(folder.includes('bridge.getDefaultRoot()'), 'folder panel must open a default root instead of starting as an empty dead panel');
    assert.ok(doc.includes('Open Folders and select a file'), 'empty document preview must explain how to view a file');
    assert.ok(css.includes('.right-panel-toolbar'), 'right sidebar icon toolbar must be styled');
    assert.ok(css.includes('.right-panel-mode-button.is-active'), 'active right sidebar icon must have visible state');
});

test('Electron terminal uses xterm plus a PTY backend and representative shortcut', () => {
    const shortcuts = read('public/manager/src/manager-shortcuts.ts');
    const terminal = read('public/manager/src/terminal/TerminalPanel.tsx');
    const terminalMain = read('electron/src/main/lib/terminal/index.ts');
    const electronConfig = read('electron/electron.vite.config.ts');
    const terminalCss = read('public/manager/src/terminal/terminal.css');

    assert.ok(shortcuts.includes("focusTerminal: 'Ctrl+Shift+`'"), 'terminal focus must default to Ctrl+Shift+`');
    assert.ok(shortcuts.includes("focusTerminal: ['Ctrl+Shift+`', 'Meta+`']"), 'terminal shortcut must keep common aliases for existing users');
    assert.ok(shortcuts.includes("event.code === 'Backquote'"), 'shortcut matching must handle shifted backquote key events');
    assert.ok(terminal.includes("import { Terminal } from '@xterm/xterm'"), 'TerminalPanel must use xterm.js for real terminal input/rendering');
    assert.ok(terminal.includes("import { FitAddon } from '@xterm/addon-fit'"), 'TerminalPanel must fit terminal rows/cols to the panel');
    assert.ok(terminal.includes('term.onData(data => { void bridge.write(id, data); })'), 'xterm input must stream directly to the terminal bridge');
    assert.ok(terminal.includes('term.onResize(({ cols, rows }) => { void bridge.resize(id, cols, rows); })'), 'terminal resize must flow to the PTY backend');
    assert.ok(terminal.includes('createAccessibilityInputBridge'), 'terminal must include an accessibility input bridge for Computer Use/native text injection');
    assert.ok(terminal.includes("textarea.value = ''"), 'accessibility input bridge must clear helper textarea after forwarding text to PTY');
    assert.ok(terminal.includes("value.replace(/\\r?\\n/g, '\\r')"), 'accessibility input bridge must translate submitted newlines into terminal carriage returns');
    assert.ok(terminalMain.includes("import { spawn as spawnPty } from 'node-pty'"), 'Electron terminal backend must use node-pty instead of pipe-backed child_process.spawn');
    assert.ok(terminalMain.includes("const pty = spawnPty(shell, ['-l']"), 'terminal sessions must be created as login PTYs');
    assert.ok(terminalMain.includes('session.pty.write(data)'), 'terminal writes must go to the PTY');
    assert.ok(terminalMain.includes('session.pty.resize('), 'terminal resize must resize the PTY');
    assert.ok(electronConfig.includes("'node-pty'"), 'electron-vite must externalize node-pty native bindings');
    assert.ok(terminalCss.includes('.terminal-xterm-host'), 'xterm host must be styled');
});

test('Electron browser panel uses a hardened webview instead of a CSP-blocked iframe', () => {
    const main = read('electron/src/main/index.ts');
    const browser = read('public/manager/src/browser-panel/BrowserPanel.tsx');
    const css = read('public/manager/src/browser-panel/browser-panel.css');

    assert.ok(main.includes('webviewTag: true'), 'BrowserWindow must enable webview only for the desktop browser panel');
    assert.ok(main.includes("mainWindow.webContents.on('will-attach-webview'"), 'Electron main must validate every attached webview');
    assert.ok(main.includes('function isAllowedEmbeddedBrowserUrl'), 'webview navigation must use a dedicated URL policy');
    assert.ok(main.includes('hardenEmbeddedBrowserWebContents'), 'webview contents must deny permissions and popups');
    assert.ok(browser.includes("createElement('webview'"), 'BrowserPanel must render Electron webview, not an iframe');
    assert.ok(browser.includes('Browser preview requires the Electron desktop app'), 'web UI must not present a broken iframe browser');
    assert.ok(css.includes('.browser-go-btn'), 'browser toolbar must expose an explicit go action');
});

test('Electron folder IPC exposes a usable default root for folder/file split view', () => {
    const preload = read('electron/src/preload/index.ts');
    const desktopBridge = read('public/manager/src/panels/desktop-bridge.ts');
    const folderIpc = read('electron/src/main/lib/folder/ipc.ts');

    assert.ok(preload.includes("getDefaultRoot: () => ipcRenderer.invoke('folder:getDefaultRoot')"), 'preload must expose default folder root');
    assert.ok(desktopBridge.includes('getDefaultRoot: () => Promise'), 'frontend bridge type must include default folder root');
    assert.ok(folderIpc.includes("ipcMain.handle('folder:getDefaultRoot'"), 'folder IPC must implement default root lookup');
    assert.ok(folderIpc.includes('pickedRoots.add(root)'), 'default root must be authorized for subsequent list/read calls');
});

test('workspace polish keeps current center/right/bottom grid areas intact', () => {
    const polish = read('public/manager/src/manager-polish.css');
    const compact = read('public/manager/src/manager-p0-1-1.css');

    assert.ok(
        !polish.includes('"sidebar detail"'),
        'collapsed inspector polish must not use the obsolete detail grid area name',
    );
    assert.ok(
        !polish.includes('"sidebar detail ceo"'),
        'side panel polish must not use the obsolete ceo grid area name',
    );
    assert.ok(
        polish.includes('--activity-dock-height: 0px'),
        'collapsed inspector polish must collapse the dock without replacing the workspace grid template',
    );
    assert.ok(
        polish.includes('--sidebar-width: 320px'),
        'wide-sidebar polish must adjust the sidebar variable instead of replacing grid columns',
    );
    assert.ok(
        compact.includes('--sidebar-width: 44px'),
        'collapsed-sidebar compact polish must adjust the sidebar variable instead of replacing grid columns',
    );
    assert.ok(
        !compact.includes('grid-template-columns: 44px minmax(0, 1fr)'),
        'collapsed-sidebar compact polish must preserve the right panel grid column',
    );
});
