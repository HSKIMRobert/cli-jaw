import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');

test('fullscreen mouse tracking is opt-in only (native scrollback for default scroll+selection)', () => {
    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
    assert.doesNotMatch(source, /mouseTracking.*!== false/);
});

test('fullscreen wheel events handled when tracking is opt-in enabled', () => {
    assert.match(source, /viewport\.scrollBy\(ev\.kind === 'wheel-up' \? -3 : 3, h\)/);
});
