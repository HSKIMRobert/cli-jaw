import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const searchSkillPath = join(__dirname, '../../skills_ref/search/SKILL.md');
const registryPath = join(__dirname, '../../skills_ref/registry.json');
const hasSearchSkill = fs.existsSync(searchSkillPath);

test('SSP-001: restored search skill is a registered unified search hub', { skip: !hasSearchSkill && 'skills_ref/search missing' }, () => {
    const searchSkill = fs.readFileSync(searchSkillPath, 'utf8');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    assert.match(searchSkill, /name: search/);
    assert.match(searchSkill, /Unified search hub/);
    assert.match(searchSkill, /4-tier escalation/);
    assert.ok(registry.skills.search, 'registry should include search skill');
    assert.equal(registry.skills.search.category, 'research');
});

test('SSP-002: search skill keeps four-tier escalation order', { skip: !hasSearchSkill && 'skills_ref/search missing' }, () => {
    const searchSkill = fs.readFileSync(searchSkillPath, 'utf8');

    assert.match(searchSkill, /Tier 1 — Built-in CLI Web Search/);
    assert.match(searchSkill, /Tier 2 — cli-jaw browser/);
    assert.match(searchSkill, /Tier 3 — progrok/);
    assert.match(searchSkill, /Tier 4 — web-ai/);
    assert.ok(
        searchSkill.indexOf('Tier 2 — cli-jaw browser') < searchSkill.indexOf('Tier 3 — progrok'),
        'browser verification should come before progrok'
    );
    assert.match(searchSkill, /Order is mandatory/);
});

test('SSP-003: Korean search policy treats snippets as discovery and requires original evidence', { skip: !hasSearchSkill && 'skills_ref/search missing' }, () => {
    const searchSkill = fs.readFileSync(searchSkillPath, 'utf8');

    assert.match(searchSkill, /Search is discovery, not evidence/);
    assert.match(searchSkill, /1-3 focused keyword queries/);
    assert.match(searchSkill, /URL candidates only/);
    assert.match(searchSkill, /Fetch\/open the original page/);
    assert.match(searchSkill, /browse-needed/);
    assert.match(searchSkill, /Naver shell\/iframe/);
    assert.match(searchSkill, /run Tier 2 browser verification before relying on secondary sources/);
    assert.match(searchSkill, /Secondary sources are corroboration, not substitutes/);
});

test('SSP-004: agbrowse remains an optional planner, not a provider runner', { skip: !hasSearchSkill && 'skills_ref/search missing' }, () => {
    const searchSkill = fs.readFileSync(searchSkillPath, 'utf8');

    assert.match(searchSkill, /agbrowse research plan --query "<request>" --json/);
    assert.match(searchSkill, /plan\.atomicQueries/);
    assert.match(searchSkill, /optional planning helper/);
    assert.match(searchSkill, /Do not use agbrowse to execute Exa,\s+Tavily, Perplexity, Brave, or any other search provider/);
});
