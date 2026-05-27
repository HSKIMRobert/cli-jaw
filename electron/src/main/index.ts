import { app, BrowserWindow, dialog, screen, session, shell } from 'electron';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { findJawBinary, spawnJawDashboard, gracefulShutdown } from './lib/jaw-spawn.js';
import { waitForManagerReady, isManagerHealthy, probeOnce } from './lib/health-check.js';
import {
  buildManagerCsp,
  buildPreviewFrameOrigins,
  isManagerNavigation,
  isPreviewFrameNavigation,
  resolvePreviewFramePolicy,
} from './lib/navigation-policy.js';
import {
  showJawNotFoundDialog,
  showCrashLoopDialog,
  showSpawnFailedDialog,
} from './lib/dialog.js';
import {
  extractJawUrlArg,
  focusWindow,
  registerJawProtocol,
  routeJawDeepLink,
} from './lib/deep-link.js';
import { RingBuffer } from './lib/ring-buffer.js';
import { startAppMetricsCollector, type MetricsCollectorHandle } from './lib/app-metrics.js';
import { registerTerminalIpc, cleanupTerminals } from './lib/terminal/index.js';
import { registerDiffIpc } from './lib/git/ipc.js';
import { registerFolderIpc, cleanupFolderWatchers } from './lib/folder/ipc.js';
import { setAllowedOrigin } from './lib/ipc-origin-guard.js';

interface CliFlags {
  port: number;
  attachOnly: boolean;
  spawn: boolean;
  managerUrl: string;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function assertLoopbackManagerUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error(`[jaw-electron] invalid manager URL: ${raw}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `[jaw-electron] manager URL must use http: or https:. Got: ${parsed.protocol}`,
    );
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `[jaw-electron] manager URL must be loopback (127.0.0.1, localhost, ::1). Got: ${parsed.hostname}`,
    );
  }
}

function parseArgs(argv: string[]): CliFlags {
  let port = Number(process.env.JAW_MANAGER_PORT ?? 24576);
  let attachOnly = false;
  let spawn = false;
  let managerUrl = process.env.JAW_MANAGER_URL ?? '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') {
      const v = argv[++i];
      if (v) port = Number(v);
    } else if (a?.startsWith('--port=')) {
      port = Number(a.slice('--port='.length));
    } else if (a === '--attach-only') {
      attachOnly = true;
    } else if (a === '--spawn') {
      spawn = true;
    } else if (a === '--manager-url') {
      const v = argv[++i];
      if (v) managerUrl = v;
    } else if (a?.startsWith('--manager-url=')) {
      managerUrl = a.slice('--manager-url='.length);
    }
  }
  if (!Number.isFinite(port) || port <= 0) port = 24576;
  if (!managerUrl) managerUrl = `http://127.0.0.1:${port}/`;
  if (!managerUrl.endsWith('/')) managerUrl = `${managerUrl}/`;
  assertLoopbackManagerUrl(managerUrl);
  return { port, attachOnly, spawn, managerUrl };
}

const FLAGS = parseArgs(process.argv.slice(1));
let MANAGER_URL = FLAGS.managerUrl;
let MANAGER_ORIGIN = new URL(MANAGER_URL).origin;
setAllowedOrigin(MANAGER_ORIGIN);
const PREVIEW_FRAME_POLICY = resolvePreviewFramePolicy(process.env);

const EXTERNAL_ALLOWLIST = [
  'github.com',
  'docs.lidge.ai',
  'chatgpt.com',
  'claude.ai',
  'openai.com',
  'anthropic.com',
];

const DEV_TOOLS_ENABLED =
  process.env.NODE_ENV === 'development' || process.env.JAW_ELECTRON_DEVTOOLS === '1';
const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 960;
const WINDOW_WORK_AREA_MARGIN = 80;
const MIN_VISIBLE_WINDOW_WIDTH = 960;
const MIN_VISIBLE_WINDOW_HEIGHT = 640;

const ringBuffer = new RingBuffer(1024 * 1024);
let managerProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let pendingDeepLinkUrl: string | null = null;
let restartTimestamps: number[] = [];
let crashLoopStopped = false;
let shuttingDown = false;
let shutdownComplete = false;
let bootstrapPromise: Promise<void> | null = null;
let managerReadyPromise: Promise<void> | null = null;
let metricsCollector: MetricsCollectorHandle | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRELOAD_PATH = join(__dirname, '..', 'preload', 'index.js');
const DESKTOP_USER_AGENT_TOKEN = 'cli-jaw-desktop';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.enableSandbox();
  registerJawProtocol(app);

  app.on('second-instance', (_event, argv) => {
    const deepLink = extractJawUrlArg(argv);
    if (deepLink) {
      void handleDeepLink(deepLink);
      return;
    }
    focusWindow(mainWindow);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    void handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    await bootstrapOnce();
    if (!metricsCollector) {
      try {
        metricsCollector = startAppMetricsCollector();
      } catch (err) {
        ringBuffer.append(`[metrics start error] ${(err as Error)?.message ?? err}\n`);
      }
    }
    if (pendingDeepLinkUrl) {
      const pending = pendingDeepLinkUrl;
      pendingDeepLinkUrl = null;
      await handleDeepLink(pending);
    }

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        void bootstrapOnce();
      }
    });
  }).catch((err) => {
    console.error('[jaw-electron] bootstrap failed', err);
    dialog.showErrorBox('jaw Electron', String(err?.stack ?? err));
    app.quit();
  });
}

function getInitialWindowBounds(): { width: number; height: number; x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  const maxWidth = Math.max(MIN_VISIBLE_WINDOW_WIDTH, workArea.width - WINDOW_WORK_AREA_MARGIN);
  const maxHeight = Math.max(MIN_VISIBLE_WINDOW_HEIGHT, workArea.height - WINDOW_WORK_AREA_MARGIN);
  const width = Math.min(DEFAULT_WINDOW_WIDTH, maxWidth);
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, maxHeight);
  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  };
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (shutdownComplete) return;
  if (shuttingDown) {
    event.preventDefault();
    return;
  }
  if (metricsCollector) {
    try {
      metricsCollector.stop();
    } catch {
      // ignore
    }
    metricsCollector = null;
  }
  cleanupTerminals();
  cleanupFolderWatchers();
  if (!managerProcess) return;
  event.preventDefault();
  shuttingDown = true;
  try {
    await gracefulShutdown(managerProcess, 5000);
  } finally {
    managerProcess = null;
    shutdownComplete = true;
    app.quit();
  }
});

async function bootstrap(): Promise<void> {
  installSecurityHeaders(MANAGER_ORIGIN);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerTerminalIpc(() => mainWindow);
  registerDiffIpc();
  registerFolderIpc(() => mainWindow);

  await ensureManagerRunning();
  await createWindow();
}

function bootstrapOnce(): Promise<void> {
  if (shuttingDown || shutdownComplete) return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().finally(() => {
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

async function handleDeepLink(raw: string): Promise<void> {
  if (!app.isReady()) {
    pendingDeepLinkUrl = raw;
    return;
  }
  try {
    const routed = await routeJawDeepLink(raw, {
      managerUrl: MANAGER_URL,
      getWindow: () => mainWindow,
      ensureReady: bootstrapOnce,
    });
    if (!routed) focusWindow(mainWindow);
  } catch (err) {
    ringBuffer.append(`[deep-link error] ${(err as Error)?.message ?? err}\n`);
    focusWindow(mainWindow);
  }
}

function installSecurityHeaders(managerOrigin: string): void {
  const csp = buildManagerCsp(
    managerOrigin,
    buildPreviewFrameOrigins(PREVIEW_FRAME_POLICY),
  );

  const filter = { urls: [`${managerOrigin}/*`] };
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'content-security-policy' || lower === 'x-content-type-options') {
        delete headers[key];
      }
    }
    headers['Content-Security-Policy'] = [csp];
    headers['X-Content-Type-Options'] = ['nosniff'];
    callback({ responseHeaders: headers });
  });
}

function isAllowedFrameNavigation(raw: string): boolean {
  return isManagerNavigation(raw, MANAGER_ORIGIN)
    || isPreviewFrameNavigation(raw, PREVIEW_FRAME_POLICY);
}

const PROBE_PORTS = [3457, 3459];

function switchManagerUrl(url: string): void {
  MANAGER_URL = url;
  MANAGER_ORIGIN = new URL(url).origin;
  setAllowedOrigin(MANAGER_ORIGIN);
}

async function ensureManagerRunning(): Promise<void> {
  if (await isManagerHealthy(MANAGER_URL)) return;

  for (const port of PROBE_PORTS) {
    const candidate = `http://127.0.0.1:${port}/`;
    if (candidate !== MANAGER_URL && await isManagerHealthy(candidate)) {
      switchManagerUrl(candidate);
      installSecurityHeaders(MANAGER_ORIGIN);
      return;
    }
  }

  if (managerReadyPromise) return managerReadyPromise;

  managerReadyPromise = (async () => {
    if (await isManagerHealthy(MANAGER_URL)) return;

    if (FLAGS.attachOnly) {
      const ok = await waitForManagerReady(MANAGER_URL, { timeoutMs: 60_000 });
      if (!ok) {
        await showSpawnFailedDialog(
          `${MANAGER_URL} 에 연결할 수 없습니다. --attach-only 모드이므로 서버를 자동 spawn하지 않습니다.`,
        );
        app.quit();
      }
      return;
    }

    await spawnAndWait();
  })().finally(() => {
    managerReadyPromise = null;
  });

  return managerReadyPromise;
}

async function spawnAndWait(): Promise<void> {
  const found = await findJawBinary();
  if (!found.path) {
    const choice = await showJawNotFoundDialog(found.searched);
    if (choice === 'pick') {
      const picked = await dialog.showOpenDialog({
        title: 'jaw 실행 파일 선택',
        properties: ['openFile'],
      });
      if (!picked.canceled && picked.filePaths[0]) {
        process.env.JAW_BIN = picked.filePaths[0];
        return spawnAndWait();
      }
    }
    app.quit();
    return;
  }

  managerProcess = spawnJawDashboard(found.path, {
    port: FLAGS.port,
    ringBuffer,
  });

  managerProcess.on('exit', handleManagerExit);
  managerProcess.on('error', (err) => {
    ringBuffer.append(`[spawn error] ${err.message}\n`);
  });

  const ok = await waitForManagerReady(MANAGER_URL, { timeoutMs: 60_000 });
  if (!ok) {
    await showSpawnFailedDialog(
      `60초 안에 ${MANAGER_URL} 가 응답하지 않았습니다.\n\n최근 로그:\n${ringBuffer.read().slice(-1500)}`,
    );
    app.quit();
  }
}

function handleManagerExit(code: number | null, signal: NodeJS.Signals | null): void {
  ringBuffer.append(`[manager exit] code=${code} signal=${signal}\n`);
  if (shuttingDown || crashLoopStopped) return;
  void (async () => {
    if (await probeOnce(MANAGER_URL)) {
      ringBuffer.append(`[manager exit] another instance owns ${MANAGER_URL}; attaching\n`);
      managerProcess = null;
      if (mainWindow) {
        try {
          await mainWindow.loadURL(MANAGER_URL);
        } catch (err) {
          ringBuffer.append(`[attach error] ${(err as Error)?.message ?? err}\n`);
        }
      }
      return;
    }
    const now = Date.now();
    restartTimestamps = restartTimestamps.filter((t) => now - t < 60_000);
    restartTimestamps.push(now);
    if (restartTimestamps.length > 3) {
      crashLoopStopped = true;
      void showCrashLoopDialog(ringBuffer.read()).then(() => app.quit());
      return;
    }
    try {
      await ensureManagerRunning();
      if (await probeOnce(MANAGER_URL)) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            await mainWindow.loadURL(MANAGER_URL);
          } catch (err) {
            ringBuffer.append(`[respawn reload error] ${(err as Error)?.message ?? err}\n`);
          }
        }
      }
    } catch (err) {
      ringBuffer.append(`[respawn error] ${(err as Error)?.message ?? err}\n`);
    }
  })();
}

async function createWindow(): Promise<void> {
  const initialWindowBounds = getInitialWindowBounds();
  mainWindow = new BrowserWindow({
    ...initialWindowBounds,
    minWidth: MIN_VISIBLE_WINDOW_WIDTH,
    minHeight: MIN_VISIBLE_WINDOW_HEIGHT,
    show: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: PRELOAD_PATH,
      devTools: DEV_TOOLS_ENABLED,
    },
  });
  const userAgent = mainWindow.webContents.getUserAgent();
  if (!userAgent.includes(DESKTOP_USER_AGENT_TOKEN)) {
    mainWindow.webContents.setUserAgent(`${userAgent} ${DESKTOP_USER_AGENT_TOKEN}/${app.getVersion()}`);
  }

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (!isManagerNavigation(url, MANAGER_ORIGIN)) {
      event.preventDefault();
    }
  };

  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (!isAllowedFrameNavigation(event.url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return { action: 'deny' };
      if (parsed.username || parsed.password) return { action: 'deny' };
      const host = parsed.hostname.toLowerCase();
      const allow = EXTERNAL_ALLOWLIST.some(
        (h) => host === h || host.endsWith(`.${h}`),
      );
      if (!allow) return { action: 'deny' };
      void shell.openExternal(parsed.toString()).catch(() => {});
    } catch {
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (DEV_TOOLS_ENABLED) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  await mainWindow.loadURL(MANAGER_URL);
}
