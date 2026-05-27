import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const statusSrc = readSource(join(projectRoot, 'src/workflows/status.ts'), 'utf8');

const SDK_DENYLIST = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];

test('WSJ-001: status module is SDK-free', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!statusSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('WSJ-002: goal status conversion exists', () => {
    assert.ok(statusSrc.includes('goalToStatus'), 'must export goalToStatus');
});

test('WSJ-003: goal-run status conversion exists', () => {
    assert.ok(statusSrc.includes('goalRunToStatus'), 'must export goalRunToStatus');
});

test('WSJ-004: team status conversion exists', () => {
    assert.ok(statusSrc.includes('teamToStatus'), 'must export teamToStatus');
});

test('WSJ-005: status includes workflow discriminant', () => {
    assert.ok(statusSrc.includes("workflow: 'goal'"), 'must set goal workflow');
    assert.ok(statusSrc.includes("workflow: 'goal-run'"), 'must set goal-run workflow');
    assert.ok(statusSrc.includes("workflow: 'team'"), 'must set team workflow');
});

test('WSJ-006: status includes blockers array', () => {
    assert.ok(statusSrc.includes('blockers'), 'must include blockers');
});

test('WSJ-007: status includes confirmationRequired', () => {
    assert.ok(statusSrc.includes('confirmationRequired'), 'must include confirmation flag');
});

test('WSJ-008: status does not expose raw tokens or credentials', () => {
    assert.ok(!statusSrc.includes('claimToken'), 'must not expose claim tokens');
    assert.ok(!statusSrc.includes('apiKey'), 'must not expose API keys');
    assert.ok(!statusSrc.includes('password'), 'must not expose passwords');
});
