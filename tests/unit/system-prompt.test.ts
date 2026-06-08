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

test('system prompt routes ambiguous Korean search intent away from default code grep', () => {
    assert.ok(a1Src.includes('Korean "검색" intent guard'),
        'system prompt should include a Korean search intent guard');
    assert.ok(a1Src.includes('Rewrite it into 1-3 focused keyword queries'),
        'system prompt should require focused query rewrites for Korean external searches');
    assert.ok(a1Src.includes('Native cli-jaw search is the default backend'),
        'system prompt should keep cli-jaw search native-first');
    assert.ok(a1Src.includes('active `search` skill or existing search/web/official-docs retrieval tools'),
        'system prompt should route through existing cli-jaw search tools');
    assert.ok(a1Src.includes('agbrowse research plan --query "<request>" --json'),
        'system prompt should preserve optional agbrowse research planning');
    assert.ok(a1Src.includes('plan.atomicQueries'),
        'system prompt should allow agbrowse atomic queries as rewrite candidates');
    assert.ok(a1Src.includes('Do not use agbrowse to execute Exa, Tavily, Perplexity, Brave, or other search providers'),
        'system prompt should prevent agbrowse from becoming a search-provider runner');
    assert.ok(a1Src.includes('When agbrowse is unavailable'),
        'system prompt should preserve cli-jaw-only fallback behavior');
    assert.ok(a1Src.includes('Treat search results as URL candidates, not final evidence'),
        'system prompt should treat search results as URL candidates');
    assert.ok(a1Src.includes('Use browser/browse escalation only as downstream verification'),
        'system prompt should reserve browser escalation for downstream verification');
    assert.ok(a1Src.includes('Do **not** treat the bare Korean word "검색" as permission to start repository-wide Grep/Glob by default'),
        'system prompt should prevent bare Korean search intent from defaulting to code search');
    assert.ok(a1Src.includes('use Context7 or official docs search first when available'),
        'system prompt should prefer Context7 or official docs for library/API documentation');
});

test('skills prompt prefers active search skill for external search intent', () => {
    assert.ok(skillsSrc.includes('Search intent override'),
        'skills prompt should include a search intent override');
    assert.ok(skillsSrc.includes('prefer the active `search` skill or web/official-docs retrieval before local code Grep/Glob'),
        'skills prompt should prefer active search/web retrieval before local grep');
    assert.ok(skillsSrc.includes('first rewrite the request into 1-3 focused keyword queries'),
        'skills prompt should require query rewrite for Korean external search intent');
    assert.ok(skillsSrc.includes('Native cli-jaw search is the default backend'),
        'skills prompt should make cli-jaw native search the default backend');
    assert.ok(skillsSrc.includes('active `search` skill or existing search/web/official-docs tools'),
        'skills prompt should use active search or existing native search tools');
    assert.ok(skillsSrc.includes('agbrowse research plan --query "<request>" --json'),
        'skills prompt should keep agbrowse as optional planning help');
    assert.ok(skillsSrc.includes('plan.atomicQueries'),
        'skills prompt should use agbrowse atomic queries only as rewrite candidates');
    assert.ok(skillsSrc.includes('Do not use agbrowse to execute search providers such as Exa, Tavily, Perplexity, or Brave'),
        'skills prompt should prevent agbrowse provider execution');
    assert.ok(skillsSrc.includes('When agbrowse is unavailable'),
        'skills prompt should keep manual rewrite/fetch/browse fallback');
    assert.ok(skillsSrc.includes('Treat search results as URL candidates'),
        'skills prompt should treat search output as URL candidates');
    assert.ok(skillsSrc.includes('use browser/browse only when fetch is empty, truncated, JS-rendered, Naver shell/iframe, PDF-binary, table/list/ranking-only, or otherwise incomplete'),
        'skills prompt should keep browser/browse as downstream fallback');
    assert.ok(skillsSrc.includes('Use local code search first only when the user clearly asks about this repository'),
        'skills prompt should reserve local code search for explicit repository targets');
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
    assert.ok(prompt.includes('cli-jaw skill list --inactive'),
        'ref-only Boss prompt should point to CLI command for browsing ref skills');
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

test('system prompt requires development goal evidence bundle', () => {
    assert.ok(a1Src.includes('Development completion evidence bundle'),
        'goal mode should name the development evidence bundle');
    assert.ok(a1Src.includes('documentation evidence'),
        'goal mode should require documentation evidence');
    assert.ok(a1Src.includes('implementation evidence'),
        'goal mode should require implementation evidence');
    assert.ok(a1Src.includes('verification evidence'),
        'goal mode should require verification evidence');
});
