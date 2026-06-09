// ── SSE Event Channel (singleton) ──
// Phase 3 of runtime SSE refactoring (devlog 260609, 30 §4).
// data-only wire format (00_1 F1): the server never sets the SSE `event:`
// field — topic + event arrive inside the JSON payload, so a single
// onmessage handler receives everything.
//
// Owns: the EventSource singleton, manual exponential-backoff reconnect
// (2s × 1.5^n, cap 30s) and Last-Event-ID replay via ?lastEventId=.
// Manual reconnect (close + new EventSource) is used instead of the browser's
// auto-retry so the backoff curve and replay cursor stay under our control.

import { API_BASE } from './api.js';

type TopicHandler = (data: Record<string, unknown>) => void;

interface Subscription {
    topic: string;          // '*' = wildcard (receives every event)
    event: string | null;   // null = whole topic
    handler: TopicHandler;
}

let source: EventSource | null = null;
let lastEventId = 0;
const subs: Subscription[] = [];
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30_000;
const RECONNECT_BACKOFF = 1.5;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentLang = '';
let wasConnected = false;
let closedByApp = false;
// Lifetime flag: has SSE EVER connected in this page session? Distinct from
// per-drop wasConnected — gates the legacy-WS fallback (31 audit rule 2).
let everConnected = false;
let openedThisAttempt = false;
let unavailableFiredThisAttempt = false;

let onOpenCb: (() => void) | null = null;
let onDisconnectCb: (() => void) | null = null;
let onUnavailableCb: (() => void) | null = null;

/** Register the connection-established callback (hydration entry point). */
export function onChannelOpen(cb: () => void): void { onOpenCb = cb; }

/** Register the connection-lost callback. Fired once per drop (connected → disconnected transition), not per retry. */
export function onChannelDisconnect(cb: () => void): void { onDisconnectCb = cb; }

/** Register the SSE-unsupported callback (devlog 260609, 31): fired at most once
 *  per connect attempt when the stream errors WITHOUT ever opening AND SSE has
 *  never connected in this session — i.e. a legacy server without /api/events.
 *  When it fires, internal backoff is suppressed; the consumer owns fallback. */
export function onChannelUnavailable(cb: () => void): void { onUnavailableCb = cb; }

export function subscribe(topic: string, event: string | null, handler: TopicHandler): () => void {
    const sub: Subscription = { topic, event, handler };
    subs.push(sub);
    return () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); };
}

function dispatch(topic: string, event: string, data: Record<string, unknown>): void {
    for (const s of subs) {
        if ((s.topic === '*' || s.topic === topic) && (s.event === null || s.event === event)) {
            try {
                s.handler(data);
            } catch (e) {
                console.warn('[sse] handler error:', (e as Error).message);
            }
        }
    }
}

function scheduleReconnect(): void {
    if (closedByApp || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectEventChannel(currentLang);
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * RECONNECT_BACKOFF, MAX_RECONNECT_DELAY);
}

export function connectEventChannel(lang: string): void {
    currentLang = lang;
    closedByApp = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (source) source.close();

    const url = `${API_BASE}/api/events?lang=${encodeURIComponent(lang)}` +
        (lastEventId ? `&lastEventId=${lastEventId}` : '');
    openedThisAttempt = false;
    unavailableFiredThisAttempt = false;
    source = new EventSource(url);

    source.onopen = () => {
        reconnectDelay = 2000;
        wasConnected = true;
        everConnected = true;
        openedThisAttempt = true;
        onOpenCb?.();
    };

    source.onerror = () => {
        source?.close();
        source = null;
        // Legacy server (no /api/events): error without a single open, ever.
        // Hand control to the fallback consumer instead of retrying SSE.
        if (!openedThisAttempt && !everConnected && onUnavailableCb) {
            if (!unavailableFiredThisAttempt) {
                unavailableFiredThisAttempt = true;
                onUnavailableCb();
            }
            return;
        }
        if (wasConnected) {
            wasConnected = false;
            onDisconnectCb?.();
        }
        scheduleReconnect();
    };

    source.onmessage = (e: MessageEvent) => {
        lastEventId = parseInt(e.lastEventId || '0', 10) || lastEventId;
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(e.data as string);
        } catch {
            console.warn('[sse] malformed message:', e.data);
            return;
        }
        if (!data || typeof data !== 'object'
            || typeof data['topic'] !== 'string' || typeof data['event'] !== 'string') {
            console.warn('[sse] invalid message shape:', data);
            return;
        }
        dispatch(data['topic'], data['event'], data);
    };
}

export function closeEventChannel(): void {
    closedByApp = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    source?.close();
    source = null;
    wasConnected = false;
}
