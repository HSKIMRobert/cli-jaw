import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');

test('fullscreen mouse tracking is opt-in so terminal drag-select copy works by default', () => {
    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
    assert.doesNotMatch(source, /screen\.enter\(\);\s*screen\.enableMouse\(\);/);
    assert.match(source, /screen\.disableMouse\(\)/);
});
