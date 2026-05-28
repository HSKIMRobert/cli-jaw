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

    assert.ok(main.includes("import { app, BrowserWindow, dialog, Menu, screen, session, shell } from 'electron'"), 'Electron main must import screen for work-area sizing');
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
    assert.ok(
        compact.includes('.dashboard-shell.manager-shell:not(.is-sidebar-collapsed) .sidebar-rail {\n    min-height: 54px;'),
        'web manager rail must keep the normal single-line height',
    );
    assert.ok(
        compact.includes(':root[data-cli-jaw-desktop="true"] .dashboard-shell.manager-shell:not(.is-sidebar-collapsed) .sidebar-rail'),
        'Electron should get a desktop-only rail override for panel toggles',
    );
    assert.ok(compact.includes('flex-wrap: nowrap'), 'Electron expanded rail must keep desktop panel toggles on one row');
    assert.ok(compact.includes('flex: 1 1 auto'), 'Electron expanded rail spacer must shrink so utility toggles stay in the same row');
    assert.ok(compact.includes('min-width: 4px'), 'Electron expanded rail spacer must keep a small visual gap without forcing a second row');
    assert.ok(compact.includes('.rail-panel-toggle'), 'panel toggles must have distinct visible styling');
});

test('Electron panel shortcuts open usable panels when closed', () => {
    const provider = read('public/manager/src/panels/PanelLayoutProvider.tsx');

    assert.ok(
        provider.includes("else dispatch({ type: 'OPEN_BOTTOM_TAB', tab: 'terminal' })"),
        'toggleBottomPanel shortcut must open a terminal tab when the bottom panel is closed',
    );
    assert.ok(
        provider.includes("else {\n                        dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'folder', slot: 'top' });"),
        'toggleRightPanel shortcut must open the folder panel when the right panel has no active mode',
    );
    assert.ok(
        provider.includes("dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'folder', slot: 'top' })"),
        'usePanelActions.toggleRightPanel must also open a folder panel from the closed/no-mode state',
    );
});

test('Electron right sidebar exposes icon panel switcher and document preview path', () => {
    const types = read('public/manager/src/panels/types.ts');
    const provider = read('public/manager/src/panels/PanelLayoutProvider.tsx');
    const sidebar = read('public/manager/src/panels/RightSidebar.tsx');
    const router = read('public/manager/src/SidebarRailRouter.tsx');
    const folder = read('public/manager/src/folder-panel/FolderPanel.tsx');
    const doc = read('public/manager/src/doc-panel/DocPanel.tsx');
    const browserPanel = read('public/manager/src/browser-panel/BrowserPanel.tsx');
    const css = read('public/manager/src/panels/panels.css');
    const workspace = read('public/manager/src/components/WorkspaceLayout.tsx');
    const browserCss = read('public/manager/src/browser-panel/browser-panel.css');

    assert.ok(types.includes("RightPanelMode = 'folder' | 'doc' | 'diff' | 'browser'"), 'right panel modes must include folders, document preview, diff, and browser');
    assert.ok(types.includes("['folder', 'doc', 'diff', 'browser']"), 'right panel mode order must match the toolbar order');
    assert.ok(types.includes('RIGHT_SPLIT_MIN_RATIO = 0.3'), 'right panel split must not allow a slot to collapse into an unusable 20% strip');
    assert.ok(types.includes('RIGHT_SPLIT_MAX_RATIO = 0.7'), 'right panel split must reserve usable height for both slots');
    assert.ok(provider.includes("{ type: 'SOLO_RIGHT_SUB'; slot: 'top' | 'bottom' }"), 'layout reducer must expose a first-class solo action for split slots');
    assert.ok(provider.includes("case 'SOLO_RIGHT_SUB'"), 'layout reducer must support promoting a split slot to a single full-height panel');
    assert.ok(provider.includes('next.topMode = next.bottomMode'), 'closing the top split slot must promote the remaining bottom slot into the full-height top slot');
    assert.ok(sidebar.includes('RIGHT_PANEL_TOOLBAR_MODES'), 'RightSidebar must render a mode toolbar');
    assert.ok(sidebar.includes('RIGHT_SPLIT_SLOT_MIN_HEIGHT'), 'split slots must have a stable minimum height instead of relying only on fractional rows');
    assert.ok(sidebar.includes('right-panel-mode-button'), 'right sidebar mode controls must be compact icon buttons');
    assert.ok(sidebar.includes("aria-label={MODE_LABELS[mode]}"), 'icon buttons must keep accessible names');
    assert.ok(sidebar.includes("dispatch({ type: 'SET_RIGHT_BOTTOM_MODE', mode: null })"), 'toolbar buttons must collapse split state into a single visible panel');
    assert.ok(sidebar.includes("dispatch({ type: 'OPEN_RIGHT_PANEL', mode, slot: 'top' })"), 'toolbar buttons must switch the visible top panel');
    assert.ok(sidebar.includes('right-sub-title'), 'split panels must show visible slot labels instead of screen-reader-only labels');
    assert.ok(sidebar.includes('right-sub-actions'), 'split panels must expose visible slot actions');
    assert.ok(sidebar.includes('<div className="right-sub-header">'), 'single panels must keep a visible header so close controls remain reachable after tree/document only actions');
    assert.ok(sidebar.includes("aria-label={`Show only ${label}`}"), 'split panels must expose explicit tree/document only controls');
    assert.ok(sidebar.includes("dispatch({ type: 'SOLO_RIGHT_SUB', slot })"), 'split-only controls must promote a slot to a single panel');
    assert.ok(sidebar.includes("aria-label={`Close ${label}`}"), 'each right sidebar slot must keep an explicit close control in split and single modes');
    assert.ok(sidebar.includes('key={`${slot}-${mode}`}'), 'switching modes must remount the visible panel instead of leaving stale content painted');
    assert.ok(router.includes("case 'browser': return <Suspense fallback={fallback}><BrowserPanel /></Suspense>;"), 'right sidebar must be able to render the browser panel');
    assert.ok(browserPanel.includes('function isUrlAllowed(target: string, desktop: boolean): boolean'), 'browser panel URL policy must be desktop-aware');
    assert.ok(browserPanel.includes('if (desktop) return true;'), 'Electron browser webview must allow local/private preview URLs after http/https validation');
    assert.ok(browserPanel.includes('isRestrictedBrowserHost(parsed.hostname)'), 'web UI browser policy must continue blocking local/private hosts');
    assert.ok(browserPanel.includes('Local, private, and same-origin URLs are blocked.'), 'web UI must keep the explicit local/private URL rejection message');
    assert.ok(browserPanel.includes('const inputRef = useRef<HTMLInputElement | null>(null);'), 'browser Go action must read the visible URL input value for native accessibility value injection');
    assert.ok(browserPanel.includes('openUrlInTab(activeTab.id, inputRef.current?.value ?? activeTab.inputUrl)'), 'browser Go action must not depend only on React change events');
    assert.ok(browserPanel.includes('function shouldDefaultToHttp'), 'browser panel must treat localhost/private bare targets as http previews instead of defaulting them to https');
    assert.ok(browserPanel.includes('type BrowserTabState'), 'browser panel must track tab-specific URL/loading/error state');
    assert.ok(browserPanel.includes('browser-tab-strip'), 'browser panel must expose a tab strip for multiple browser tabs');
    assert.ok(browserPanel.includes('aria-label="New browser tab"'), 'browser panel must expose an explicit new-tab control');
    assert.ok(browserPanel.includes("webview.addEventListener('render-process-gone'"), 'browser panel must detect crashed/killed webview renderers using Electron current API');
    assert.ok(browserPanel.includes('attachWebviewEvents'), 'browser panel must attach navigation/crash handlers per webview, not only to the currently active tab');
    assert.ok(browserPanel.includes("getDesktop()?.browser?.onOpenUrl"), 'browser panel must accept Electron popup/new-window requests and route them into tabs');
    assert.ok(router.includes('rightPreviewFilePath'), 'router must keep the selected file path for document preview');
    assert.ok(router.includes("panelLayout.dispatch({ type: 'OPEN_RIGHT_PANEL', mode: 'doc', slot: 'bottom' })"), 'selecting a file must open document preview in a folder/file split view');
    assert.ok(folder.includes('onPreviewFile'), 'folder panel must expose file selection to the preview panel');
    assert.ok(folder.includes("props.onPreviewFile?.(entry.path)"), 'clicking a file in Folders must open it in preview');
    assert.ok(folder.includes('bridge.getDefaultRoot()'), 'folder panel must open a default root instead of starting as an empty dead panel');
    assert.ok(doc.includes('Open Folders and select a file'), 'empty document preview must explain how to view a file');
    assert.ok(css.includes('.right-panel-toolbar'), 'right sidebar icon toolbar must be styled');
    assert.ok(css.includes('.right-panel-mode-button.is-active'), 'active right sidebar icon must have visible state');
    assert.ok(css.includes('.right-sub-title'), 'split header labels must be visible and styled');
    assert.ok(css.includes('.right-sub-action'), 'split slot only/close actions must be styled as usable controls');
    assert.ok(css.includes('.right-panel-body.is-single-panel > .right-sub-panel'), 'single right panels must consume the full sidebar height');
    assert.ok(css.includes('flex: 1 1 0;'), 'single right panel content must not collapse to header height');
    assert.ok(css.includes('.right-sub-content {\n    display: flex;'), 'right sidebar content must pass flex height to nested panels');
    assert.ok(css.includes('height: 100%;'), 'right sub content must pass a stable height to nested panels');
    assert.ok(workspace.includes('clampRightPanelRenderWidth'), 'right panel width must be clamped at render time so persisted large widths cannot clip the UI');
    assert.ok(workspace.includes('WORKSPACE_CENTER_MIN_WIDTH'), 'right panel clamp must reserve usable center workspace width');
    assert.ok(css.includes('max-width: min(520px, 48vw)'), 'right panel must have a responsive CSS max-width');
    assert.ok(browserCss.includes('overflow: hidden'), 'browser panel must clip inside its own panel instead of escaping the sidebar');
    assert.ok(browserCss.includes('min-width: 0'), 'browser panel flex children must be allowed to shrink inside the right sidebar');
    assert.ok(browserCss.includes('.browser-webview-host'), 'browser webview must be hosted in a flex child that owns the remaining vertical height');
    assert.ok(browserCss.includes('.browser-tab-strip'), 'browser tab strip must be styled as a stable toolbar row');
    assert.ok(browserCss.includes('.browser-tab-close'), 'browser tabs must expose visible close controls');
    assert.ok(browserCss.includes('.browser-webview-stack'), 'browser webview stack must preserve tab surfaces inside the remaining height');
    assert.ok(browserCss.includes('.browser-webview-host.is-active'), 'only the active browser tab host should be visible');
    assert.ok(browserCss.includes('.browser-webview-host.is-active {\n    display: flex;'), 'active browser webview host must own remaining height with flex layout');
    assert.ok(!browserCss.includes('position: absolute'), 'Electron webview must not be taken out of flex layout because its guest iframe sizing depends on the webview container');
    assert.ok(browserCss.includes('display: flex'), 'Electron webview must keep its default flex display so the internal guest iframe fills the container');
});

test('Electron terminal uses xterm plus a PTY backend and representative shortcut', () => {
    const shortcuts = read('public/manager/src/manager-shortcuts.ts');
    const app = read('public/manager/src/App.tsx');
    const main = read('electron/src/main/index.ts');
    const preload = read('electron/src/preload/index.ts');
    const desktopBridge = read('public/manager/src/panels/desktop-bridge.ts');
    const previewBridge = read('public/js/features/preview-shortcut-bridge.ts');
    const previewMessages = read('public/manager/src/usePreviewShortcutMessages.ts');
    const terminal = read('public/manager/src/terminal/TerminalPanel.tsx');
    const terminalMain = read('electron/src/main/lib/terminal/index.ts');
    const electronConfig = read('electron/electron.vite.config.ts');
    const terminalCss = read('public/manager/src/terminal/terminal.css');
    const bottomTabBar = read('public/manager/src/panels/BottomPanelTabBar.tsx');
    const panelCss = read('public/manager/src/panels/panels.css');

    assert.ok(shortcuts.includes("focusTerminal: 'Ctrl+Shift+`'"), 'terminal focus must default to Ctrl+Shift+`');
    assert.ok(shortcuts.includes("focusTerminal: ['Ctrl+Shift+`', 'Meta+`']"), 'terminal shortcut must keep common aliases for existing users');
    assert.ok(shortcuts.includes("toggleRightPanel: 'Meta+B'"), 'right side panel must use the expected Cmd+B shortcut');
    assert.ok(shortcuts.includes("toggleRightPanel: ['Meta+B', 'Meta+Shift+B']"), 'right side panel must keep the previous Cmd+Shift+B shortcut as an alias');
    assert.ok(shortcuts.includes("event.code === 'Backquote'"), 'shortcut matching must handle shifted backquote key events');
    assert.ok(main.includes("contents.on('before-input-event'"), 'Electron main must catch shortcuts before iframe/webview focus traps them');
    assert.ok(main.includes("import { app, BrowserWindow, dialog, Menu, screen, session, shell } from 'electron'"), 'Electron main must import Menu for native accelerators');
    assert.ok(main.includes('function sendManagerShortcut'), 'Electron main must route all shortcut sources through one sender');
    assert.ok(main.includes("sendManagerShortcut(action)"), 'Electron before-input-event handler must forward desktop shortcuts to the manager renderer');
    assert.ok(main.includes('function installManagerApplicationMenu()'), 'Electron main must install application menu accelerators for shortcuts that macOS consumes before the page');
    assert.ok(main.includes("accelerator: 'CommandOrControl+B'"), 'right sidebar shortcut must be registered as a native app menu accelerator');
    assert.ok(main.includes("accelerator: 'Ctrl+Shift+`'"), 'terminal shortcut must be registered as a native app menu accelerator');
    assert.ok(preload.includes("ipcRenderer.on('manager:shortcut', handler)"), 'preload must expose desktop shortcut events');
    assert.ok(desktopBridge.includes('shortcuts?: ShortcutBridgeApi'), 'frontend desktop bridge type must include shortcut events');
    assert.ok(app.includes("getDesktop()?.shortcuts?.onAction"), 'manager app must subscribe to Electron desktop shortcut events');
    assert.ok(previewBridge.includes("e.code === 'Backquote'"), 'classic preview iframe bridge must forward Ctrl+Shift+Backquote');
    assert.ok(previewMessages.includes('ctrlKey: !!data.ctrlKey'), 'manager preview shortcut bridge must preserve Ctrl modifier');
    assert.ok(previewMessages.includes('metaKey: !!data.metaKey'), 'manager preview shortcut bridge must preserve Meta modifier');
    assert.ok(terminal.includes("import { Terminal } from '@xterm/xterm'"), 'TerminalPanel must use xterm.js for real terminal input/rendering');
    assert.ok(terminal.includes("import { FitAddon } from '@xterm/addon-fit'"), 'TerminalPanel must fit terminal rows/cols to the panel');
    assert.ok(terminal.includes('term.onData(data => { void bridge.write(id, data); })'), 'xterm input must stream directly to the terminal bridge');
    assert.ok(terminal.includes('term.onResize(({ cols, rows }) => { void bridge.resize(id, cols, rows); })'), 'terminal resize must flow to the PTY backend');
    assert.ok(terminal.includes('createAccessibilityInputBridge'), 'terminal must include an accessibility input bridge for Computer Use/native text injection');
    assert.ok(terminal.includes("textarea.value = ''"), 'accessibility input bridge must clear helper textarea after forwarding text to PTY');
    assert.ok(terminal.includes("value.replace(/\\r?\\n/g, '\\r')"), 'accessibility input bridge must translate submitted newlines into terminal carriage returns');
    assert.ok(terminal.includes('autoCreatedRef'), 'terminal must only auto-create the initial session so closing the last session remains possible');
    assert.ok(terminal.includes('const closeSession = useCallback'), 'terminal session tabs must expose a close action');
    assert.ok(terminal.includes('terminal-tab-close'), 'terminal session tabs must render visible close controls');
    assert.ok(terminal.includes('isCreating'), 'terminal must track shell creation separately from the tab list');
    assert.ok(terminal.includes("'No terminal sessions'"), 'terminal empty state must not keep showing a stale Starting shell message after closing the last session');
    assert.ok(terminal.includes('disabled={isCreating}'), 'terminal new-session buttons must avoid duplicate starts while a shell is already being created');
    assert.ok(bottomTabBar.includes('bottom-tab-item'), 'bottom panel tabs must separate the tab button from the close button');
    assert.ok(bottomTabBar.includes('type="button"\n                        className="bottom-tab-close"'), 'bottom panel close control must be a real button, not a hidden nested role span');
    assert.ok(panelCss.includes('.bottom-tab-item'), 'bottom panel tab wrappers must be styled');
    assert.ok(panelCss.includes('.bottom-tab-close:hover'), 'bottom panel close controls must be visibly styled');
    assert.ok(!panelCss.includes('opacity: 0;'), 'bottom panel close controls must not be hidden until hover');
    assert.ok(terminalMain.includes("import { spawn as spawnPty } from 'node-pty'"), 'Electron terminal backend must use node-pty instead of pipe-backed child_process.spawn');
    assert.ok(terminalMain.includes("const pty = spawnPty(shell, ['-l']"), 'terminal sessions must be created as login PTYs');
    assert.ok(terminalMain.includes('session.pty.write(data)'), 'terminal writes must go to the PTY');
    assert.ok(terminalMain.includes('session.pty.resize('), 'terminal resize must resize the PTY');
    assert.ok(electronConfig.includes("'node-pty'"), 'electron-vite must externalize node-pty native bindings');
    assert.ok(terminalCss.includes('.terminal-xterm-host'), 'xterm host must be styled');
    assert.ok(terminalCss.includes('.terminal-tab-close'), 'terminal session close controls must be styled');
});

test('Electron browser panel uses a hardened webview instead of a CSP-blocked iframe', () => {
    const main = read('electron/src/main/index.ts');
    const browser = read('public/manager/src/browser-panel/BrowserPanel.tsx');
    const css = read('public/manager/src/browser-panel/browser-panel.css');

    assert.ok(main.includes('webviewTag: true'), 'BrowserWindow must enable webview only for the desktop browser panel');
    assert.ok(main.includes("mainWindow.webContents.on('will-attach-webview'"), 'Electron main must validate every attached webview');
    assert.ok(main.includes('function isAllowedEmbeddedBrowserUrl'), 'webview navigation must use a dedicated URL policy');
    assert.ok(main.includes('function normalizeAllowedEmbeddedBrowserUrl'), 'webview navigation must normalize allowed http/https URLs before forwarding them');
    assert.ok(main.includes("if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;"), 'Electron webview policy must reject non-http protocols before allowing navigation');
    assert.ok(main.includes('if (parsed.username || parsed.password) return null;'), 'Electron webview policy must reject credential-bearing URLs');
    assert.ok(main.includes('return normalizeAllowedEmbeddedBrowserUrl(raw) !== null;'), 'Electron webview policy must allow local/private http preview URLs after protocol validation');
    assert.ok(!main.includes('BLOCKED_EMBED_HOSTS'), 'Electron webview policy must not block localhost/private preview URLs in the desktop Browser panel');
    assert.ok(main.includes('hardenEmbeddedBrowserWebContents'), 'webview contents must deny permissions and popups');
    assert.ok(main.includes("mainWindow.webContents.send('browser:open-url'"), 'webview popup/new-window requests must be routed back into the Browser panel');
    assert.ok(main.includes('registerGlobalWebContentsHardening'), 'global webContents hardening must be registered once instead of per window recreation');
    assert.ok(browser.includes("createElement('webview'"), 'BrowserPanel must render Electron webview, not an iframe');
    assert.ok(browser.includes('allowpopups: true'), 'BrowserPanel must allow popup requests so main can convert target=_blank clicks into in-app tabs');
    assert.ok(browser.includes("partition: 'persist:cli-jaw-browser'"), 'BrowserPanel must keep a persistent Electron browser session partition');
    assert.ok(browser.includes('Browser preview requires the Electron desktop app'), 'web UI must not present a broken iframe browser');
    assert.ok(css.includes('.browser-go-btn'), 'browser toolbar must expose an explicit go action');

    const preload = read('electron/src/preload/index.ts');
    const desktopBridge = read('public/manager/src/panels/desktop-bridge.ts');
    assert.ok(preload.includes("ipcRenderer.on('browser:open-url', handler)"), 'preload must expose Browser panel popup routing events');
    assert.ok(desktopBridge.includes('browser?: BrowserBridgeApi'), 'desktop bridge type must include Browser panel popup routing events');
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
    assert.ok(
        polish.includes('.manager-workspace.is-right-panel-open'),
        'medium-width polish must explicitly preserve the right panel grid column when the panel is open',
    );
    assert.ok(
        !polish.includes('grid-template-columns: 300px minmax(0, 1fr);'),
        'medium-width polish must not replace the workspace with a two-column grid that pushes the right panel offscreen',
    );
    assert.ok(
        polish.includes('grid-template-areas: "sidebar center right" "sidebar bottom right"'),
        'medium-width polish must keep the current right grid area name',
    );
    assert.ok(
        polish.includes('grid-template-areas: "center";'),
        'narrow collapsed-inspector polish must use the current center grid area name',
    );
    assert.ok(
        polish.includes('grid-template-areas: "center" "mobile-nav";'),
        'mobile collapsed-inspector polish must use the current center grid area name',
    );
    const workspace = read('public/manager/src/components/WorkspaceLayout.tsx');
    const layout = read('public/manager/src/manager-layout.css');
    assert.ok(workspace.includes("props.rightPanelOpen && 'is-right-panel-open'"), 'workspace must expose an open-state class for responsive right panel rules');
    assert.ok(workspace.includes("props.bottomPanelOpen && 'is-bottom-panel-open'"), 'workspace must expose a bottom-panel open class so mobile layouts do not infer it from the legacy inspector state');
    assert.ok(layout.includes('position: relative;'), 'workspace must create a containing block for narrow right-panel overlay layout');
    assert.ok(layout.includes('.manager-workspace.is-right-panel-open .right-panel'), 'narrow layouts must keep the right panel visible as an overlay instead of pushing it offscreen');
    assert.ok(layout.includes('.manager-workspace.is-bottom-panel-open'), 'mobile layouts must keep an explicit bottom panel grid row when the terminal panel is open');
    assert.ok(layout.includes('grid-area: auto;'), 'mobile right panel overlay must clear its desktop right grid area to avoid implicit grid clipping');
    assert.ok(layout.includes('height: auto;'), 'mobile right panel overlay must stretch between top and bottom insets instead of collapsing to its toolbar');
    assert.ok(layout.includes('justify-self: end;'), 'mobile right panel overlay must anchor to the right edge without creating implicit grid columns');
});
