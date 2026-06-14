import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/cli/tui/jawcode-bridge.ts', import.meta.url), 'utf8');

test('renderToolLine folds completed tool detail instead of printing full detail', () => {
    assert.match(source, /const foldedHint = detailLineCount > 1/);
    assert.match(source, /state === 'pending' \|\| state === 'error'/);
    assert.match(source, /state === 'done' && foldedHint/);
});
