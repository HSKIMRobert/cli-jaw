import {
  isManagerNavigation,
  isPreviewFrameNavigation,
  type PreviewFramePolicy,
} from './navigation-policy.js';

export type ElectronPermissionSurface = 'manager-window' | 'preview-frame' | 'embedded-browser-webview';
export type ElectronPermissionDecision = 'allow' | 'deny' | 'bridge-only';

export type ElectronPermissionDenial = {
  at: string;
  surface: ElectronPermissionSurface;
  permission: string;
  requestingUrl: string;
  reason: string;
};

const DENIAL_LIMIT = 50;
const denials: ElectronPermissionDenial[] = [];

export function getLastElectronPermissionDenials(): ElectronPermissionDenial[] {
  return [...denials];
}

export function recordElectronPermissionDenial(input: Omit<ElectronPermissionDenial, 'at'>): void {
  denials.push({ ...input, at: new Date().toISOString() });
  while (denials.length > DENIAL_LIMIT) denials.shift();
}

function safeUrl(raw: string): string {
  try {
    return new URL(raw).toString();
  } catch {
    return '';
  }
}

function isManagerOrPreview(
  raw: string,
  managerOrigin: string,
  previewPolicy: PreviewFramePolicy,
): { manager: boolean; preview: boolean } {
  const url = safeUrl(raw);
  if (!url) return { manager: false, preview: false };
  return {
    manager: isManagerNavigation(url, managerOrigin),
    preview: isPreviewFrameNavigation(url, previewPolicy),
  };
}

export function resolveElectronPermissionDecision(args: {
  permission: string;
  requestingUrl: string;
  managerOrigin: string;
  previewPolicy: PreviewFramePolicy;
  surface: ElectronPermissionSurface;
  mediaType?: string | undefined;
}): { decision: ElectronPermissionDecision; reason: string } {
  if (args.surface === 'embedded-browser-webview') {
    return { decision: 'deny', reason: 'remote webview permissions are denied by default' };
  }
  const allowedOrigin = isManagerOrPreview(args.requestingUrl, args.managerOrigin, args.previewPolicy);
  if (!allowedOrigin.manager && !allowedOrigin.preview) {
    return { decision: 'deny', reason: 'requesting origin is outside manager/preview allowlist' };
  }
  if (args.permission === 'media') {
    if (args.mediaType === 'video') return { decision: 'deny', reason: 'camera capture is not allowed' };
    return { decision: 'allow', reason: 'manager/preview microphone capture allowed' };
  }
  if (args.permission === 'clipboard-sanitized-write') {
    return { decision: 'allow', reason: 'manager-owned sanitized clipboard write allowed' };
  }
  if (args.permission === 'clipboard-read' || args.permission === 'deprecated-sync-clipboard-read') {
    return { decision: 'deny', reason: 'clipboard read requires a future explicit user flow' };
  }
  if (args.permission === 'fullscreen') {
    return { decision: 'allow', reason: 'manager/preview fullscreen allowed' };
  }
  return { decision: 'deny', reason: `permission ${args.permission} is not in the allowlist` };
}
