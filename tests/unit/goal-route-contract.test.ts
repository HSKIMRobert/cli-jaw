import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const routeSrc = readSource(join(projectRoot, 'src/routes/goal.ts'), 'utf8');
const serverSrc = readSource(join(projectRoot, 'server.ts'), 'utf8');
const handlerSrc = readSource(join(projectRoot, 'src/cli/handlers-workflows.ts'), 'utf8');
const storeSrc = readSource(join(projectRoot, 'src/goal/store.ts'), 'utf8');

test('GR-001: goal route registers GET and POST /api/goal', () => {
    assert.ok(routeSrc.includes("'/api/goal'"), 'must register /api/goal');
    assert.ok(routeSrc.includes('app.get'), 'must have GET handler');
    assert.ok(routeSrc.includes('app.post'), 'must have POST handler');
});

test('GR-002: goal route has history endpoint', () => {
    assert.ok(routeSrc.includes("'/api/goal/history'"), 'must register /api/goal/history');
});

test('GR-003: goal route requires objective for set action', () => {
    assert.ok(routeSrc.includes("'objective is required'"), 'set action must validate objective');
});

test('GR-004: goal route supports clear and reset without confirmation', () => {
    assert.ok(routeSrc.includes('clear') && !routeSrc.includes('confirm'), 'clear must not require confirm');
    assert.ok(routeSrc.includes('reset'), 'reset action must exist');
});

test('GR-005: server.ts registers goal routes', () => {
    assert.ok(serverSrc.includes('registerGoalRoutes'), 'server must register goal routes');
});

test('GR-006: goal handler supports all subcommands', () => {
    for (const sub of ['set', 'status', 'update', 'done', 'cancel', 'pause', 'resume', 'clear', 'reset', 'history']) {
        assert.ok(
            handlerSrc.includes(`sub === '${sub}'`),
            `handler must support /${sub} subcommand`,
        );
    }
});

test('GR-007: goal handler supports /goal run with preflight', () => {
    assert.ok(handlerSrc.includes("sub === 'run'"), 'handler must check for run subcommand');
    assert.ok(handlerSrc.includes('preflight') && handlerSrc.includes('allGatesPassed'), 'run must check preflight gates');
});

test('GR-008: goal store uses atomic writes', () => {
    assert.ok(storeSrc.includes('.tmp'), 'store must use tmp file for atomic writes');
    assert.ok(storeSrc.includes('renameSync'), 'store must rename tmp to target');
});

test('GR-009: goal store archives to history on clear/complete/cancel', () => {
    assert.ok(storeSrc.includes('archiveGoal'), 'store must have archive helper');
});
