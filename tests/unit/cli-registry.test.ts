import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CLI_REGISTRY,
    CLI_KEYS,
    DEFAULT_CLI,
    buildDefaultPerCli,
    buildModelChoicesByCli,
} from '../../src/cli/registry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Structure validation ────────────────────────────

test('CLI_KEYS contains exactly 10 known entries', () => {
    assert.deepEqual(CLI_KEYS.sort(), ['agy', 'ai-e', 'claude', 'claude-e', 'codex', 'codex-app', 'copilot', 'gemini', 'grok', 'opencode']);
});

test('DEFAULT_CLI is claude', () => {
    assert.equal(DEFAULT_CLI, 'claude');
});

test('every CLI entry has required fields', () => {
    for (const key of CLI_KEYS) {
        const entry = CLI_REGISTRY[key];
        assert.ok(entry, `CLI_REGISTRY["${key}"] is missing`);
        assert.equal(typeof entry.label, 'string', `${key}.label must be string`);
        assert.equal(typeof entry.binary, 'string', `${key}.binary must be string`);
        assert.equal(typeof entry.defaultModel, 'string', `${key}.defaultModel must be string`);
        assert.ok(Array.isArray(entry.models), `${key}.models must be array`);
        assert.ok(entry.models.length > 0, `${key}.models must not be empty`);
        assert.ok(Array.isArray(entry.efforts), `${key}.efforts must be array`);
    }
});

test('every CLI defaultModel is included in its models list', () => {
    for (const key of CLI_KEYS) {
        const entry = CLI_REGISTRY[key];
        assert.ok(
            entry.models.includes(entry.defaultModel),
            `${key}.defaultModel "${entry.defaultModel}" not found in models list`
        );
    }
});

test('registry defaults for gemini and opencode are updated', () => {
    assert.equal(CLI_REGISTRY.gemini.defaultModel, 'gemini-3-flash-preview');
    assert.equal(CLI_REGISTRY.opencode.defaultModel, 'opencode-go/kimi-k2.6');
});

test('Antigravity registry exposes AGY as a top-level runtime, not an ai-e provider', () => {
    assert.equal(CLI_REGISTRY.agy.label, 'Antigravity');
    assert.equal(CLI_REGISTRY.agy.binary, 'agy');
    assert.equal(CLI_REGISTRY.agy.defaultModel, 'gemini-3.5-flash');
    assert.deepEqual(CLI_REGISTRY.agy.efforts, []);
    assert.match(CLI_REGISTRY.agy.effortNote || '', /print mode uses -p/);
    assert.equal(CLI_REGISTRY['ai-e'].providers.includes('agy'), false);
});

test('ai-e registry exposes explicit provider selector metadata', () => {
    assert.equal(CLI_REGISTRY['ai-e'].defaultProvider, 'claude');
    assert.deepEqual(CLI_REGISTRY['ai-e'].providers, ['claude', 'codex', 'gemini', 'grok', 'copilot']);
    assert.ok(CLI_REGISTRY['ai-e'].modelsByProvider?.codex.includes('gpt-5.4'));
    assert.ok(CLI_REGISTRY['ai-e'].modelsByProvider?.copilot.includes('gpt-5-mini'));
});

test('ai-e detection checks AI_E_BIN, PATH, then local package candidates', () => {
    const configSrc = fs.readFileSync(join(__dirname, '../../src/core/config.ts'), 'utf8');
    const aiEBlock = configSrc.match(/if \(name === 'ai-e' \|\| binary === 'ai-e'\) \{[\s\S]*?\n    \}/)?.[0] || '';
    assert.match(aiEBlock, /process\.env\["AI_E_BIN"\]/);
    assert.match(aiEBlock, /detectCliBinary\('ai-e'\)/);
    assert.match(aiEBlock, /selectSpawnableCliPath\(getAiEPackageCandidates\(\)\)/);
    assert.match(configSrc, /'@bitkyc08', 'ai-e'/);
    assert.match(configSrc, /'ai-e', 'target', 'release'/);
    assert.ok(
        aiEBlock.indexOf('process.env["AI_E_BIN"]') < aiEBlock.indexOf("detectCliBinary('ai-e')"),
        'AI_E_BIN must be checked before PATH lookup',
    );
    assert.ok(
        aiEBlock.indexOf("detectCliBinary('ai-e')") < aiEBlock.indexOf('getAiEPackageCandidates()'),
        'PATH lookup must be checked before local package candidates',
    );
});

test('grok registry disables effort for grok-build', () => {
    assert.equal(CLI_REGISTRY.grok.defaultModel, 'grok-build');
    assert.deepEqual(CLI_REGISTRY.grok.models, ['grok-build']);
    assert.equal(CLI_REGISTRY.grok.defaultEffort, '');
    assert.deepEqual(CLI_REGISTRY.grok.efforts, []);
    assert.match(CLI_REGISTRY.grok.effortNote || '', /unsupported by grok-build/);
});

test('opencode registry exposes only the curated OpenCode Go models', () => {
    const models = CLI_REGISTRY.opencode.models;
    assert.deepEqual(models, [
        'opencode-go/glm-5.1',
        'opencode-go/kimi-k2.6',
        'opencode-go/mimo-v2.5-pro',
        'opencode-go/mimo-v2.5',
        'opencode-go/minimax-m2.7',
        'opencode-go/qwen3.6-plus',
        'opencode-go/deepseek-v4-pro',
        'opencode-go/deepseek-v4-flash',
    ]);
});

test('copilot registry excludes deprecated claude-opus-4.6-fast', () => {
    assert.ok(!CLI_REGISTRY.copilot.models.includes('claude-opus-4.6-fast'));
});

test('copilot registry excludes claude-opus-4.6', () => {
    assert.ok(!CLI_REGISTRY.copilot.models.includes('claude-opus-4.6'));
});

test('codex and copilot registries include gpt-5.4-mini', () => {
    assert.ok(CLI_REGISTRY.codex.models.includes('gpt-5.4-mini'), 'codex must expose gpt-5.4-mini');
    assert.ok(CLI_REGISTRY.copilot.models.includes('gpt-5.4-mini'), 'copilot must expose gpt-5.4-mini');
});

test('codex/copilot gpt-5.4-mini is listed right after gpt-5.4 (sensible ordering)', () => {
    for (const key of ['codex', 'copilot'] as const) {
        const models = CLI_REGISTRY[key].models;
        const idx54 = models.indexOf('gpt-5.4');
        const idxMini = models.indexOf('gpt-5.4-mini');
        assert.ok(idx54 >= 0 && idxMini >= 0, `${key} must include both gpt-5.4 and gpt-5.4-mini`);
        assert.equal(idxMini, idx54 + 1, `${key}: gpt-5.4-mini should follow gpt-5.4`);
    }
});

// ─── buildDefaultPerCli ──────────────────────────────

test('buildDefaultPerCli returns correct shape', () => {
    const defaults = buildDefaultPerCli();
    assert.equal(typeof defaults, 'object');
    for (const key of CLI_KEYS) {
        assert.ok(defaults[key], `defaults["${key}"] missing`);
        assert.equal(defaults[key].model, CLI_REGISTRY[key].defaultModel);
        assert.equal(typeof defaults[key].effort, 'string');
    }
    assert.equal(defaults['ai-e'].provider, 'claude');
});

test('buildDefaultPerCli returns a new object each call', () => {
    const a = buildDefaultPerCli();
    const b = buildDefaultPerCli();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
});

// ─── buildModelChoicesByCli ──────────────────────────

test('buildModelChoicesByCli returns models for each CLI', () => {
    const choices = buildModelChoicesByCli();
    for (const key of CLI_KEYS) {
        assert.ok(Array.isArray(choices[key]), `choices["${key}"] must be array`);
        assert.deepEqual(choices[key], [...CLI_REGISTRY[key].models]);
    }
});

test('buildModelChoicesByCli returns independent copies', () => {
    const a = buildModelChoicesByCli();
    const b = buildModelChoicesByCli();
    a.claude.push('test-model');
    assert.ok(!b.claude.includes('test-model'), 'modifying one copy should not affect another');
});

test('doctor CLI checks are driven by canonical registry keys', () => {
    const doctorSrc = fs.readFileSync(join(__dirname, '../../bin/commands/doctor.ts'), 'utf8');
    assert.match(doctorSrc, /import \{ CLI_KEYS \}/);
    assert.match(doctorSrc, /for \(const cli of CLI_KEYS\)/);
    assert.doesNotMatch(doctorSrc, /for \(const cli of \['claude', 'codex', 'gemini', 'opencode', 'copilot'\]\)/);
});

test('readiness default order covers every canonical CLI', () => {
    const readinessSrc = fs.readFileSync(join(__dirname, '../../src/cli/readiness.ts'), 'utf8');
    const order = readinessSrc.split('\n').find(line => line.includes('const DEFAULT_ORDER')) || '';
    for (const key of CLI_KEYS) assert.match(order, new RegExp(`'${key}'`), `DEFAULT_ORDER must include ${key}`);
});

test('AGY readiness is installed-only and does not run a prompt', () => {
    const readinessSrc = fs.readFileSync(join(__dirname, '../../src/cli/readiness.ts'), 'utf8');
    const agyCase = readinessSrc.match(/case 'agy': \{[\s\S]*?break;\n\s*\}/)?.[0] || '';
    assert.match(agyCase, /authenticated\s*=\s*true/);
    assert.match(agyCase, /auth checked by agy at run time/);
    assert.doesNotMatch(agyCase, /execFileSync/);
});
