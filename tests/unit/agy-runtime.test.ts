import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    formatAgyTimeoutMessage,
    isAgyTimeoutOutput,
} from '../../src/agent/agy-runtime.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('AGY-RT-001: detects AGY timeout text even when exit code is zero', () => {
    assert.equal(isAgyTimeoutOutput('Error: timed out waiting for response\n'), true);
    assert.equal(isAgyTimeoutOutput('\nError: timed out waiting for response'), true);
    assert.equal(isAgyTimeoutOutput('normal answer'), false);
});

test('AGY-RT-002: formats empty timeout output defensively', () => {
    assert.equal(formatAgyTimeoutMessage(''), 'Error: timed out waiting for response');
    assert.equal(
        formatAgyTimeoutMessage(' Error: timed out waiting for response '),
        'Error: timed out waiting for response',
    );
});

test('AGY-RT-003: AGY timeout stdout is routed to lifecycle as an error', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /isAgyTimeoutOutput\(ctx\.fullText\)/);
    assert.match(spawnSrc, /effectiveExitCode\s*=\s*agyTimedOut\s*\?\s*124\s*:\s*code/);
    assert.match(spawnSrc, /ctx\.stderrBuf\s*=/);
    assert.match(spawnSrc, /ctx\.fullText\s*=\s*''/);
    assert.match(spawnSrc, /detectSmokeResponse\(ctx\.fullText,\s*ctx\.toolLog,\s*effectiveExitCode,\s*cli\)/);
    assert.match(spawnSrc, /handleAgentExit\(\{[\s\S]*code:\s*effectiveExitCode/);
});
