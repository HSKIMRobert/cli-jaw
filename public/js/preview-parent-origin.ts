const RESERVED_NOTE_SEGMENTS = new Set(['.git', '.assets', '_templates', '_snippets', '_plugins']);

export function isLocalPreviewRelayOrigin(origin: string): boolean {
    if (origin === window.location.origin) return true;
    try {
        const hostname = new URL(origin).hostname;
        return hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '::1'
            || hostname === '[::1]';
    } catch {
        return false;
    }
}

export function previewParentOrigin(): string | null {
    if (window.parent === window) return null;
    try {
        const parentOrigin = window.parent.location.origin;
        if (parentOrigin && parentOrigin !== 'null' && isLocalPreviewRelayOrigin(parentOrigin)) {
            return parentOrigin;
        }
    } catch { /* cross-origin preview iframe */ }
    try {
        if (document.referrer) {
            const origin = new URL(document.referrer).origin;
            if (isLocalPreviewRelayOrigin(origin)) return origin;
        }
    } catch { /* ignore */ }
    return null;
}

// Parent-manager capability flags, announced via 'jaw-preview-capabilities'.
// Defaults to false so non-Electron parents keep the openLocalPath fallback.
let parentDocPanelCapable = false;
let capabilityListenerReady = false;

export function parentSupportsDocPanel(): boolean {
    return parentDocPanelCapable;
}

export function ensurePreviewCapabilityListener(): void {
    if (capabilityListenerReady) return;
    capabilityListenerReady = true;
    window.addEventListener('message', (event: MessageEvent) => {
        if (!isLocalPreviewRelayOrigin(event.origin)) return;
        const data = event.data as { type?: unknown; docPanel?: unknown } | null;
        if (!data || data.type !== 'jaw-preview-capabilities') return;
        parentDocPanelCapable = data.docPanel === true;
    });
}

export function postPreviewOpenNotes(path: string): boolean {
    const targetOrigin = previewParentOrigin();
    if (!targetOrigin || !path.trim()) return false;
    window.parent.postMessage({ type: 'jaw-preview-open-notes', path }, targetOrigin);
    return true;
}

export function postPreviewOpenDoc(absolutePath: string): boolean {
    const targetOrigin = previewParentOrigin();
    if (!targetOrigin || !absolutePath.trim()) return false;
    window.parent.postMessage({ type: 'jaw-preview-open-doc', path: absolutePath }, targetOrigin);
    return true;
}

export function postPreviewInvalidate(topics: string[], reason: string): boolean {
    const targetOrigin = previewParentOrigin();
    if (!targetOrigin || topics.length === 0) return false;
    window.parent.postMessage({ type: 'dashboard.invalidate', topics, reason }, targetOrigin);
    return true;
}
