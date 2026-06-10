// ─── Worker SSE Client (manager → worker /api/events) ──
// P4-full of runtime SSE refactoring (devlog 260609, 09 §6 + 50 §2).
// The manager subscribes to each online worker's SSE stream instead of
// fetching messages on demand. Legacy workers without /api/events answer
// 4xx — those are marked unsupported ONCE and never retried (no backoff
// bombardment; 41's deferral concern). worker-events.ts owns lifecycle.

import { EventSource } from 'eventsource';

/** Wire shape of /api/events entries (data-only format, 00_1 F1):
 *  topic + event ride inside the JSON payload — no SSE `event:` field. */
export interface WorkerBusEvent {
    topic?: string;
    event?: string;
    [key: string]: unknown;
}

export interface WorkerEventHandlers {
    /** message:new_message — a new chat row landed on the worker. */
    onMessage?: (port: number, data: WorkerBusEvent) => void;
    /** agent:agent_done — the worker's agent finished a turn. */
    onAgentDone?: (port: number, data: WorkerBusEvent) => void;
    /** Worker answered 4xx (legacy server without /api/events). Permanent. */
    onUnsupported?: (port: number) => void;
    /** Connection gave up after exhausting transient retries. */
    onDisconnect?: (port: number) => void;
}

export const MAX_TRANSIENT_RETRIES = 10;

/** Injectable for tests — must match the EventSource constructor surface. */
export type EventSourceCtor = new (url: string) => Pick<
    EventSource, 'onmessage' | 'onerror' | 'onopen' | 'close' | 'readyState'
>;

export function subscribeToWorker(
    port: number,
    handlers: WorkerEventHandlers,
    EventSourceImpl: EventSourceCtor = EventSource,
): () => void {
    const es = new EventSourceImpl(`http://127.0.0.1:${port}/api/events`);
    let retryCount = 0;
    let done = false;

    const finish = (notify: 'unsupported' | 'disconnect' | null) => {
        if (done) return;
        done = true;
        es.close();
        if (notify === 'unsupported') handlers.onUnsupported?.(port);
        if (notify === 'disconnect') handlers.onDisconnect?.(port);
    };

    es.onopen = () => { retryCount = 0; };

    es.onmessage = (e) => {
        let data: WorkerBusEvent;
        try {
            data = JSON.parse(String(e.data)) as WorkerBusEvent;
        } catch {
            return; // malformed frame — ignore (P4-03 versioned schema policy)
        }
        const key = `${data.topic}:${data.event}`;
        if (key === 'message:new_message') handlers.onMessage?.(port, data);
        else if (key === 'agent:agent_done') handlers.onAgentDone?.(port, data);
        // unknown topic:event ignored on purpose (forward compat)
    };

    es.onerror = (err: unknown) => {
        const code = (err as { code?: number })?.code;
        // Spec-compliant clients fail permanently on non-2xx (readyState CLOSED).
        // 4xx ⇒ legacy worker without /api/events — mark unsupported, never retry.
        if (typeof code === 'number' && code >= 400 && code < 500) {
            finish('unsupported');
            return;
        }
        if (es.readyState === 2 /* CLOSED — no internal retry coming */) {
            finish('disconnect');
            return;
        }
        retryCount++;
        if (retryCount > MAX_TRANSIENT_RETRIES) finish('disconnect');
    };

    return () => finish(null);
}
