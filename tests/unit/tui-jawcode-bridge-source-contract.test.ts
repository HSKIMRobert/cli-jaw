import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToolLine } from '../../src/cli/tui/jawcode-bridge.ts';

const source = readFileSync(new URL('../../src/cli/tui/jawcode-bridge.ts', import.meta.url), 'utf8');

test('renderToolLine preserves one-line completed tool detail and folds multiline detail', () => {
    assert.match(source, /const detailLines = detail\.split\('\\n'\)/);
    assert.match(source, /const firstDetail = detailLines\[0\]/);
    assert.match(source, /\$\{firstDetail\} … \+\$\{detailLines\.length - 1\} lines/);
    assert.match(source, /state === 'pending' \|\| state === 'error'/);
    assert.match(source, /state === 'done' && foldedHint/);

    const singleLine = renderToolLine('🔧', 'Bash', 'npm test', 'done');
    assert.match(singleLine, /npm test/);

    const multiLine = renderToolLine('🔧', 'Bash', 'npm test\nsecond line', 'done');
    assert.match(multiLine, /npm test/);
    assert.match(multiLine, /\+1 lines/);
    assert.doesNotMatch(multiLine, /second line/);
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
