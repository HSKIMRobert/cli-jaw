import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFooter } from '../../bin/commands/tui/types.ts';

const ACCENT = '\x1b[31m';

test('idle footer shows a dimmed idle state + hints + label', () => {
    const f = formatFooter('codex', ACCENT, 'idle');
    assert.ok(f.includes('codex'));
    assert.ok(f.includes('idle'));
    assert.ok(f.includes('/quit'));
    assert.ok(f.includes('/clear'));
});

test('responding footer uses the accent + state label', () => {
    const f = formatFooter('codex', ACCENT, 'responding');
    assert.ok(f.includes('responding…'));
    assert.ok(f.includes(ACCENT));
});

test('tool footer shows a working state', () => {
    assert.ok(formatFooter('x', ACCENT, 'tool').includes('working…'));
});

test('elapsed is rendered when provided and > 0', () => {
    assert.ok(formatFooter('x', ACCENT, 'responding', 4200).includes('4.2s'));
    assert.ok(!formatFooter('x', ACCENT, 'idle', 0).includes('s  |')); // no elapsed at 0
});

test('bgtask count renders magenta hourglass segment only when > 0', () => {
    const withTasks = formatFooter('x', ACCENT, 'idle', 0, 2);
    assert.ok(withTasks.includes('⏳2'));
    assert.ok(withTasks.includes('\x1b[35m'), 'magenta color for bgtask segment');
    assert.ok(!formatFooter('x', ACCENT, 'idle', 0, 0).includes('⏳'));
    assert.ok(!formatFooter('x', ACCENT, 'idle').includes('⏳'), 'omitted param stays clean');
});
