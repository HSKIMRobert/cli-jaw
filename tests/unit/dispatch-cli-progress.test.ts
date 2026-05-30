import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('dispatch CLI prints employee process summary from returned tools', () => {
    const src = fs.readFileSync(path.join(ROOT, 'bin', 'commands', 'dispatch.ts'), 'utf8');
    assert.match(src, /--- Employee Process ---/);
    assert.match(src, /--- Employee Process \(live\) ---/);
    assert.match(src, /function\s+resultTools/);
    assert.match(src, /const watch = process\.argv\.includes\('--watch'\)/);
    assert.match(src, /wait:\s*false/);
    assert.match(src, /pollAndPrintWorker/);
    assert.match(src, /res\.status === 202/);
    assert.match(src, /displayShellCommand/);
    assert.match(src, /displayShellCommandDetail/);
    assert.match(src, /progressRun\(body\.progress\)\?\.tools/);
});
