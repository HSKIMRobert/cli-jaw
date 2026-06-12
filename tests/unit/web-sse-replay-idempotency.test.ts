// ── SSE replay idempotency contracts (devlog 260612 manager_stream_hidden_state_audit 06-08) ──
// Root cause being guarded: SSE reconnect replays (event-channel ?lastEventId=
// → routes/events replaySince) were applied by the web dispatcher as if live.
// A replayed agent_done from a FINISHED turn ran finalizeAgent() mid-turn —
// freezing the in-flight live block as a collapsed VS item — and the replayed
// agent_output/agent_tool stream rebuilt the same turn into a second block
// (duplicate-block screenshot, instance 3466, 2026-06-12 11:04).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wsSrc = readFileSync(join(__dirname, '../../public/js/ws.ts'), 'utf8');
const lifecycleSrc = readFileSync(join(__dirname, '../../src/agent/lifecycle-handler.ts'), 'utf8');
const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
const claudeEventsSrc = readFileSync(join(__dirname, '../../src/agent/events/claude.ts'), 'utf8');

// ─── Server: run identity + cumulative cursor ride on the agent stream ───

test('RID-001: every lifecycle agent_done broadcast carries the owning trace run id', () => {
    const doneSites = lifecycleSrc.match(/broadcast\('agent_done', \{/g) || [];
    const taggedSites = lifecycleSrc.match(/broadcast\('agent_done', \{ \.\.\.runTag\(ctx\),/g) || [];
    assert.ok(doneSites.length > 0, 'lifecycle-handler should broadcast agent_done');
    assert.equal(taggedSites.length, doneSites.length,
        `all ${doneSites.length} agent_done broadcasts must spread runTag(ctx) — found ${taggedSites.length}`);
});

test('RID-002: agent_output flows through the single broadcastAgentOutput choke point with traceRunId + textLen', () => {
    assert.ok(spawnSrc.includes('function broadcastAgentOutput('), 'spawn.ts should own the agent_output choke point');
    assert.ok(spawnSrc.includes("...(ctx.traceRunId ? { traceRunId: ctx.traceRunId } : {})"), 'agent_output should carry the run id');
    assert.ok(spawnSrc.includes('...(textLen !== null ? { textLen } : {})'), 'agent_output should carry the cumulative text cursor');
    const inlineOutputs = (spawnSrc.match(/broadcast\('agent_output'/g) || []).length;
    assert.equal(inlineOutputs, 1, 'only broadcastAgentOutput may emit agent_output directly');
});

test('RID-003: live-run accumulation has a single owner (claude events must not double-append)', () => {
    assert.ok(!claudeEventsSrc.includes('appendLiveRunText'),
        'events/claude.ts must not append to the live run — broadcastAgentOutput owns it (07 F-T4 double-snapshot-text)');
});

test('RID-004: live run snapshot exposes traceRunId for client cursor sync', () => {
    const liveRunSrc = readFileSync(join(__dirname, '../../src/agent/live-run-state.ts'), 'utf8');
    assert.ok(liveRunSrc.includes('traceRunId?: string'), 'LiveRunEntry should carry traceRunId');
    assert.ok(liveRunSrc.includes('export function setLiveRunTraceId'), 'trace id binds after startTraceRun');
    assert.match(liveRunSrc, /appendLiveRunText\(scope: string, text: string\): number \| null/,
        'appendLiveRunText should return the cumulative cursor');
    assert.ok(spawnSrc.includes('setLiveRunTraceId(liveScope, traceRunId)'), 'spawn paths must bind the trace id to the live run');
});

// ─── Client: replayed events must not corrupt the in-flight turn ───

test('RID-005: stale agent_done (different run id) is dropped instead of finalizing the in-flight turn', () => {
    const doneBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'agent_done'"), wsSrc.indexOf("msg.type === 'orchestrate_done'"));
    assert.ok(doneBlock.includes('if (isFinalizedRun(doneRunId)) return'), 'replayed done of a finished turn must be dropped');
    assert.ok(doneBlock.includes('doneRunId !== liveTraceRunId) return'), 'a done from a different run than the live stream must be dropped');
    assert.ok(doneBlock.includes('markRunFinalized(doneRunId)'), 'finalizing must record the run for replay suppression');
});

test('RID-006: replayed agent_output chunks dedupe on the cumulative textLen cursor', () => {
    const outBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'agent_output'"), wsSrc.indexOf("msg.type === 'agent_retry'"));
    assert.ok(outBlock.includes('if (isFinalizedRun(outputRunId)) return'), 'chunks of finalized runs must be dropped');
    assert.ok(outBlock.includes('msg.textLen <= liveAppliedTextLen) return'), 'chunks at/below the applied cursor must be dropped');
    assert.ok(outBlock.includes('outputText.slice(-missing)'), 'partial overlaps must append only the unseen tail');
});

test('RID-007: replayed agent_tool events of finalized runs are dropped', () => {
    const toolBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'agent_tool'"), wsSrc.indexOf("msg.type === 'agent_output'"));
    assert.ok(toolBlock.includes('if (isFinalizedRun(toolRunId)) return'), 'steps of finalized runs must not rebuild a second process block');
});

test('RID-008: replayed same-run agent_tool events already covered by snapshot hydration are dropped', () => {
    const toolBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'agent_tool'"), wsSrc.indexOf("msg.type === 'agent_output'"));
    assert.ok(wsSrc.includes('const liveAppliedToolSeqByRun = new Map'), 'tool replay guard should track applied traceSeq by run');
    assert.ok(wsSrc.includes('function shouldDropReplayedTool('), 'tool replay guard helper should exist');
    assert.ok(toolBlock.includes('const toolSeq = positiveSeq(msg.traceSeq)'), 'agent_tool should normalize traceSeq');
    assert.ok(toolBlock.includes('shouldDropReplayedTool(toolRunId, toolSeq, msg.sseReplay === true)'), 'only SSE replayed tool events at/below cursor should be dropped');
    assert.ok(toolBlock.indexOf('shouldDropReplayedTool(') < toolBlock.indexOf('showProcessStep({'),
        'replayed hydrated tools must be dropped before rendering');
    assert.ok(toolBlock.includes('rememberAppliedToolSeq(toolRunId, toolSeq)'), 'accepted tool events should advance the cursor for later replay suppression');
});

test('RID-009: snapshot hydration moves the replay cursors to the hydrated state', () => {
    assert.ok(wsSrc.includes('function syncLiveRunCursor('), 'cursor sync helper should exist');
    assert.ok(wsSrc.includes('syncLiveRunCursor(snap.activeRun)'), 'hydrateRun snapshots must sync the cursors');
    assert.ok(wsSrc.includes("liveAppliedTextLen = (activeRun.text || '').length"), 'cursor must align with the hydrated cumulative text');
    assert.ok(wsSrc.includes('rememberAppliedToolSeq(activeRun.traceRunId || null, maxAppliedToolSeq(activeRun))'),
        'cursor must align with hydrated tool traceSeq state');
});

test('RID-010: steer and orchestrate_done retire the live run from replay', () => {
    const steerBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'steer_started'"), wsSrc.indexOf("msg.type === 'new_message'"));
    assert.ok(steerBlock.includes('markRunFinalized(null)'), 'steer must retire the killed run');
    const orchBlock = wsSrc.slice(wsSrc.indexOf("msg.type === 'orchestrate_done'"), wsSrc.indexOf("msg.type === 'clear'"));
    assert.ok(orchBlock.includes('markRunFinalized(null)'), 'orchestrate_done must retire the live run');
});

// ─── Behavior: live-run-state cursor semantics ───

test('RID-011: appendLiveRunText returns the cumulative cursor and setLiveRunTraceId rides the snapshot', async () => {
    const { beginLiveRun, appendLiveRunText, setLiveRunTraceId, getLiveRun, clearLiveRun } =
        await import('../../src/agent/live-run-state.ts');
    const scope = 'unit-replay-meta';
    try {
        assert.equal(appendLiveRunText(scope, 'before-begin'), null, 'no live run → null cursor');
        beginLiveRun(scope, 'claude-e');
        setLiveRunTraceId(scope, 'tr_unit_replay');
        assert.equal(appendLiveRunText(scope, 'hello '), 6);
        assert.equal(appendLiveRunText(scope, 'world'), 11, 'cursor accumulates across chunks');
        const snap = getLiveRun(scope);
        assert.equal(snap.traceRunId, 'tr_unit_replay', 'snapshot exposes the owning run id');
        assert.equal(snap.text, 'hello world');
    } finally {
        clearLiveRun(scope);
    }
});
