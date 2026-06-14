import test from 'node:test';
import assert from 'node:assert/strict';
import { Screen, diffFrames, type Frame } from '../../src/cli/tui/render/frame.ts';

test('Screen enter/exit — inline mode (no alt-screen)', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        assert.equal(screen.active, false);
        screen.enter();
        assert.equal(screen.active, true);
        assert.ok(output.includes('\x1b[?25l'), 'hides cursor');
        assert.ok(!output.includes('\x1b[?1049h'), 'does NOT enter alt-screen');
        screen.exit();
        assert.equal(screen.active, false);
        assert.ok(output.includes('\x1b[?25h'), 'shows cursor');
        assert.ok(!output.includes('\x1b[?1049l'), 'does NOT leave alt-screen');
    } finally {
        process.stdout.write = origWrite;
    }
});

test('Screen render uses inline diff for incremental updates', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        const first: Frame = { rows: ['line1', 'line2'] };
        screen.render(first);
        assert.ok(output.includes('line1'));
        assert.ok(output.includes('line2'));

        output = '';
        const second: Frame = { rows: ['line1', 'changed'] };
        screen.render(second);
        assert.ok(!output.includes('line1'), 'unchanged row skipped');
        assert.ok(output.includes('changed'), 'changed row emitted');
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
    }
});

test('Screen forceRedraw repaints from the existing frame top instead of current cursor row', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        screen.render({ rows: ['top', 'input', 'help'], cursorPos: { row: 1, col: 3 } });
        assert.ok(output.includes('\x1b[1A'), 'first render leaves cursor on input row');

        output = '';
        screen.forceRedraw();
        screen.render({ rows: ['new top', 'new input', 'new help'], cursorPos: { row: 1, col: 3 } });

        assert.ok(output.includes('\x1b[1A'), 'full redraw should move from input row back to frame top');
        assert.ok(output.includes('new top'));
        assert.ok(output.includes('new input'));
        assert.ok(output.includes('new help'));
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
    }
});

test('diffFrames full paint on null prev', () => {
    const patch = diffFrames(null, { rows: ['a', 'b'] });
    assert.ok(patch.includes('a'));
    assert.ok(patch.includes('b'));
});

test('Screen render sanitizes embedded row newlines and clamps cursor column', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: 10, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 4, configurable: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        screen.render({ rows: ['top', 'tool\npayload that is too long', 'bottom'], cursorPos: { row: 1, col: 999 } });
        assert.ok(!output.includes('tool\npayload'), 'embedded newline should not split the frame row');
        assert.ok(output.includes('tool paylo'), 'row should be newline-sanitized then width-clipped');
        assert.ok(output.includes('\x1b[9C'), 'cursor column should clamp to terminal width - 1');
        assert.ok(!output.includes('\x1b[999C'));
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
});
