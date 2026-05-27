import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getActiveGoal, getGoalHistory, setGoal, updateGoal,
    completeGoal, cancelGoal, pauseGoal, resumeGoal,
    clearGoal, resetGoalStore,
} from '../../src/goal/store.ts';

beforeEach(() => { resetGoalStore(); });

describe('Goal Store', () => {
    test('1. no active goal initially', () => {
        assert.equal(getActiveGoal(), null);
    });

    test('2. setGoal creates active goal', () => {
        const goal = setGoal('Build auth system');
        assert.equal(goal.status, 'active');
        assert.equal(goal.objective, 'Build auth system');
        assert.ok(goal.id.length > 0);
    });

    test('3. getActiveGoal returns persisted goal', () => {
        setGoal('Test persistence');
        const goal = getActiveGoal();
        assert.ok(goal);
        assert.equal(goal!.objective, 'Test persistence');
    });

    test('4. updateGoal adds checkpoint', () => {
        setGoal('Checkpoint test');
        const updated = updateGoal('Phase 1 done', 'Start Phase 2');
        assert.ok(updated);
        assert.equal(updated!.checkpoints.length, 1);
        assert.equal(updated!.lastCheckpoint!.summary, 'Phase 1 done');
        assert.equal(updated!.lastCheckpoint!.nextAction, 'Start Phase 2');
    });

    test('5. updateGoal fails with no active goal', () => {
        assert.equal(updateGoal('orphan'), null);
    });

    test('6. completeGoal moves to history', () => {
        setGoal('Complete me');
        const completed = completeGoal('All done');
        assert.ok(completed);
        assert.equal(completed!.status, 'complete');
        assert.equal(completed!.completionNote, 'All done');
        assert.equal(getActiveGoal(), null);
        assert.equal(getGoalHistory().goals.length, 1);
    });

    test('7. cancelGoal moves to history', () => {
        setGoal('Cancel me');
        const cancelled = cancelGoal('Changed plans');
        assert.ok(cancelled);
        assert.equal(cancelled!.status, 'cancelled');
        assert.equal(getActiveGoal(), null);
        assert.equal(getGoalHistory().goals.length, 1);
    });

    test('8. pauseGoal and resumeGoal cycle', () => {
        setGoal('Pause test');
        const paused = pauseGoal();
        assert.ok(paused);
        assert.equal(paused!.status, 'paused');
        assert.equal(getActiveGoal()!.status, 'paused');

        const resumed = resumeGoal();
        assert.ok(resumed);
        assert.equal(resumed!.status, 'active');
    });

    test('9. pauseGoal fails with no active goal', () => {
        assert.equal(pauseGoal(), null);
    });

    test('10. resumeGoal fails with non-paused goal', () => {
        setGoal('Not paused');
        assert.equal(resumeGoal(), null);
    });

    test('11. clearGoal archives and removes active', () => {
        setGoal('Clear me');
        assert.ok(clearGoal());
        assert.equal(getActiveGoal(), null);
        assert.equal(getGoalHistory().goals.length, 1);
    });

    test('12. clearGoal returns false with no goal', () => {
        assert.equal(clearGoal(), false);
    });

    test('13. resetGoalStore clears everything', () => {
        setGoal('Will be reset');
        completeGoal();
        setGoal('Another goal');
        resetGoalStore();
        assert.equal(getActiveGoal(), null);
        assert.equal(getGoalHistory().goals.length, 0);
    });

    test('14. setGoal rejects when active goal exists without replace', () => {
        setGoal('First goal');
        assert.throws(() => setGoal('Second goal'), /Active goal already exists/);
        assert.equal(getActiveGoal()!.objective, 'First goal');
    });

    test('14b. setGoal with replace archives existing active goal', () => {
        setGoal('First goal');
        setGoal('Second goal', { replace: true });
        assert.equal(getActiveGoal()!.objective, 'Second goal');
        assert.equal(getGoalHistory().goals.length, 1);
        assert.equal(getGoalHistory().goals[0]!.objective, 'First goal');
    });

    test('15. setGoal with repoRoot', () => {
        const goal = setGoal('With repo', { repoRoot: '/some/path' });
        assert.equal(goal.repoRoot, '/some/path');
    });

    test('16. history limit capped at 50', () => {
        for (let i = 0; i < 55; i++) {
            setGoal(`Goal ${i}`);
            completeGoal();
        }
        assert.equal(getGoalHistory().goals.length, 50);
    });
});
