// System prompt alignment tests — Phase 7 Bundle D
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JAW_HOME, SKILLS_DIR, SKILLS_REF_DIR } from '../../src/core/config.ts';
import { getSystemPrompt } from '../../src/prompt/builder.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const a1Src = readFileSync(join(projectRoot, 'src/prompt/templates/a1-system.md'), 'utf8');
const empSrc = readFileSync(join(projectRoot, 'src/prompt/templates/employee.md'), 'utf8');
const skillsSrc = readFileSync(join(projectRoot, 'src/prompt/templates/skills.md'), 'utf8');

// ─── Canonical send endpoint ─────────────────────────

test('system prompt references canonical /api/channel/send', () => {
    assert.ok(a1Src.includes('/api/channel/send'),
        'system prompt should reference canonical channel send endpoint');
});

test('employee prompt references canonical /api/channel/send', () => {
    assert.ok(empSrc.includes('/api/channel/send'),
        'employee prompt should reference canonical channel send endpoint');
});

// ─── Legacy endpoints documented ─────────────────────

test('system prompt documents legacy telegram and discord endpoints', () => {
    assert.ok(a1Src.includes('/api/telegram/send'),
        'should document legacy telegram endpoint');
    assert.ok(a1Src.includes('/api/discord/send'),
        'should document legacy discord endpoint');
});

test('employee prompt documents legacy endpoints', () => {
    assert.ok(empSrc.includes('/api/telegram/send'),
        'should document legacy telegram endpoint');
    assert.ok(empSrc.includes('/api/discord/send'),
        'should document legacy discord endpoint');
});

// ─── Discord degraded mode documented ────────────────

test('system prompt documents Discord degraded mode', () => {
    assert.ok(a1Src.includes('degraded'),
        'should mention degraded mode');
    assert.ok(a1Src.includes('MESSAGE_CONTENT') || a1Src.includes('message-content') || a1Src.includes('slash command'),
        'should explain degraded mode limitations');
});

test('system prompt mentions jaw doctor for Discord diagnosis', () => {
    assert.ok(a1Src.includes('jaw doctor'),
        'should reference jaw doctor for status checks');
});

// ─── Channel-generic delivery ────────────────────────

test('employee prompt describes channel-generic delivery', () => {
    assert.ok(empSrc.includes('active channel'),
        'should mention active channel for channel-generic delivery');
});

// ─── Skill metadata matching ─────────────────────────

test('system skills prompt reinforces metadata-based skill matching', () => {
    assert.ok(skillsSrc.includes('Match by intent, not exact words'),
        'Boss skills prompt should route skills by semantic task intent');
    assert.ok(skillsSrc.includes('against visible skill names, descriptions, and any listed metadata, keywords, or triggers'),
        'Boss skills prompt should name metadata fields used for skill matching');
    assert.ok(skillsSrc.includes('read that SKILL.md once before deciding the skill does not apply'),
        'Boss skills prompt should inspect plausible skill candidates before rejecting them');
});

test('rendered Boss prompt keeps skill matching guidance when only ref skills exist', () => {
    rmSync(SKILLS_DIR, { recursive: true, force: true });
    mkdirSync(SKILLS_REF_DIR, { recursive: true });
    writeFileSync(join(SKILLS_REF_DIR, 'registry.json'), JSON.stringify({
        skills: {
            diagram: {
                name: 'diagram',
                description: 'SVG diagrams, charts, and interactive visualizations for chat UI',
            },
        },
    }));

    const prompt = getSystemPrompt({ forDisk: false });

    assert.ok(prompt.includes('### Skill Matching'),
        'ref-only Boss prompt should still include the skill matching prelude');
    assert.ok(prompt.includes('Match by intent, not exact words'),
        'ref-only Boss prompt should preserve semantic skill routing');
    assert.ok(prompt.includes('diagram — SVG diagrams, charts, and interactive visualizations for chat UI'),
        'ref-only Boss prompt should include skill metadata descriptions');
    assert.ok(prompt.includes(JAW_HOME),
        'rendered prompt should still use the configured test JAW_HOME');
});

// ─── Active channel auto-selection ───────────────────

test('system prompt documents channel omission defaults to active', () => {
    assert.ok(a1Src.includes('active channel'),
        'should document that omitting channel uses active channel');
});

// ─── Goal contract ───────────────────────────────────

test('system prompt forbids runtime goal state and prefers cli-jaw goal pause', () => {
    assert.ok(a1Src.includes('built-in/runtime goal feature'),
        'should explicitly ban host/runtime goal state while inside cli-jaw');
    assert.ok(a1Src.includes('Use only `cli-jaw goal ...`'),
        'should direct agents to cli-jaw goal commands only');
    assert.ok(a1Src.includes('cli-jaw goal pause --agent --audit'),
        'should make audited agent pause the AI stop command');
    assert.ok(a1Src.includes('Independent pause audit'),
        'should require an independent objective review before AI pause');
    assert.ok(a1Src.includes('Plain `cli-jaw goal pause` is for human/manual use only'),
        'should keep plain pause as a manual-user path');
    assert.ok(a1Src.includes('Do not run `cli-jaw goal done` unless the user explicitly asks'),
        'should reserve done for explicit user-requested final completion');
    assert.ok(!a1Src.includes('run `/goal done`'),
        'should not instruct agents to run slash goal done');
});

test('system prompt requires goal-mode PABCD phase transition commands to be executed', () => {
    assert.ok(a1Src.includes('Run phase-transition commands'),
        'should explicitly tell goal-mode agents to execute phase transition commands');
    assert.ok(a1Src.includes('mandatory shell actions, not status text'),
        'should distinguish command execution from reporting');
    assert.ok(a1Src.includes('at C pass, run `cli-jaw orchestrate D` immediately'),
        'should force C to D transition by command');
});
