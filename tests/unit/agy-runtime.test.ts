import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    extractAgyConversationId,
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

test('AGY-RT-003: extracts exact native AGY conversation ids from resume hints', () => {
    assert.equal(
        extractAgyConversationId('Resume with: agy --conversation=6f9d4d6b-d0ee-4bfd-adb7-6cc2a74a10c2'),
        '6f9d4d6b-d0ee-4bfd-adb7-6cc2a74a10c2',
    );
    assert.equal(
        extractAgyConversationId('Resume: agy --conversation 6F9D4D6B-D0EE-4BFD-ADB7-6CC2A74A10C2 (or -c)'),
        '6F9D4D6B-D0EE-4BFD-ADB7-6CC2A74A10C2',
    );
    assert.equal(
        extractAgyConversationId('I0521 printmode.go:130] Print mode: conversation=e001ab02-a833-413e-9e8c-6deef90330c1, sending message'),
        'e001ab02-a833-413e-9e8c-6deef90330c1',
    );
    assert.equal(
        extractAgyConversationId('I0521 server.go:747] Created conversation e001ab02-a833-413e-9e8c-6deef90330c1'),
        'e001ab02-a833-413e-9e8c-6deef90330c1',
    );
    assert.equal(extractAgyConversationId('Resume: agy -c'), null);
});

test('AGY-RT-004: AGY timeout stdout is routed to lifecycle as an error', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /isAgyTimeoutOutput\(ctx\.fullText\)/);
    assert.match(spawnSrc, /effectiveExitCode\s*=\s*agyTimedOut\s*\?\s*124\s*:\s*code/);
    assert.match(spawnSrc, /ctx\.stderrBuf\s*=/);
    assert.match(spawnSrc, /ctx\.fullText\s*=\s*''/);
    assert.match(spawnSrc, /detectSmokeResponse\(ctx\.fullText,\s*ctx\.toolLog,\s*effectiveExitCode,\s*cli\)/);
    assert.match(spawnSrc, /handleAgentExit\(\{[\s\S]*code:\s*effectiveExitCode/);
});

test('AGY-RT-005: AGY stdout conversation id is persisted for native resume', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /extractAgyConversationId\(ctx\.fullText\)/);
    assert.match(spawnSrc, /if\s*\(!ctx\.sessionId\)\s*ctx\.sessionId\s*=\s*extractAgyConversationId\(ctx\.fullText\)/);
});

test('AGY-RT-006: AGY print-mode log file is used when stdout omits resume hints', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    const argsSrc = readFileSync(join(__dirname, '../../src/agent/args.ts'), 'utf8');
    assert.match(spawnSrc, /agyLogFile/);
    assert.match(argsSrc, /'--log-file'/);
    assert.match(spawnSrc, /fs\.readFileSync\(agyLogFile,\s*'utf8'\)/);
    assert.match(spawnSrc, /fs\.rmSync\(agyLogFile,\s*\{\s*force:\s*true\s*\}\)/);
});

test('AGY-RT-007: AGY stdout strips ANSI before persistence and trace append', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /rawText\s*=\s*agyUtf8!\.write\(chunk\)/);
    assert.match(spawnSrc, /rawText\.replace\(\/\\x1B/);
    assert.match(spawnSrc, /ctx\.fullText\s*\+=\s*text/);
    assert.match(spawnSrc, /appendTraceEvent\(\{[\s\S]*raw:\s*text/);
});
