import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../../src/core/event-bus.ts';
import {
    startWorkerEventBridge, stopWorkerEventBridge, getCachedLatestMessage,
} from '../../src/manager/worker-events.ts';
import type { InstanceDiff } from '../../src/manager/instance-registry.ts';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    readyState = 0;
    closed = false;
    onopen: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(url: string) {
        this.url = url;
        FakeEventSource.instances.push(this);
    }
    close(): void { this.closed = true; this.readyState = 2; }
    emit(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function diff(d: InstanceDiff): void {
    publish('worker', 'instance-status-changed', { ...d } as unknown as Record<string, unknown>);
}

function makeFetch(latest: Record<string, unknown> | null) {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ ok: true, data: latest }) };
    };
    return { calls, fetchImpl };
}

function freshBridge(latest: Record<string, unknown> | null) {
    stopWorkerEventBridge();
    FakeEventSource.instances = [];
    const { calls, fetchImpl } = makeFetch(latest);
    startWorkerEventBridge({
        fetchImpl: fetchImpl as never,
        EventSourceImpl: FakeEventSource as never,
        debounceMs: 1,
    });
    return { calls };
}

test('appeared-online diff opens a worker SSE stream and hydrates the cache', async () => {
    const { calls } = freshBridge({ latestAssistant: { id: 7, text: 'hello' }, activity: null });
    diff({ port: 3457, change: 'appeared', next: { status: 'online', version: '2.2.0' } });
    assert.equal(FakeEventSource.instances.length, 1);
    assert.equal(FakeEventSource.instances[0]!.url, 'http://127.0.0.1:3457/api/events');
    await sleep(30);
    assert.equal(calls.length, 1, 'one hydration prefetch');
    const cached = getCachedLatestMessage(3457);
    assert.ok(cached && cached.latestAssistant?.id === 7);
    stopWorkerEventBridge();
});

test('message events debounce into a single prefetch; disappeared invalidates', async () => {
    const { calls } = freshBridge({ latestAssistant: { id: 9, text: 'x' }, activity: null });
    diff({ port: 3460, change: 'appeared', next: { status: 'online', version: '2.2.0' } });
    const es = FakeEventSource.instances[0]!;
    await sleep(30); // hydration
    es.emit({ topic: 'message', event: 'new_message' });
    es.emit({ topic: 'agent', event: 'agent_done' });
    es.emit({ topic: 'message', event: 'new_message' });
    await sleep(30);
    assert.equal(calls.length, 2, 'hydration + one debounced prefetch for three events');
    diff({ port: 3460, change: 'disappeared', prev: { status: 'online', version: '2.2.0' } });
    assert.equal(getCachedLatestMessage(3460), undefined, 'cache invalidated');
    assert.equal(es.closed, true);
    stopWorkerEventBridge();
});

test('unsupported worker is never re-subscribed until its version changes', async () => {
    freshBridge(null);
    diff({ port: 3458, change: 'appeared', next: { status: 'online', version: '2.1.3' } });
    const es = FakeEventSource.instances[0]!;
    es.onerror?.({ code: 404 }); // legacy worker — permanent mark
    assert.equal(es.closed, true);

    diff({ port: 3458, change: 'status', prev: { status: 'offline', version: '2.1.3' }, next: { status: 'online', version: '2.1.3' } });
    assert.equal(FakeEventSource.instances.length, 1, 'no retry bombardment against legacy worker');

    diff({ port: 3458, change: 'version', prev: { status: 'online', version: '2.1.3' }, next: { status: 'online', version: '2.2.0' } });
    assert.equal(FakeEventSource.instances.length, 2, 'version change clears the mark and resubscribes');
    stopWorkerEventBridge();
});

test('getCachedLatestMessage returns undefined without a live stream', async () => {
    freshBridge({ latestAssistant: { id: 1, text: 'y' }, activity: null });
    assert.equal(getCachedLatestMessage(3470), undefined);
    diff({ port: 3470, change: 'appeared', next: { status: 'online', version: '2.2.0' } });
    await sleep(30);
    assert.ok(getCachedLatestMessage(3470));
    diff({ port: 3470, change: 'status', prev: { status: 'online', version: '2.2.0' }, next: { status: 'offline', version: '2.2.0' } });
    assert.equal(getCachedLatestMessage(3470), undefined, 'offline drops the stream and cache');
    stopWorkerEventBridge();
});

test('stopWorkerEventBridge closes every stream and clears state', async () => {
    freshBridge(null);
    diff({ port: 3461, change: 'appeared', next: { status: 'online', version: '2.2.0' } });
    diff({ port: 3462, change: 'appeared', next: { status: 'online', version: '2.2.0' } });
    assert.equal(FakeEventSource.instances.length, 2);
    stopWorkerEventBridge();
    assert.ok(FakeEventSource.instances.every(i => i.closed));
    assert.equal(getCachedLatestMessage(3461), undefined);
});
