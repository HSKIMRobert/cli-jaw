import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLayout } from '../../src/cli/tui/render/layout.ts';

test('solveLayout allocates transcript above fixed composer cluster', () => {
    const r = solveLayout(80, 24, 2);
    assert.equal(r.statusLine.height, 1);
    assert.equal(r.help.height, 1);
    assert.equal(r.composer.height, 2);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.transcript.y + r.transcript.height, r.statusLine.y);
    assert.equal(r.statusLine.y + 1, r.composer.y - 1);
    assert.equal(r.help.y, r.composer.y + r.composer.height + 1);
    assert.deepEqual(r.footer, r.statusLine);
});

test('solveLayout clamps composer height for tiny terminals', () => {
    const r = solveLayout(40, 8, 10);
    assert.ok(r.composer.height >= 1);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.statusLine.height, 1);
    assert.equal(r.help.height, 1);
});
