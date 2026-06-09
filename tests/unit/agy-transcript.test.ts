import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    agyTranscriptStepKey,
    parseTranscriptLine,
    readTranscriptDelta,
} from '../../src/agent/agy-transcript.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '../fixtures/agy-transcript/sample-lines.jsonl');

test('AGY-TR-001: parseTranscriptLine maps RUN_COMMAND to tool entry', () => {
    const line = fs.readFileSync(fixturePath, 'utf8').split('\n')[0];
    const tool = parseTranscriptLine(line);
    assert.ok(tool);
    assert.equal(tool!.toolType, 'tool');
    assert.equal(tool!.icon, '🔧');
    assert.match(tool!.stepRef ?? '', /^agy:transcript:1:RUN_COMMAND$/);
    assert.equal(tool!.status, 'done');
});

test('AGY-TR-002: parseTranscriptLine skips PLANNER_RESPONSE process blocks', () => {
    const lines = fs.readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
    const tool = parseTranscriptLine(lines[2]);
    assert.equal(tool, null);
});

test('AGY-TR-006: Korean PLANNER_RESPONSE status prose is not a thinking tool', () => {
    const tool = parseTranscriptLine(JSON.stringify({
        step_index: 39,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        content: '서버 정상! 이제 Swiss Style에 맞는 이미지 4장을 동시에 생성한다. 🦈',
    }));
    assert.equal(tool, null);
});

test('AGY-TR-003: readTranscriptDelta returns only new bytes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-tr-'));
    const p = path.join(tmp, 't.jsonl');
    fs.writeFileSync(p, fs.readFileSync(fixturePath, 'utf8'));
    const first = readTranscriptDelta(p, 0);
    assert.ok(first.lines.length >= 3);
    const second = readTranscriptDelta(p, first.offset);
    assert.equal(second.lines.length, 0);
    fs.appendFileSync(p, '{"step_index":9,"type":"GREP_SEARCH","status":"DONE","content":"pattern foo"}\n');
    const third = readTranscriptDelta(p, second.offset);
    assert.equal(third.lines.length, 1);
    const tool = parseTranscriptLine(third.lines[0]);
    assert.equal(tool?.toolType, 'search');
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('AGY-TR-004: agyTranscriptStepKey is stable', () => {
    assert.equal(agyTranscriptStepKey(5, 'RUN_COMMAND'), '5:RUN_COMMAND');
});

test('AGY-TR-005: spawn wires agy transcript watcher', () => {
    const spawnSrc = fs.readFileSync(path.join(__dirname, '../../src/agent/spawn.ts'), 'utf8');
    assert.match(spawnSrc, /startAgyTranscriptWatcher/);
    assert.match(spawnSrc, /agyTranscriptWatcher\?\.stop\(\)/);
});

test('AGY-TR-007: transcript watcher retargets when AGY resume emits a new conversation id', () => {
    const watcherSrc = fs.readFileSync(path.join(__dirname, '../../src/agent/agy-transcript-watcher.ts'), 'utf8');
    assert.match(watcherSrc, /currentSessionId\s*=\s*options\.getSessionId\(\)/);
    assert.match(watcherSrc, /currentSessionId !== conversationId/);
    assert.match(watcherSrc, /transcriptPath\s*=\s*null/);
    assert.match(watcherSrc, /conversationId\s*=\s*resolved\.conversationId/);
});
