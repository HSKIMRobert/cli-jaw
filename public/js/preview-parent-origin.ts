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

export function postPreviewOpenNotes(path: string): boolean {
    const targetOrigin = previewParentOrigin();
    if (!targetOrigin || !path.trim()) return false;
    window.parent.postMessage({ type: 'jaw-preview-open-notes', path }, targetOrigin);
    return true;
}
