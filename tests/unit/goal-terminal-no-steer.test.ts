import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';
import { resetGoalStore, setGoal } from '../../src/goal/store.ts';

async function runGoalCommand(command: string) {
    const parsed = parseCommand(command);
    return executeCommand(parsed, { interface: 'web', locale: 'en' });
}

test('/goal done does not return a steerPrompt or spawn continuation text', async () => {
    resetGoalStore();
    try {
        setGoal('terminal done contract');
        const result = await runGoalCommand('/goal done final note');
        assert.equal(result?.ok, true);
        assert.equal('steerPrompt' in result, false);
        assert.match(result?.text ?? '', /Goal completed/);
    } finally {
        resetGoalStore();
    }
});

test('/goal pause does not return a steerPrompt or spawn continuation text', async () => {
    resetGoalStore();
    try {
        setGoal('terminal pause contract');
        const result = await runGoalCommand('/goal pause');
        assert.equal(result?.ok, true);
        assert.equal('steerPrompt' in result, false);
        assert.match(result?.text ?? '', /Goal paused/);
    } finally {
        resetGoalStore();
    }
});

test('/goal cancel does not return a steerPrompt or spawn continuation text', async () => {
    resetGoalStore();
    try {
        setGoal('terminal cancel contract');
        const result = await runGoalCommand('/goal cancel no longer needed');
        assert.equal(result?.ok, true);
        assert.equal('steerPrompt' in result, false);
        assert.match(result?.text ?? '', /Goal cancelled/);
    } finally {
        resetGoalStore();
    }
});

test('/goal clear remains a quiet terminal state command', async () => {
    resetGoalStore();
    try {
        setGoal('terminal clear contract');
        const result = await runGoalCommand('/goal clear');
        assert.equal(result?.ok, true);
        assert.equal('steerPrompt' in result, false);
        assert.match(result?.text ?? '', /Active goal cleared/);
    } finally {
        resetGoalStore();
    }
});
