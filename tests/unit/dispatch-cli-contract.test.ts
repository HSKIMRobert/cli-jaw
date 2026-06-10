import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { unwrapEmployeeSummaries } from '../../bin/commands/dispatch-helpers.ts';

const projectRoot = join(import.meta.dirname, '../..');
const dispatchSrc = readFileSync(join(projectRoot, 'bin/commands/dispatch.ts'), 'utf8');

test('dispatch helper unwraps legacy employee arrays', () => {
    assert.deepEqual(
        unwrapEmployeeSummaries([{ id: '1', name: 'Frontend' }, { bad: true }]),
        [{ id: '1', name: 'Frontend' }],
    );
});

test('dispatch helper unwraps standard { ok, data } employee envelopes', () => {
    assert.deepEqual(
        unwrapEmployeeSummaries({ ok: true, data: [{ id: '2', name: 'Backend' }] }),
        [{ id: '2', name: 'Backend' }],
    );
});

test('dispatch helper returns an empty list for malformed employee payloads', () => {
    assert.deepEqual(unwrapEmployeeSummaries({ ok: true, data: { id: 'bad' } }), []);
    assert.deepEqual(unwrapEmployeeSummaries(null), []);
});

test('dispatch CLI resolves agent id from /api/employees only for watch or worker-busy polling', () => {
    const watchIdx = dispatchSrc.indexOf('if (watch && res.status === 202)');
    assert.ok(watchIdx >= 0, 'watch path should handle async 202 response');

    const nonOkIdx = dispatchSrc.indexOf('if (!res.ok)', watchIdx);
    assert.ok(nonOkIdx >= 0, 'dispatch.ts should handle non-ok dispatch responses');
    const nonOkBlock = dispatchSrc.slice(nonOkIdx, nonOkIdx + 2000);

    const status409Idx = nonOkBlock.indexOf('if (res.status === 409)');
    const resolveIdx = nonOkBlock.indexOf('await resolveAgentId(agent)');
    assert.ok(status409Idx >= 0, 'non-ok path should branch on HTTP 409 before polling');
    assert.ok(resolveIdx > status409Idx, 'resolveAgentId should only run inside the 409 branch');
    const watchBlock = dispatchSrc.slice(watchIdx, dispatchSrc.indexOf('if (!res.ok)', watchIdx));
    assert.ok(
        watchBlock.includes("body?.worker?.agentId || (agent ? await resolveAgentId(agent) : null)"),
        'watch 202 path should resolve agent id only for persisted employees if the server omits worker metadata',
    );
    assert.ok(
        dispatchSrc.includes('const parsed = await readJsonResponse<unknown>(res, \'employees endpoint\')'),
        'resolveAgentId should parse /api/employees through the safe JSON helper',
    );
    assert.ok(
        dispatchSrc.includes('unwrapEmployeeSummaries(parsed.body)'),
        'resolveAgentId should unwrap /api/employees envelope safely',
    );
});

test('dispatch CLI supports virtual employees without /api/employees fallback', () => {
    assert.ok(dispatchSrc.includes('--virtual <name>'), 'help should document --virtual');
    assert.ok(dispatchSrc.includes('--role <text>'), 'help should document --role');
    assert.ok(dispatchSrc.includes('--cli <name>'), 'help should document virtual --cli override');
    assert.ok(dispatchSrc.includes('--model <name>'), 'help should document virtual --model override');
    assert.ok(dispatchSrc.includes("const virtual = getFlag('--virtual')"), 'dispatch should parse --virtual');
    assert.ok(dispatchSrc.includes('...(agent ? { agent } : { virtual })'), 'request body should send agent or virtual');
    assert.ok(
        dispatchSrc.includes("body?.existing?.agentId || (agent ? await resolveAgentId(agent) : null)"),
        'worker-busy fallback should not call /api/employees for virtual employees',
    );
});

test('dispatch CLI reports stale or missing server routes for non-JSON responses', () => {
    assert.match(dispatchSrc, /async function readJsonResponse/);
    assert.match(dispatchSrc, /await res\.text\(\)/);
    assert.match(dispatchSrc, /JSON\.parse\(raw\)/);
    assert.match(dispatchSrc, /server may be stale or missing this route/);
    assert.doesNotMatch(dispatchSrc, /\.json\(\)/);
});
