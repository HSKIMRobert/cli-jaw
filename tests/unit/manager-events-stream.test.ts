// #233 — manager SSE relay + frontend stream hook contracts.
// The relay route lives inline in src/manager/server.ts (same pattern as
// /api/manager/events), so this suite pins the wiring statically, the same
// way web-refresh-state-recovery.test.ts pins public/js/ws.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const serverSrc = readFileSync(join(root, 'src/manager/server.ts'), 'utf8');
const hookSrc = readFileSync(join(root, 'public/manager/src/hooks/useManagerEventStream.ts'), 'utf8');
const appSrc = readFileSync(join(root, 'public/manager/src/App.tsx'), 'utf8');

test('MES-001: relay route exists with SSE headers', () => {
    const idx = serverSrc.indexOf("app.get('/api/manager/events/stream'");
    assert.ok(idx > 0, 'stream route must be registered');
    const block = serverSrc.slice(idx, idx + 1200);
    assert.ok(block.includes("'Content-Type', 'text/event-stream'"), 'must set SSE content type');
    assert.ok(block.includes("'Cache-Control', 'no-cache'"), 'must disable caching');
});

test('MES-002: relay forwards only worker_settings_change and cleans up on close', () => {
    const idx = serverSrc.indexOf("app.get('/api/manager/events/stream'");
    const block = serverSrc.slice(idx, idx + 1200);
    assert.ok(block.includes("entry.event !== 'worker_settings_change'"), 'must filter to worker_settings_change');
    assert.ok(block.includes("entry.topic !== 'worker'"), 'must filter to worker topic');
    assert.ok(block.includes("req.on('close'"), 'must handle client disconnect');
    assert.ok(block.includes('unsubscribe()'), 'must unsubscribe from the bus on close');
    assert.ok(block.includes('clearInterval(ping)'), 'must clear the keepalive ping on close');
});

test('MES-003: hook subscribes to the stream and guards the payload', () => {
    assert.ok(hookSrc.includes("new EventSource('/api/manager/events/stream')"), 'hook must open the relay stream');
    assert.ok(hookSrc.includes('document.hidden'), 'hook must avoid open streams while hidden');
    assert.ok(hookSrc.includes("addEventListener('visibilitychange'"), 'hook must listen for visibility changes');
    assert.ok(hookSrc.includes("removeEventListener('visibilitychange'"), 'hook must remove visibility listener on unmount');
    assert.ok(hookSrc.includes("frame.event !== 'worker_settings_change'"), 'hook must filter events');
    assert.ok(hookSrc.includes('Number.isInteger(port)'), 'hook must validate the port');
    assert.ok(hookSrc.includes('source?.close()'), 'hook must close the stream on hidden/unmount');
});

test('MES-004: App wires the stream to refreshInstance + invalidation', () => {
    assert.ok(appSrc.includes('useManagerEventStream((port)'), 'App must consume the hook');
    const idx = appSrc.indexOf('useManagerEventStream((port)');
    const block = appSrc.slice(idx, idx + 400);
    assert.ok(block.includes('refreshInstance(port)'), 'must refresh the changed instance row');
    assert.ok(block.includes("topics: ['instances']"), 'must publish an instances invalidation');
});
