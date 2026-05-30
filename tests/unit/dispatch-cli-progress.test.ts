import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('dispatch CLI prints employee process summary from returned tools', () => {
    const src = fs.readFileSync(path.join(ROOT, 'bin', 'commands', 'dispatch.ts'), 'utf8');
    assert.match(src, /--- Employee Process ---/);
    assert.match(src, /function\s+resultTools/);
    assert.match(src, /displayShellCommand/);
    assert.match(src, /displayShellCommandDetail/);
});
