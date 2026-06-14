import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const chatSource = readFileSync(join(root, 'bin/commands/chat.ts'), 'utf8');

test('fullscreen jaw chat does not hydrate persisted message history at launch', () => {
    assert.equal(chatSource.includes('/api/messages?limit='), false);
    assert.equal(chatSource.includes('hydrateFullscreenHistory'), false);
    assert.equal(chatSource.includes('hydrateTranscriptFromHistory'), false);
});

test('fullscreen jaw chat still starts from welcome prelude and live renderer', () => {
    assert.ok(chatSource.includes('ctx.welcomeLines = welcomeLines'));
    assert.ok(chatSource.includes('await runFullscreenMode(ctx)'));
});
