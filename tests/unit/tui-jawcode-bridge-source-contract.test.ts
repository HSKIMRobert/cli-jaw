import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToolLine } from '../../src/cli/tui/jawcode-bridge.ts';

const source = readFileSync(new URL('../../src/cli/tui/jawcode-bridge.ts', import.meta.url), 'utf8');

test('renderToolLine folds completed tool detail instead of printing full detail', () => {
    assert.match(source, /const foldedHint = detailLineCount > 1/);
    assert.match(source, /state === 'pending' \|\| state === 'error'/);
    assert.match(source, /state === 'done' && foldedHint/);
});

test('renderToolLine does not duplicate event emoji before the tool label', () => {
    assert.match(source, /renderToolLine\(_icon: string, label: string/);
    assert.doesNotMatch(source, /\$\{icon\} \$\{label\}/);
    assert.match(source, /theme\.bold\(label\)/);

    const rendered = renderToolLine('🔧', 'Bash', 'npm test', 'done');
    assert.match(rendered, /✔/);
    assert.match(rendered, /Bash/);
    assert.doesNotMatch(rendered, /🔧/);
});
