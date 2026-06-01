import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';
import { resetGoalStore, setGoal } from '../../src/goal/store.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const handlersSrc = readFileSync(join(__dirname, '../../src/cli/handlers-workflows.ts'), 'utf8');

async function runGoalCommand(command: string) {
    const parsed = parseCommand(command);
    return executeCommand(parsed, { interface: 'web', locale: 'en' });
}

function goalSubcommandBlock(subcommand: string): string {
    const marker = `if (sub === '${subcommand}')`;
    const start = handlersSrc.indexOf(marker);
    assert.notEqual(start, -1, `missing goal subcommand block: ${subcommand}`);
    const next = handlersSrc.indexOf('\n    if (sub === ', start + marker.length);
    return handlersSrc.slice(start, next === -1 ? handlersSrc.length : next);
}

test('/goal terminal commands bypass fireSteerForWebCli submitMessage path', () => {
    for (const subcommand of ['done', 'cancel', 'pause', 'clear']) {
        const block = goalSubcommandBlock(subcommand);
        assert.doesNotMatch(block, /fireSteerForWebCli/);
        assert.doesNotMatch(block, /steerPrompt/);
    }
});

test('/goal set and resume still use the steering path', () => {
    assert.match(goalSubcommandBlock('set'), /fireSteerForWebCli/);
    assert.match(goalSubcommandBlock('resume'), /fireSteerForWebCli/);
});

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
