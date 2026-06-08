import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getState, setState, resetState, resetAllStaleStates } from '../../src/orchestrator/state-machine.ts';
import { setOrcState } from '../../src/core/db.ts';

const serverSrc = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

afterEach(() => { resetState('default'); resetState('legacy:scope'); });

test('SOS-001: startup calls resetAllStaleStates (single-scope)', () => {
    assert.ok(serverSrc.includes('resetAllStaleStates()'),
        'server must call resetAllStaleStates on startup');
    assert.ok(serverSrc.includes("import { getState, resetAllStaleStates }"),
        'server must import resetAllStaleStates');
});

test('SOS-002: snapshot endpoint includes scope', () => {
    const orchestrateSrc = readFileSync(new URL('../../src/routes/orchestrate.ts', import.meta.url), 'utf8');
    const snapStart = orchestrateSrc.indexOf("app.get('/api/orchestrate/snapshot'");
    assert.ok(snapStart >= 0, 'snapshot route should exist');
    const snapBlock = orchestrateSrc.slice(snapStart, snapStart + 3000);
    assert.ok(/orc:\s*\{[\s\S]*?\bscope\b/.test(snapBlock), 'snapshot orc object should include scope field');
    assert.ok(snapBlock.includes('state: getState(scope)'), 'snapshot should include state from getState(scope)');
});

test('SOS-003: WebSocket initial state includes scope', () => {
    assert.ok(serverSrc.includes("scope: webScope, ts: Date.now()"), 'WS initial orc_state should include scope');
});

test('SOS-004: resetAllStaleStates preserves recent states and resets stale ones', () => {
    setState('P', {
        originalPrompt: 'fresh task', workingDir: null, scopeId: 'default',
        plan: null, workerResults: [], origin: 'web',
    }, 'default');
    assert.equal(getState('default'), 'P');

    resetAllStaleStates();
    assert.equal(getState('default'), 'P', 'fresh state (<24h) must be preserved');

    // Backdate the row to simulate a stale session (>24h old)
    const db = (setOrcState as unknown as { database: import('better-sqlite3').Database }).database;
    db.prepare("UPDATE orc_state SET updated_at = datetime('now', '-25 hours') WHERE id = 'default'").run();

    resetAllStaleStates();
    assert.equal(getState('default'), 'IDLE', 'stale state (>24h) must be reset');
});

test('SOS-005: resetAllStaleStates prunes non-default scope rows', () => {
    setState('A', {
        originalPrompt: 'legacy', workingDir: '/tmp', scopeId: 'legacy:scope',
        plan: null, workerResults: [], origin: 'web',
    }, 'legacy:scope');
    assert.equal(getState('legacy:scope'), 'A');

    resetAllStaleStates();
    assert.equal(getState('legacy:scope'), 'IDLE');
});
