import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/ws-handler.ts', import.meta.url), 'utf8');

test('ws handler routes thinking deltas to thinking transcript rows', () => {
    assert.match(source, /const isThinkingDelta = !!msg\.thinking/);
    assert.match(source, /if \(!isThinkingDelta\) startAssistantItem/);
    assert.match(source, /appendThinkingTurnText\(transcript, msg\.text \|\| '', msg\.agentId\)/);
});

test('ws handler does not create line-mode stream sink for thinking deltas', () => {
    assert.match(source, /if \(!isFullscreen\(ctx\) && !isThinkingDelta\)/);
});
