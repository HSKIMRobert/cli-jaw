import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { classifyExitError } from '../../src/agent/error-classifier.ts';
import { handleAgentExit } from '../../src/agent/lifecycle-handler.ts';
import { shouldPersistMainSession } from '../../src/agent/session-persistence.ts';
import { addBroadcastListener, clearAllBroadcastListeners } from '../../src/core/bus.ts';
import { settings } from '../../src/core/config.ts';
import { clearErrors, recordError } from '../../src/agent/alert-escalation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readSrc(rel: string): string {
    return fs.readFileSync(join(__dirname, rel), 'utf8');
}

function baseExitParams(overrides: Record<string, any> = {}) {
    let resolved: any = null;
    let queued = false;
    const params = {
        ctx: {
            fullText: 'done',
            sessionId: null,
            toolLog: [],
            traceLog: [],
            stderrBuf: '',
        },
        code: 0,
        cli: 'grok',
        model: 'grok-build',
        resumeKey: null,
        agentLabel: 'main',
        mainManaged: true,
        origin: 'test',
        prompt: 'test',
        opts: {},
        cfg: { effort: '' },
        ownerGeneration: 0,
        forceNew: false,
        empSid: null,
        isResume: false,
        wasKilled: false,
        wasSteer: false,
        smokeResult: { isSmoke: false, confidence: 'low' },
        effortDefault: '',
        costLine: '',
        resolve: (value: any) => { resolved = value; },
        activeProcesses: new Map(),
        setActiveProcess: () => {},
        retryState: {
            timer: null,
            resolve: null,
            origin: null,
            setTimer: () => {},
            setResolve: () => {},
            setOrigin: () => {},
            setIsEmployee: () => {},
        },
        fallbackState: new Map(),
        fallbackMaxRetries: 3,
        processQueue: () => { queued = true; },
        ...overrides,
    };
    return { params, getResolved: () => resolved, wasQueued: () => queued };
}

function installFakeGrokTraceExporter(sessionId: string, chatHistoryJsonl: string): { binDir: string; cleanup: () => void } {
    const root = fs.mkdtempSync(join(tmpdir(), 'jaw-grok-trace-'));
    const traceDir = join(root, sessionId);
    const binDir = join(root, 'bin');
    const archivePath = join(root, 'trace.tar.gz');
    fs.mkdirSync(traceDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(join(traceDir, 'chat_history.jsonl'), chatHistoryJsonl);
    execFileSync('tar', ['-czf', archivePath, '-C', root, sessionId]);
    const script = [
        '#!/bin/sh',
        `printf '%s\\n' '${JSON.stringify({ local_path: archivePath })}'`,
    ].join('\n');
    fs.writeFileSync(join(binDir, 'grok'), script);
    fs.chmodSync(join(binDir, 'grok'), 0o755);
    return {
        binDir,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

test('Gemini capacity classifier separates MODEL_CAPACITY_EXHAUSTED from auth/quota', () => {
    const result = classifyExitError(
        'gemini',
        1,
        'Attempt 1 failed with status 429',
        undefined,
        'MODEL_CAPACITY_EXHAUSTED: No capacity available for model gemini-3.1-pro-preview',
    );

    assert.equal(result.is429, true);
    assert.equal(result.isModelCapacity, true);
    assert.equal(result.isAuth, false);
    assert.match(result.message, /capacity/);
});

test('Claude rate-limit text is not classified as Jaw-level 429 retry', () => {
    for (const cli of ['claude', 'claude-e', 'claude-i']) {
        const result = classifyExitError(
            cli,
            1,
            '429 Too Many Requests: Claude is rate limited and retrying',
        );

        assert.equal(result.is429, false, `${cli} should let Claude own rate-limit pacing`);
        assert.equal(result.isClaudeRateLimit, true);
        assert.match(result.message, /429 Too Many Requests/);
    }
});

test('Claude rate-limit recovery is suppressed from Jaw retry and fallback', () => {
    const lifecycle = readSrc('../../src/agent/lifecycle-handler.ts');
    assert.match(lifecycle, /const\s+suppressClaudeRateLimitRecovery\s*=\s*isClaudeRateLimit/);
    assert.match(lifecycle, /const\s+effectiveIs429\s*=\s*is429/);
    assert.doesNotMatch(lifecycle, /isClaudeRateLimit\s*&&\s*!suppressClaudeRateLimitRecovery/);
    assert.match(lifecycle, /effectiveIs429\s*&&\s*!opts\._isRetry/);
    assert.match(lifecycle, /!\s*suppressClaudeRateLimitRecovery\)\s*\{/);
});

test('Claude rate-limit process exit does not broadcast Jaw retry or fallback', async () => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const originalFallbackOrder = settings["fallbackOrder"];
    let queued = false;
    let resolved: any = null;
    clearErrors('claude');
    clearAllBroadcastListeners();
    addBroadcastListener((type, data) => events.push({ type, data }));
    settings["fallbackOrder"] = ['node'];

    try {
        await handleAgentExit({
            ctx: {
                fullText: '',
                sessionId: null,
                toolLog: [],
                traceLog: [],
                stderrBuf: '429 Too Many Requests: Claude is rate limited and retrying',
            },
            code: 1,
            cli: 'claude',
            model: 'claude-sonnet',
            resumeKey: null,
            agentLabel: 'main',
            mainManaged: true,
            origin: 'test',
            prompt: 'test',
            opts: {},
            cfg: { effort: '' },
            ownerGeneration: 0,
            forceNew: false,
            empSid: null,
            isResume: false,
            wasKilled: false,
            wasSteer: false,
            smokeResult: { isSmoke: false, confidence: 'low' },
            effortDefault: 'medium',
            costLine: '',
            resolve: (value: any) => { resolved = value; },
            activeProcesses: new Map(),
            setActiveProcess: () => {},
            retryState: {
                timer: null,
                resolve: null,
                origin: null,
                setTimer: () => {},
                setResolve: () => {},
                setOrigin: () => {},
                setIsEmployee: () => {},
            },
            fallbackState: new Map(),
            fallbackMaxRetries: 3,
            processQueue: () => { queued = true; },
        });

        assert.ok(resolved);
        assert.equal(resolved.code, 1);
        assert.equal(queued, true);
        assert.equal(events.some(event => event.type === 'agent_retry'), false);
        assert.equal(events.some(event => event.type === 'agent_fallback'), false);
        assert.ok(events.some(event => event.type === 'agent_done'));
    } finally {
        settings["fallbackOrder"] = originalFallbackOrder;
        clearErrors('claude');
        clearAllBroadcastListeners();
    }
});

test('ai-e error classification uses effective provider, not selector name', async () => {
    let resolved: any = null;
    clearAllBroadcastListeners();
    try {
        await handleAgentExit({
            ctx: {
                fullText: '',
                sessionId: null,
                toolLog: [],
                traceLog: [],
                stderrBuf: '429 Too Many Requests',
            },
            code: 1,
            cli: 'ai-e',
            effectiveProvider: 'codex',
            model: 'gpt-5.4',
            resumeKey: null,
            agentLabel: 'main',
            mainManaged: true,
            origin: 'test',
            prompt: 'test',
            opts: { _isRetry: true },
            cfg: { effort: '' },
            ownerGeneration: 0,
            forceNew: false,
            empSid: null,
            isResume: false,
            wasKilled: false,
            wasSteer: false,
            smokeResult: { isSmoke: false, confidence: 'low' },
            effortDefault: 'medium',
            costLine: '',
            resolve: (value: any) => { resolved = value; },
            activeProcesses: new Map(),
            setActiveProcess: () => {},
            retryState: {
                timer: null,
                resolve: null,
                origin: null,
                setTimer: () => {},
                setResolve: () => {},
                setOrigin: () => {},
                setIsEmployee: () => {},
            },
            fallbackState: new Map(),
            fallbackMaxRetries: 3,
            processQueue: () => {},
        });

        assert.ok(resolved);
        assert.equal(resolved.code, 1);
        assert.match(resolved.diagnostic, /API 용량 초과/);
    } finally {
        clearAllBroadcastListeners();
    }
});

test('ai-e Claude provider keeps Claude-owned 429 pacing semantics', async () => {
    let resolved: any = null;
    clearAllBroadcastListeners();
    try {
        await handleAgentExit({
            ctx: {
                fullText: '',
                sessionId: null,
                toolLog: [],
                traceLog: [],
                stderrBuf: '429 Too Many Requests: Claude is rate limited and retrying',
            },
            code: 1,
            cli: 'ai-e',
            effectiveProvider: 'claude',
            model: 'sonnet',
            resumeKey: null,
            agentLabel: 'main',
            mainManaged: true,
            origin: 'test',
            prompt: 'test',
            opts: {},
            cfg: { effort: '' },
            ownerGeneration: 0,
            forceNew: false,
            empSid: null,
            isResume: false,
            wasKilled: false,
            wasSteer: false,
            smokeResult: { isSmoke: false, confidence: 'low' },
            effortDefault: 'medium',
            costLine: '',
            resolve: (value: any) => { resolved = value; },
            activeProcesses: new Map(),
            setActiveProcess: () => {},
            retryState: {
                timer: null,
                resolve: null,
                origin: null,
                setTimer: () => {},
                setResolve: () => {},
                setOrigin: () => {},
                setIsEmployee: () => {},
            },
            fallbackState: new Map(),
            fallbackMaxRetries: 3,
            processQueue: () => {},
        });

        assert.ok(resolved);
        assert.equal(resolved.code, 1);
        assert.match(resolved.diagnostic, /Claude is rate limited/);
    } finally {
        clearAllBroadcastListeners();
    }
});

test('Grok successful lifecycle backfills omitted tool events before agent_done', async () => {
    const sessionId = 'grok-trace-test-session';
    const fake = installFakeGrokTraceExporter(sessionId, [
        JSON.stringify({ type: 'assistant', tool_calls: [{ id: 'call-1', name: 'run_terminal_command', arguments: { command: 'pwd' } }] }),
        JSON.stringify({ type: 'tool_result', tool_call_id: 'call-1', content: 'exit: 0\n/Users/jun\n' }),
    ].join('\n'));
    const originalPath = process.env["PATH"];
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    clearAllBroadcastListeners();
    addBroadcastListener((type, data) => events.push({ type, data }));

    try {
        process.env["PATH"] = `${fake.binDir}:${originalPath || ''}`;
        const { params, getResolved } = baseExitParams({
            ctx: {
                fullText: 'done',
                sessionId,
                toolLog: [],
                traceLog: [],
                stderrBuf: '',
            },
        });
        await handleAgentExit(params as any);

        const resolved = getResolved();
        assert.equal(resolved.tools.length, 1);
        assert.equal(resolved.tools[0].stepRef, 'grok:tool:call-1');
        const done = events.find(event => event.type === 'agent_done');
        assert.ok(done);
        const toolLog = done.data["toolLog"] as Array<Record<string, unknown>>;
        assert.equal(toolLog[0]?.["label"], 'run_terminal_command');
        assert.equal(toolLog[0]?.["status"], 'done');
    } finally {
        process.env["PATH"] = originalPath;
        clearAllBroadcastListeners();
        fake.cleanup();
    }
});

test('ai-e Grok lifecycle uses effective provider for trace backfill', async () => {
    const sessionId = 'aie-grok-trace-test-session';
    const fake = installFakeGrokTraceExporter(sessionId, [
        JSON.stringify({ type: 'assistant', tool_calls: [{ id: 'call-aie', name: 'run_terminal_command', arguments: { command: 'pwd' } }] }),
        JSON.stringify({ type: 'tool_result', tool_call_id: 'call-aie', content: 'exit: 0\n/Users/jun\n' }),
    ].join('\n'));
    const originalPath = process.env["PATH"];
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    clearAllBroadcastListeners();
    addBroadcastListener((type, data) => events.push({ type, data }));

    try {
        process.env["PATH"] = `${fake.binDir}:${originalPath || ''}`;
        const { params, getResolved } = baseExitParams({
            cli: 'ai-e',
            effectiveProvider: 'grok',
            ctx: {
                fullText: 'done',
                sessionId,
                toolLog: [],
                traceLog: [],
                stderrBuf: '',
            },
        });
        await handleAgentExit(params as any);

        const resolved = getResolved();
        assert.equal(resolved.tools[0]?.stepRef, 'grok:tool:call-aie');
        const done = events.find(event => event.type === 'agent_done');
        assert.ok(done);
        const toolLog = done.data["toolLog"] as Array<Record<string, unknown>>;
        assert.equal(toolLog[0]?.["label"], 'run_terminal_command');
    } finally {
        process.env["PATH"] = originalPath;
        clearAllBroadcastListeners();
        fake.cleanup();
    }
});

test('session persistence can be skipped for transient Gemini Auto fallback', () => {
    assert.equal(shouldPersistMainSession({
        ownerGeneration: 0,
        sessionId: 'transient-auto-session',
        skipSessionPersist: true,
        cli: 'gemini',
        model: 'default',
        effort: '',
    }), false);
});

test('Gemini capacity fallback branch precedes generic same-model 429 retry', () => {
    const src = readSrc('../../src/agent/lifecycle-handler.ts');
    const capacityIdx = src.indexOf('Gemini model capacity: one-request Auto fallback');
    const retryIdx = src.indexOf('429 delay retry');

    assert.ok(capacityIdx > 0, 'capacity fallback branch must exist');
    assert.ok(retryIdx > 0, 'generic 429 retry branch must exist');
    assert.ok(capacityIdx < retryIdx, 'capacity fallback must run before same-model 429 retry');
});

test('Gemini capacity fallback keeps main ownership and skips only resume/session persistence', () => {
    const lifecycle = readSrc('../../src/agent/lifecycle-handler.ts');
    const branch = lifecycle.slice(
        lifecycle.indexOf('Gemini model capacity: one-request Auto fallback'),
        lifecycle.indexOf('429 delay retry'),
    );

    assert.match(branch, /model:\s*'default'/);
    assert.match(branch, /_skipResume:\s*true/);
    assert.match(branch, /_skipSessionPersist:\s*true/);
    assert.match(branch, /_isCapacityFallback:\s*true/);
    assert.doesNotMatch(branch, /forceNew:\s*true/);
});

test('Gemini resumed capacity fallback clears stale bucket before retrying without resume', () => {
    const lifecycle = readSrc('../../src/agent/lifecycle-handler.ts');
    const branch = lifecycle.slice(
        lifecycle.indexOf('Gemini resumed capacity failure'),
        lifecycle.indexOf('Gemini model capacity: one-request Auto fallback'),
    );

    assert.match(branch, /isResume/);
    assert.match(branch, /const\s+bucket\s*=\s*resolveSessionBucket\(cli,\s*model,\s*effectiveProvider\)/);
    assert.match(branch, /clearSessionBucket\.run\(bucket\)/);
    assert.match(branch, /_skipResume:\s*true/);
    assert.match(branch, /_skipSessionPersist:\s*true/);
    assert.match(branch, /_isCapacityFallback:\s*true/);
});

test('Gemini high-turn compact coordination clears session bucket like Codex/OpenCode', () => {
    const lifecycle = readSrc('../../src/agent/lifecycle-handler.ts');
    assert.match(lifecycle, /runtimeCli\s*===\s*'codex'\s*\|\|\s*runtimeCli\s*===\s*'opencode'\s*\|\|\s*runtimeCli\s*===\s*'gemini'/);
});

test('Gemini capacity fallback disables resume without changing mainManaged predicate', () => {
    const spawn = readSrc('../../src/agent/spawn.ts');

    assert.match(spawn, /const\s+mainManaged\s*=\s*!forceNew\s*&&\s*!empSid\s*&&\s*!opts\.internal/);
    assert.match(spawn, /!\s*opts\._skipResume\s*&&\s*!forceNew\s*&&\s*!!bucketSessionId/);
});

test('model capacity alert does not tell the user to re-login', () => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    clearAllBroadcastListeners();
    addBroadcastListener((type, data) => events.push({ type, data }));

    const cli = `gemini-capacity-test-${Date.now()}`;
    recordError(cli, 'model_capacity');
    recordError(cli, 'model_capacity');
    recordError(cli, 'model_capacity');

    const alert = events.find(event => event.type === 'alert_escalation');
    assert.ok(alert, 'capacity error threshold should emit alert');
    const message = String(alert.data['message'] ?? '');
    assert.match(message, /capacity|Auto\/Flash/);
    assert.doesNotMatch(message, /로그인 상태 확인 필요/);

    clearAllBroadcastListeners();
});
