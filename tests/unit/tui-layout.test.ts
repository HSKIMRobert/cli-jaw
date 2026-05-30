import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLayout } from '../../src/cli/tui/render/layout.ts';

test('solveLayout allocates transcript between composer and footer', () => {
    const r = solveLayout(80, 24, 2);
    assert.equal(r.footer.y, 24);
    assert.equal(r.composer.height, 2);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.transcript.y + r.transcript.height, r.composer.y);
});

test('solveLayout clamps composer height for tiny terminals', () => {
    const r = solveLayout(40, 8, 10);
    assert.ok(r.composer.height >= 1);
    assert.ok(r.transcript.height >= 1);
});
