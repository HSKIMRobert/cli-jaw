import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('employee tool events are rebroadcast to the public boss process block', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'agent', 'events', 'helpers.ts'), 'utf8');
    assert.match(src, /ctx\.parentLiveScope/);
    assert.match(src, /empTag\["isEmployee"\]\s*===\s*true/);
    assert.match(src, /broadcast\('agent_tool',\s*payload,\s*'public'\)/);
    assert.match(src, /updateWorkerTools\(agentLabel,\s*ctx\.toolLog\)/);
});
