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

    assert.ok(rail.includes('aria-label="Toggle terminal panel"'), 'SidebarRail must expose the bottom terminal panel toggle');
    assert.ok(rail.includes("panelActions.openBottomTab('terminal')"), 'bottom panel toggle must open the terminal tab when closed');
    assert.ok(rail.includes('aria-label="Toggle right panel"'), 'SidebarRail must expose the right panel toggle');
    assert.ok(rail.includes("panelActions.openRightPanel('folder')"), 'right panel toggle must open the folder panel when closed');
    assert.ok(layout.includes('display: flex'), 'manager sidebar must allow rail height to grow without clipping its list');
    assert.ok(layout.includes('.manager-sidebar-list { flex: 1 1 auto;'), 'sidebar list must size from remaining space, not a fixed rail height');
    assert.ok(compact.includes('flex-wrap: wrap'), 'expanded rail must wrap utility buttons instead of clipping them');
    assert.ok(compact.includes('flex: 0 0 100%'), 'expanded rail spacer must force panel toggles onto a second row instead of pushing them past the sidebar edge');
    assert.ok(compact.includes('min-height: 76px'), 'expanded rail must reserve enough height for its wrapped controls');
    assert.ok(compact.includes('overflow: visible'), 'expanded rail must not crop wrapped controls');
    assert.ok(compact.includes('.rail-panel-toggle'), 'panel toggles must have distinct visible styling');
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
