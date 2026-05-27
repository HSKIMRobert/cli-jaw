import { contextBridge, ipcRenderer } from 'electron';
import { getLatestMetrics, setupMetricsBridge } from './metrics.js';

const DESKTOP_IDENTITY = {
  name: 'cli-jaw-desktop',
  electron: true,
  header: 'X-CLI-Jaw-Electron',
} as const;

function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function installDesktopFetchHeader(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isSameOrigin(input)) return nativeFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(DESKTOP_IDENTITY.header, '1');
    return nativeFetch(input, { ...init, headers });
  };
}

function markDesktopDocument(): void {
  try {
    document.documentElement.dataset.cliJawDesktop = 'true';
  } catch (err) {
    console.warn('[cli-jaw-desktop] failed to mark desktop document', err);
  }
}

function getHomePath(): string {
  try {
    return process.env.HOME || process.env.USERPROFILE || '';
  } catch {
    return '';
  }
}

contextBridge.exposeInMainWorld('cliJawDesktop', {
  identify: () => DESKTOP_IDENTITY,
  getMetrics: () => getLatestMetrics(),
  getHomePath,
  terminal: {
    create: (opts?: { cwd?: string }) => ipcRenderer.invoke('terminal:create', opts),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    onData: (cb: (id: string, data: string) => void) => {
      const handler = (_e: unknown, id: string, data: string) => cb(id, data);
      ipcRenderer.on('terminal:data', handler);
      return () => { ipcRenderer.removeListener('terminal:data', handler); };
    },
    onExit: (cb: (id: string, code: number | null) => void) => {
      const handler = (_e: unknown, id: string, code: number | null) => cb(id, code);
      ipcRenderer.on('terminal:exit', handler);
      return () => { ipcRenderer.removeListener('terminal:exit', handler); };
    },
  },
  diff: {
    getRepoRoot: (cwd: string) => ipcRenderer.invoke('diff:getRepoRoot', cwd),
    getDiffSummary: (repoRoot: string, ref?: string) => ipcRenderer.invoke('diff:getDiffSummary', repoRoot, ref),
    getFileDiff: (repoRoot: string, filePath: string, ref?: string) => ipcRenderer.invoke('diff:getFileDiff', repoRoot, filePath, ref),
  },
  folder: {
    getDefaultRoot: () => ipcRenderer.invoke('folder:getDefaultRoot'),
    pickFolder: () => ipcRenderer.invoke('folder:pick'),
    listDir: (dirPath: string, depth?: number) => ipcRenderer.invoke('folder:listDir', dirPath, depth),
    readFile: (filePath: string) => ipcRenderer.invoke('folder:readFile', filePath),
    watchDir: (dirPath: string) => ipcRenderer.invoke('folder:watchDir', dirPath),
    unwatchDir: (dirPath: string) => ipcRenderer.invoke('folder:unwatchDir', dirPath),
    onDirChange: (cb: (dirPath: string) => void) => {
      const handler = (_e: unknown, dirPath: string) => cb(dirPath);
      ipcRenderer.on('folder:changed', handler);
      return () => { ipcRenderer.removeListener('folder:changed', handler); };
    },
  },
});

markDesktopDocument();
installDesktopFetchHeader();
setupMetricsBridge();
