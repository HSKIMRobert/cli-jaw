import { useCallback, useEffect, useRef } from 'react';
import { sendInstanceMessage } from './api';
import { buildPreviewState } from './preview';
import type { PreviewTheme } from './preview';
import type { DashboardInstance, DashboardScanResult } from './types';

type InstancePreviewProps = {
    instance: DashboardInstance | null;
    data: DashboardScanResult | null;
    enabled: boolean;
    active: boolean;
    refreshKey: number;
    theme: PreviewTheme;
    onOpenNotesFromPreview?: (path: string) => void;
    onOpenDocFromPreview?: (absolutePath: string) => void;
};

type PreviewOpenNotesMessage = {
    type?: unknown;
    path?: unknown;
};

type PreviewSendMessage = {
    type?: unknown;
    requestId?: unknown;
    prompt?: unknown;
};

function normalizeLoopbackHostname(hostname: string): string {
    return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
    const normalized = normalizeLoopbackHostname(hostname);
    return normalized === '127.0.0.1'
        || normalized === 'localhost'
        || normalized === '::1';
}

function loopbackOriginsEquivalent(a: string, b: string): boolean {
    if (a === b) return true;
    try {
        const left = new URL(a);
        const right = new URL(b);
        if (left.protocol !== right.protocol || left.port !== right.port) return false;
        return isLoopbackHostname(left.hostname) && isLoopbackHostname(right.hostname);
    } catch {
        return false;
    }
}

function previewFrameOriginMatches(origin: string, src: string, frame: HTMLIFrameElement | null): boolean {
    if (!origin || origin === 'null') return false;
    const targetOrigin = previewTargetOrigin(src, frame);
    return Boolean(targetOrigin && loopbackOriginsEquivalent(targetOrigin, origin));
}

function postPreviewSendResult(
    source: MessageEventSource | null,
    origin: string,
    requestId: string,
    result: { ok: boolean; status: number; data?: unknown; error?: string },
): void {
    if (!source || !origin || origin === 'null') return;
    try {
        (source as Window).postMessage({
            type: 'jaw-preview-send-result',
            requestId,
            ...result,
        }, origin);
    } catch (error) {
        console.warn('[manager-preview] send relay result skipped', error);
    }
}

function previewTargetOrigin(src: string, frame: HTMLIFrameElement | null): string | null {
    if (typeof window === 'undefined') return 'http://localhost';
    try {
        const actualOrigin = frame?.contentWindow?.location.origin;
        if (actualOrigin && actualOrigin !== 'null') return actualOrigin;
    } catch {
        // Cross-origin previews hide location; fall back to the expected source origin.
    }
    const expectedOrigin = new URL(src, window.location.href).origin;
    return expectedOrigin === 'null' ? null : expectedOrigin;
}

function postPreviewTheme(frame: HTMLIFrameElement | null, src: string, theme: PreviewTheme): void {
    const targetWindow = frame?.contentWindow;
    if (!targetWindow) return;
    const targetOrigin = previewTargetOrigin(src, frame);
    if (!targetOrigin || targetOrigin === 'null') return;
    try {
        targetWindow.postMessage(
            { type: 'jaw-preview-theme-sync', theme },
            targetOrigin,
        );
    } catch (error) {
        console.warn('[manager-preview] theme sync skipped', error);
    }
}

function postPreviewSttToggle(frame: HTMLIFrameElement | null, src: string): void {
    const targetWindow = frame?.contentWindow;
    if (!targetWindow) return;
    const targetOrigin = previewTargetOrigin(src, frame);
    if (!targetOrigin || targetOrigin === 'null') return;
    try {
        targetWindow.postMessage(
            { type: 'jaw-preview-stt-toggle' },
            targetOrigin,
        );
    } catch (error) {
        console.warn('[manager-preview] STT shortcut sync skipped', error);
    }
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return Boolean(target.closest('[contenteditable="true"], .cm-editor, .ProseMirror, [data-milkdown-root]'));
}

function isPreviewSttShortcut(event: KeyboardEvent): boolean {
    const primarySpace = (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space';
    const fallbackMic = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyM';
    return primarySpace || fallbackMic;
}

export function InstancePreview(props: InstancePreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const loadedSrcRef = useRef<string | null>(null);
    const state = buildPreviewState(
        props.instance,
        props.data,
        // Keep the dedicated preview origin as the default. The legacy `/i`
        // path is only a fallback because root-relative `/api` and `/ws`
        // requests must keep targeting the managed instance.
        { theme: props.theme },
    );
    const disabledReason = props.instance?.ok
        ? 'Preview is off. Turn it on from the header to mount the iframe.'
        : state.reason;
    const syncTheme = useCallback((): void => {
        if (!props.enabled || !state.canPreview || !state.src) return;
        if (loadedSrcRef.current !== state.src) return;
        postPreviewTheme(iframeRef.current, state.src, props.theme);
    }, [props.enabled, props.theme, state.canPreview, state.src]);

    useEffect(() => {
        syncTheme();
    }, [syncTheme]);

    useEffect(() => {
        if (!props.enabled || !state.canPreview || !state.src || !props.instance?.ok) return undefined;
        function onPreviewSend(event: MessageEvent): void {
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (!state.src || !previewFrameOriginMatches(event.origin, state.src, iframeRef.current)) return;
            const data = event.data as PreviewSendMessage | null;
            if (!data || data.type !== 'jaw-preview-send-message') return;
            const requestId = typeof data.requestId === 'string' ? data.requestId : '';
            const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
            if (!requestId) return;
            if (!prompt) {
                postPreviewSendResult(event.source, event.origin, requestId, {
                    ok: false,
                    status: 400,
                    error: 'prompt must be a non-empty string',
                });
                return;
            }
            void sendInstanceMessage(props.instance!.port, prompt)
                .then(result => {
                    postPreviewSendResult(event.source, event.origin, requestId, {
                        ok: result.ok,
                        status: result.status,
                        data: result.data,
                        ...(result.data.error ? { error: result.data.error } : {}),
                    });
                })
                .catch(error => {
                    postPreviewSendResult(event.source, event.origin, requestId, {
                        ok: false,
                        status: 502,
                        error: (error as Error).message,
                    });
                });
        }
        window.addEventListener('message', onPreviewSend);
        function onPreviewOpenNotes(event: MessageEvent): void {
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (!state.src || !previewFrameOriginMatches(event.origin, state.src, iframeRef.current)) return;
            const data = event.data as PreviewOpenNotesMessage | null;
            if (!data || data.type !== 'jaw-preview-open-notes') return;
            const path = typeof data.path === 'string' ? data.path.trim() : '';
            if (!path) return;
            props.onOpenNotesFromPreview?.(path);
        }
        window.addEventListener('message', onPreviewOpenNotes);
        function onPreviewOpenDoc(event: MessageEvent): void {
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (!state.src || !previewFrameOriginMatches(event.origin, state.src, iframeRef.current)) return;
            const data = event.data as { type?: unknown; path?: unknown } | null;
            if (!data || data.type !== 'jaw-preview-open-doc') return;
            const path = typeof data.path === 'string' ? data.path.trim() : '';
            if (!path) return;
            props.onOpenDocFromPreview?.(path);
        }
        window.addEventListener('message', onPreviewOpenDoc);
        return () => {
            window.removeEventListener('message', onPreviewSend);
            window.removeEventListener('message', onPreviewOpenNotes);
            window.removeEventListener('message', onPreviewOpenDoc);
        };
    }, [props.enabled, props.instance, props.onOpenNotesFromPreview, props.onOpenDocFromPreview, state.canPreview, state.src]);

    useEffect(() => {
        if (!props.active || !props.enabled || !state.canPreview || !state.src) return undefined;
        function onKeyDown(event: KeyboardEvent): void {
            if (event.defaultPrevented) return;
            if (isEditableShortcutTarget(event.target)) return;
            if (!isPreviewSttShortcut(event)) return;
            event.preventDefault();
            postPreviewSttToggle(iframeRef.current, state.src || '');
        }
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [props.active, props.enabled, state.canPreview, state.src]);

    const prevActiveRef = useRef(false);
    useEffect(() => {
        const wasActive = prevActiveRef.current;
        prevActiveRef.current = props.active;
        if (!wasActive && props.active && iframeRef.current?.contentWindow && state.src) {
            const origin = previewTargetOrigin(state.src, iframeRef.current);
            if (origin && origin !== 'null') {
                try {
                    iframeRef.current.contentWindow.postMessage(
                        { type: 'jaw-preview-visibility', visible: true },
                        origin,
                    );
                } catch { /* cross-origin guard */ }
            }
        }
    }, [props.active, state.src]);

    return (
        <aside className="preview-panel" aria-label="Instance preview">
            {(!props.enabled || !state.canPreview) && <div className="preview-empty">{disabledReason}</div>}

            {props.enabled && state.canPreview && state.src && (
                <iframe
                    key={`${props.instance?.port || 'none'}:${props.refreshKey}`}
                    title={`Jaw instance ${props.instance?.port} preview`}
                    ref={iframeRef}
                    className="preview-frame"
                    src={state.src}
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                    allow="clipboard-read; clipboard-write; microphone"
                    onLoad={() => {
                        loadedSrcRef.current = state.src;
                        syncTheme();
                    }}
                />
            )}
        </aside>
    );
}
