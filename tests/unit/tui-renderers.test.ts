import test from 'node:test';
import assert from 'node:assert/strict';
import { clipTextToCols, visualWidth } from '../../src/cli/tui/renderers.ts';

test('visualWidth ignores ANSI escape codes', () => {
    assert.equal(visualWidth('\x1b[31mabc\x1b[0m'), 3);
});

test('visualWidth counts Hangul as double-width', () => {
    assert.equal(visualWidth('가a'), 3);
});

test('clipTextToCols respects visual width for mixed-width text', () => {
    assert.equal(clipTextToCols('가나다abc', 5), '가나');
    assert.equal(clipTextToCols('가나다abc', 6), '가나다');
    assert.equal(clipTextToCols('가나다abc', 7), '가나다a');
});

test('clipTextToCols preserves complete ANSI sequences and resets after clipping', () => {
    const clipped = clipTextToCols('\x1b[36mabcdef\x1b[0m', 3);
    assert.equal(clipped, '\x1b[36mabc\x1b[0m');
    assert.equal(visualWidth(clipped), 3);
});

test('clipTextToCols drops incomplete ANSI control sequences', () => {
    assert.equal(clipTextToCols('abc\x1b[', 10), 'abc');
});
