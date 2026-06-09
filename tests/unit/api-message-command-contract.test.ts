import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// /api/message lives in routes/command.ts since the Phase 2 extraction (devlog 260609, 20).
const serverSrc = fs.readFileSync(path.join(__dirname, '../../src/routes/command.ts'), 'utf8');

function routeBlock(route: string): string {
    const start = serverSrc.indexOf(route);
    assert.ok(start >= 0, `${route} route missing`);
    const next = serverSrc.indexOf("app.post('", start + route.length);
    return serverSrc.slice(start, next > start ? next : undefined);
}

test('/api/message slash command errors fail closed instead of falling through to agent prompt', () => {
    const block = routeBlock("app.post('/api/message'");
    const catchStart = block.indexOf("console.error('[api/message:cmd]'");
    const submitStart = block.indexOf('const result = submitMessage(trimmed');
    assert.ok(catchStart > 0, 'slash command catch block missing');
    assert.ok(submitStart > catchStart, 'normal message submit path should remain after slash handling');
    const catchBlock = block.slice(catchStart, submitStart);
    assert.match(catchBlock, /res\.status\(500\)\.json\(\{ ok: false, command: true, error \}\);/);
    assert.match(catchBlock, /return;/);
});
