// Dev skill governance patch — 94 prompt-snapshot scenarios (S1-S5).
// Verifies C0-C5 Boss contract + task_tags employee routing (92/98/99).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSystemPrompt, getEmployeePromptV2, normalizeTaskTags, clearPromptCache } from '../../src/prompt/builder.ts';

const emp = { name: 'TagTest', cli: 'codex' };

test('S1: Boss prompt carries classification contract + compact PABCD, no full skill body', () => {
    const prompt = getSystemPrompt({ forDisk: false });
    assert.ok(prompt.includes('## Dev Work Classification (contract)'), 'classification contract present');
    assert.ok(prompt.includes('classify work C0-C5'), 'C0-C5 classifier line present');
    assert.ok(!prompt.includes('Delegation Trap'), 'full dev-pabcd body must not be inlined');
});

test('S2: frontend + task_tags ["tdd"] adds dev-testing, not dev-security', () => {
    clearPromptCache();
    const prompt = getEmployeePromptV2(emp, 'frontend', 3, { taskTags: ['tdd'] });
    assert.ok(prompt.includes('## Task Tag Guides'), 'tag section present');
    assert.ok(prompt.includes('dev-testing'), 'tdd loads dev-testing');
    assert.ok(!prompt.includes('dev-security'), 'unrelated security guide absent');
});

test('S3: backend + threat_model/migration_backfill adds security+data+testing', () => {
    clearPromptCache();
    const prompt = getEmployeePromptV2(emp, 'backend', 3, { taskTags: ['threat_model', 'migration_backfill'] });
    assert.ok(prompt.includes('dev-security'), 'threat_model loads dev-security');
    assert.ok(prompt.includes('dev-data'), 'migration_backfill loads dev-data');
    assert.ok(prompt.includes('dev-testing'), 'migration_backfill loads dev-testing');
    assert.ok(prompt.includes('your execution role stays "backend"'), 'role unchanged by tags');
});

test('S4: legacy no-tag dispatch keeps existing shape (no tag section)', () => {
    clearPromptCache();
    const tagged = getEmployeePromptV2(emp, 'frontend', 3, { taskTags: [] });
    assert.ok(!tagged.includes('## Task Tag Guides'), 'no tag section without tags');
    clearPromptCache();
    const legacy = getEmployeePromptV2(emp, 'frontend', 3, {});
    assert.equal(tagged, legacy, 'empty tags === legacy opts output');
});

test('S5: frontend_ui adds dev-uiux-design alongside frontend role guide', () => {
    clearPromptCache();
    const prompt = getEmployeePromptV2(emp, 'frontend', 3, { taskTags: ['frontend_ui'] });
    assert.ok(prompt.includes('dev-uiux-design'), 'frontend_ui loads dev-uiux-design');
    assert.ok(prompt.includes('Role guide: dev-frontend') || prompt.includes('dev-frontend'), 'role guide intact');
});

test('normalizeTaskTags: trims, lowercases, dedups, sorts, drops junk', () => {
    assert.deepEqual(normalizeTaskTags([' TDD ', 'tdd', 'Threat-Model', 7, '', null]), ['tdd', 'threat_model']);
    assert.deepEqual(normalizeTaskTags('tdd'), []);
    assert.deepEqual(normalizeTaskTags(undefined), []);
});

test('unknown tags are surfaced, not silently dropped', () => {
    clearPromptCache();
    const prompt = getEmployeePromptV2(emp, 'backend', 3, { taskTags: ['nonexistent_method'] });
    assert.ok(prompt.includes('Unrecognized tags (no extra guide): nonexistent_method'));
});

test('tag cache key separates tagged and untagged prompts', () => {
    clearPromptCache();
    const a = getEmployeePromptV2(emp, 'backend', 3, { taskTags: ['tdd'] });
    const b = getEmployeePromptV2(emp, 'backend', 3, {});
    assert.notEqual(a, b, 'tagged prompt must not be served from untagged cache entry');
});
