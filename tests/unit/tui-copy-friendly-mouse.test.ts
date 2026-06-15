import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');

test('fullscreen mouse tracking defaults to wheel scroll and remains configurable', () => {
    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] !== false/);
    assert.doesNotMatch(source, /screen\.enter\(\);\s*screen\.enableMouse\(\);/);
    assert.match(source, /screen\.disableMouse\(\)/);
});

test('fullscreen wheel events are not swallowed outside transcript coordinates', () => {
    assert.doesNotMatch(source, /ev\.row\s*<\s*regions\.transcript\.y/);
    assert.doesNotMatch(source, /ev\.row\s*>=\s*regions\.transcript\.y\s*\+\s*regions\.transcript\.height/);
    assert.match(source, /viewport\.scrollBy\(ev\.kind === 'wheel-up' \? -3 : 3, h\)/);
});

test('press event pauses mouse tracking for native text selection', () => {
    assert.match(source, /parsed\.event\.kind === 'press'/);
    assert.match(source, /mousePaused = true/);
    assert.match(source, /if \(mousePaused/);
});
