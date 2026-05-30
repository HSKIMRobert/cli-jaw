import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('employee tool events update worker progress without duplicate public rebroadcast', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'agent', 'events', 'helpers.ts'), 'utf8');
    assert.match(src, /ctx\.parentLiveScope/);
    assert.match(src, /empTag\["isEmployee"\]\s*===\s*true/);
    assert.doesNotMatch(src, /broadcast\('agent_tool',\s*payload,\s*'public'\)/);
    assert.match(src, /updateWorkerTools\(agentLabel,\s*ctx\.toolLog\)/);
    assert.match(src, /sanitizeWorkerProgressTools\(ctx\.toolLog\.slice\(synced,\s*total\)\)/);
});

test('spawn parent live-run employee appends use worker progress sanitizer', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'agent', 'spawn.ts'), 'utf8');
    assert.match(src, /sanitizeWorkerProgressTools/);
    assert.match(src, /function\s+appendParentLiveRunTool/);
    assert.doesNotMatch(src, /appendLiveRunTool\(ctx\.parentLiveScope,\s*\{\s*\.\.\.(?:tool|parsedTool|parsed\.tool)/);
    assert.match(src, /appendLiveRunTool\(ctx\.parentLiveScope,\s*\{\s*\.\.\.safeTool/);
    assert.match(src, /appendParentLiveRunTool\(ctx,\s*tool\)/);
    assert.match(src, /appendParentLiveRunTool\(ctx,\s*parsedTool\)/);
});
