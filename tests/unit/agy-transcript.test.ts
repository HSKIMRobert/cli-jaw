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

test('AGY-TR-002: parseTranscriptLine maps PLANNER_RESPONSE to thinking', () => {
    const lines = fs.readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
    const tool = parseTranscriptLine(lines[2]);
    assert.equal(tool?.toolType, 'thinking');
    assert.equal(tool?.icon, '💭');
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