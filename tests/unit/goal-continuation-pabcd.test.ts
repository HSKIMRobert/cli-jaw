import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalContinuation } from '../../src/goal/heartbeat.ts';
import { setGoal, resetGoalStore } from '../../src/goal/store.ts';
import { setState, resetState } from '../../src/orchestrator/state-machine.ts';
import { claimWorker, finishWorker, clearAllWorkers } from '../../src/orchestrator/worker-registry.ts';

function cleanup(): void {
    clearAllWorkers();
    resetState('default');
    resetGoalStore();
}

// Regression for the goal-continuation stall during PABCD:
// commit 73a328a8 removed the `orcState !== 'IDLE'` block but the pending_replay
// gate still suppressed turn-end continuation during PABCD A/B (which always
// dispatch employees), and the heartbeat safety net is deferred during PABCD —
// so the goal could not auto-resume mid-orchestration.

test('goal continues during PABCD even with a pending worker replay', () => {
    cleanup();
    try {
        setGoal('regression: implement everything via pabcd');
        setState('B'); // active orchestration cycle
        const emp = { id: 'emp-cont-1', name: 'Backend' };
        claimWorker(emp, 'audit the plan');
        finishWorker(emp.id, 'PASS'); // → pendingReplay = true (async-cleared on dispatch finish)
        const res = buildGoalContinuation();
        assert.equal(res.shouldContinue, true, `expected continue during PABCD; got reason=${res.reason}`);
        assert.equal(res.reason, 'goal_active');
        assert.match(res.prompt ?? '', /PABCD state: B/);
    } finally {
        cleanup();
    }
});

test('pending worker replay still blocks continuation when NOT in PABCD (IDLE)', () => {
    cleanup();
    try {
        setGoal('regression idle pending replay');
        resetState('default'); // IDLE
        const emp = { id: 'emp-cont-2', name: 'Backend' };
        claimWorker(emp, 'some task');
        finishWorker(emp.id, 'done'); // pendingReplay = true
        const res = buildGoalContinuation();
        assert.equal(res.shouldContinue, false);
        assert.equal(res.reason, 'pending_replay');
    } finally {
        cleanup();
    }
});

test('a genuinely running worker still blocks continuation during PABCD', () => {
    cleanup();
    try {
        setGoal('regression running worker');
        setState('B');
        claimWorker({ id: 'emp-cont-3', name: 'Backend' }, 'long-running task'); // running, never finished
        const res = buildGoalContinuation();
        assert.equal(res.shouldContinue, false);
        assert.equal(res.reason, 'workers_busy');
    } finally {
        cleanup();
    }
});

test('goal continuation prompt uses cli-jaw goal pause instead of inducing done', () => {
    cleanup();
    try {
        setGoal('contract: pause instead of done');
        const res = buildGoalContinuation();
        assert.equal(res.shouldContinue, true);
        assert.match(res.prompt ?? '', /built-in\/runtime goal feature/);
        assert.match(res.prompt ?? '', /Use only `cli-jaw goal \.\.\.`/);
        assert.match(res.prompt ?? '', /cli-jaw goal pause/);
        assert.match(res.prompt ?? '', /explicit user-requested final completion/);
        assert.doesNotMatch(res.prompt ?? '', /\/goal done/);
        assert.doesNotMatch(res.prompt ?? '', /cli-jaw goal done/);
    } finally {
        cleanup();
    }
});

test('goal continuation prompt requires executing PABCD transition commands through D', () => {
    cleanup();
    try {
        setGoal('contract: execute pabcd transition commands');
        setState('C');
        const res = buildGoalContinuation();
        assert.equal(res.shouldContinue, true);
        assert.match(res.prompt ?? '', /Phase-transition commands are mandatory actions/);
        assert.match(res.prompt ?? '', /Run the exact `cli-jaw orchestrate \.\.\.` command/);
        assert.match(res.prompt ?? '', /C passed → `cli-jaw orchestrate D` immediately/);
        assert.match(res.prompt ?? '', /do NOT only say "run D"/);
    } finally {
        cleanup();
    }
});
