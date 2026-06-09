import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    AGY_COMPLETE_KILL_REASON,
    AGY_PRINT_QUIET_COMPLETION_MS,
    extractAgyConversationId,
    formatAgyTimeoutMessage,
    getAgyQuietCompletionDelayMs,
    hasRunningAgyTranscriptTool,
    isAgyInterimProgressOutput,
    isAgyTimeoutOutput,
    shouldCompleteAgyPrintRun,
    stripAgyResumeReplayPrefix,
    stripAgyResumeReplayPrefixes,
    stripAgyTrailingTimeoutOutput,
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
    assert.match(spawnSrc, /effectiveExitCode\s*=\s*agyCompletedByQuietOutput\s*\?\s*0\s*:\s*agyTimedOut\s*\?\s*124\s*:\s*ctx\.stallReason\s*\?\s*124\s*:\s*code/);
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

test('AGY-RT-008: AGY print timeout is a hard cap while cli-jaw watchdog owns progress timeout', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    const timeoutBlock = spawnSrc.slice(
        spawnSrc.indexOf("const rawTimeoutCfg = (settings as Record<string, unknown>)['agentTimeout'];"),
        spawnSrc.indexOf('const argOptions = {'),
    );
    const watchdogBlock = spawnSrc.slice(
        spawnSrc.indexOf('const rawAgentTimeoutCfg = (settings as Record<string, unknown>)["agentTimeout"];'),
        spawnSrc.indexOf('const stallWatchdog = attachWatchdog'),
    );

    assert.match(timeoutBlock, /absoluteHardCapMs/);
    assert.match(timeoutBlock, /DEFAULT_WATCHDOG_ABSOLUTE_HARD_CAP_MS/);
    assert.match(timeoutBlock, /formatAgyPrintTimeout\(resolvedAgyPrintTimeoutMs\)/);
    assert.doesNotMatch(timeoutBlock, /absoluteMs[\s\S]*formatAgyPrintTimeout/);
    assert.match(watchdogBlock, /absoluteHardCapMs/);
    assert.match(spawnSrc, /startAgyTranscriptWatcher\(\{[\s\S]*ctx,/);
});

test('AGY-RT-009: AGY print runs can finish after quiet assistant output', () => {
    assert.equal(shouldCompleteAgyPrintRun({
        outputTextStarted: true,
        liveOutputText: 'done',
        fullText: 'done',
        toolLog: [],
    }), true);
    assert.equal(shouldCompleteAgyPrintRun({
        outputTextStarted: true,
        liveOutputText: 'done',
        fullText: 'done',
        toolLog: [{ icon: '🔧', label: 'cmd', toolType: 'tool', stepRef: 'agy:transcript:1:RUN_COMMAND', status: 'running' }],
    }), false);
    assert.equal(hasRunningAgyTranscriptTool([
        { stepRef: 'agy:transcript:1:RUN_COMMAND', status: 'done' },
    ]), false);
    assert.equal(shouldCompleteAgyPrintRun({
        outputTextStarted: true,
        liveOutputText: 'Error: timed out waiting for response',
        fullText: 'Error: timed out waiting for response',
        toolLog: [],
    }), false);
});

test('AGY-RT-010: AGY quiet completion is mapped to lifecycle success, not interruption', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, new RegExp(`stdKillReason === ['"]${AGY_COMPLETE_KILL_REASON}['"]|stdKillReason === AGY_COMPLETE_KILL_REASON`));
    assert.match(spawnSrc, /wasKilled\s*=\s*!!stdKillReason\s*&&\s*!agyCompletedByQuietOutput/);
    assert.match(spawnSrc, /effectiveExitCode\s*=\s*agyCompletedByQuietOutput\s*\?\s*0\s*:/);
    assert.match(spawnSrc, /getAgyQuietCompletionDelayMs\(ctx\)/);
});

test('AGY-RT-011: AGY timeout suffix is stripped without masking timeout-only output', () => {
    assert.deepEqual(
        stripAgyTrailingTimeoutOutput('JAW_AGY_DONE\nError: timed out waiting for response\n'),
        { text: 'JAW_AGY_DONE', stripped: true },
    );
    assert.deepEqual(
        stripAgyTrailingTimeoutOutput('Error: timed out waiting for response\n'),
        { text: 'Error: timed out waiting for response\n', stripped: false },
    );
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /stripAgyTrailingTimeoutOutput\(ctx\.fullText\)/);
});

test('AGY-RT-012: AGY resume does not trim current stdout by prior output length', () => {
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    const start = spawnSrc.indexOf('Length-based replay trimming can therefore swallow the whole new answer.');
    const end = spawnSrc.indexOf('const ctx: SpawnContext =', start);
    const resumeOffsetBlock = start >= 0 && end > start ? spawnSrc.slice(start, end) : '';
    assert.match(resumeOffsetBlock, /const agyResumeOffset = 0/);
    assert.doesNotMatch(resumeOffsetBlock, /bucketRow\?\.output_len|employeeOutputLen/);
});

test('AGY-RT-013: AGY resume replay prefix is stripped only when new output remains', () => {
    assert.deepEqual(
        stripAgyResumeReplayPrefix('OLD_ANSWER\nNEW_ANSWER', 'OLD_ANSWER'),
        { text: 'NEW_ANSWER', stripped: true },
    );
    assert.deepEqual(
        stripAgyResumeReplayPrefix('OLD_ANSWER', 'OLD_ANSWER'),
        { text: 'OLD_ANSWER', stripped: false },
    );
    assert.deepEqual(
        stripAgyResumeReplayPrefix('NEW_ANSWER', 'OLD_ANSWER'),
        { text: 'NEW_ANSWER', stripped: false },
    );
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /getLatestAssistantContentForAgyResume/);
    assert.match(spawnSrc, /stripAgyResumeReplayPrefix\(ctx\.fullText,\s*agyResumeReplayPrefix\)/);
});

test('AGY-RT-013b: AGY resume strips multi-turn replay before live quiet completion', () => {
    assert.deepEqual(
        stripAgyResumeReplayPrefixes('OLD_0\nOLD_1\nNEW_2', ['OLD_1', 'OLD_0']),
        { text: 'NEW_2', stripped: true, replayOnly: false },
    );
    assert.deepEqual(
        stripAgyResumeReplayPrefixes('OLD_0\nOLD_1', ['OLD_1', 'OLD_0']),
        { text: '', stripped: true, replayOnly: true },
    );
    assert.deepEqual(
        stripAgyResumeReplayPrefixes('NEW_2', ['OLD_1', 'OLD_0']),
        { text: 'NEW_2', stripped: false, replayOnly: false },
    );
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /getRecentAssistantContentsForAgyResume/);
    assert.match(spawnSrc, /stripAgyResumeReplayPrefixes\(ctx\.fullText,\s*agyResumeReplayPrefixes\)/);
    assert.match(spawnSrc, /ctx\.liveOutputText\s*=\s*displayFullText/);
    assert.match(spawnSrc, /ctx\.outputTextStarted\s*=\s*Boolean\(displayFullText\.trim\(\)\)/);
});

test('AGY-RT-014: AGY interim progress output does not trigger quiet completion', () => {
    const englishProgress = 'I will search the git log to identify recent changes related to AGY completion hardening.';
    const koreanProgress = 'Neo-Brutalism 웹 목업을 세부페이지 에셋 포함해서 만들게요! 먼저 이미지 서버 상태 확인하고 에셋 생성부터 시작합니다.';
    const multilineProgress = [
        'I need to search the related commits to understand the completion hardening changes.',
        'I will examine the git commits one by one to extract exact details of the completion hardening. First, checking `85c7344b`, `48455201`, `f1cda491`, `ea6c5a87`.',
    ].join('\n');
    assert.equal(isAgyInterimProgressOutput(englishProgress), true);
    assert.equal(isAgyInterimProgressOutput(koreanProgress), true);
    assert.equal(isAgyInterimProgressOutput(multilineProgress), true);
    assert.equal(getAgyQuietCompletionDelayMs({
        outputTextStarted: true,
        liveOutputText: englishProgress,
        fullText: englishProgress,
        toolLog: [],
    }), null);
    assert.equal(getAgyQuietCompletionDelayMs({
        outputTextStarted: true,
        liveOutputText: '최종 답변입니다.\nFINAL_SENTINEL',
        fullText: '최종 답변입니다.\nFINAL_SENTINEL',
        toolLog: [],
    }), AGY_PRINT_QUIET_COMPLETION_MS);
    assert.equal(getAgyQuietCompletionDelayMs({
        outputTextStarted: true,
        liveOutputText: englishProgress,
        fullText: englishProgress,
        toolLog: [{ icon: '🔧', label: 'cmd', toolType: 'tool', stepRef: 'agy:transcript:1:RUN_COMMAND', status: 'running' }],
    }), null);
    const spawnSrc = readFileSync(join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /getAgyQuietCompletionDelayMs\(ctx\)/);
});
