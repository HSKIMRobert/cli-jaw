import test from 'node:test';
import assert from 'node:assert/strict';
import { Screen, VIEWPORT_FILL, diffFrames, type Frame } from '../../src/cli/tui/render/frame.ts';
import { AnsiTerminalModel } from './helpers/ansi-terminal-model.ts';

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

test('Screen forceResizeRedraw anchors repaint to the current viewport home after height resize', () => {
    let output = '';
    const terminal = new AnsiTerminalModel(40, 8);
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: 40, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 8, configurable: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        output += text;
        terminal.write(text);
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        screen.render({ rows: [VIEWPORT_FILL, 'WELCOME', 'input', 'help'], cursorPos: { row: 2, col: 1 } });
        assert.equal(terminal.countVisible('WELCOME'), 1);

        terminal.resize(40, 5);
        Object.defineProperty(process.stdout, 'rows', { value: 5, configurable: true });
        output = '';
        screen.forceResizeRedraw();
        screen.render({ rows: [VIEWPORT_FILL, 'WELCOME', 'input', 'help'], cursorPos: { row: 2, col: 1 } });

        assert.ok(output.includes('\x1b[H'), 'resize repaint should anchor at viewport home');
        assert.equal(output.includes('\x1b[2J'), false, 'resize repaint must not clear scrollback');
        assert.equal(output.includes('\x1b[3J'), false, 'resize repaint must not clear scrollback history');
        assert.equal(terminal.countVisible('WELCOME'), 1, terminal.visibleText());
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
});

test('Screen first fullscreen render clears preexisting terminal history before painting welcome', () => {
    let output = '';
    const terminal = new AnsiTerminalModel(40, 6);
    terminal.write('shell-0\r\nshell-1\r\nshell-2');
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: 40, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 6, configurable: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        output += text;
        terminal.write(text);
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        screen.render({ rows: ['╭ welcome ╮', VIEWPORT_FILL, 'input', 'help'], cursorPos: { row: 2, col: 1 } });

        assert.ok(output.includes('\x1b[2J\x1b[H'), 'launch render should clear the visible terminal and home the cursor');
        assert.ok(output.includes('\x1b[3J'), 'launch render should clear preexisting scrollback outside multiplexers');
        assert.equal(terminal.visibleText().includes('shell-'), false, terminal.visibleText());
        assert.equal((terminal.visibleText().split('\n')[0] ?? '').startsWith('╭ welcome'), true, terminal.visibleText());
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
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

test('Screen commit writes committed text only when a viewport fill lane exists', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: 30, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 6, configurable: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        screen.render({ rows: [VIEWPORT_FILL, 'live', 'input', 'help'] });

        output = '';
        assert.equal(screen.commitLines(['welcome', 'u:first']), true);
        assert.ok(output.includes('welcome'));
        assert.ok(output.includes('u:first'));
        assert.ok(output.includes('\x1b[1;3r'), 'commit region should be the top fill lane only');

        output = '';
        screen.render({ rows: [VIEWPORT_FILL, 'a', 'b', 'c', 'd', 'e', 'f'] });
        assert.equal(screen.commitLines(['overflow']), false);
        assert.equal(output.includes('overflow'), false);
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
});

test('Screen auto-detects geometry changes before debounced resize repaint fires', () => {
    let output = '';
    const terminal = new AnsiTerminalModel(40, 8);
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    const setSize = (rows: number, columns = 40): void => {
        Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
        Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true });
    };
    setSize(8);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        output += text;
        terminal.write(text);
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        output = '';
        screen.render({ rows: [VIEWPORT_FILL, 'WELCOME', 'input', 'help'], cursorPos: { row: 2, col: 1 } });
        assert.equal(terminal.countVisible('WELCOME'), 1);

        for (const rows of [5, 8, 4, 9, 6]) {
            terminal.resize(40, rows);
            setSize(rows);
            output = '';
            screen.render({ rows: [VIEWPORT_FILL, 'WELCOME', 'input', 'help'], cursorPos: { row: 2, col: 1 } });

            assert.ok(output.includes('\x1b[H'), `height ${rows} should repaint from viewport home`);
            assert.equal(output.includes('\x1b[2J'), false, 'implicit resize repaint must not clear the viewport/scrollback destructively');
            assert.equal(output.includes('\x1b[3J'), false, 'implicit resize repaint must not clear scrollback history');
            assert.equal(terminal.countVisible('WELCOME'), 1, terminal.visibleText());
        }
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
});

test('Screen defers native scrollback commits while geometry is dirty', () => {
    let output = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    const rowsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    Object.defineProperty(process.stdout, 'columns', { value: 30, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 6, configurable: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;

    try {
        const screen = new Screen();
        screen.enter();
        screen.render({ rows: [VIEWPORT_FILL, 'live', 'input', 'help'] });

        Object.defineProperty(process.stdout, 'rows', { value: 4, configurable: true });
        output = '';
        assert.equal(screen.needsResizeRepaint(), true);
        assert.equal(screen.commitLines(['history-before-repaint']), false);
        assert.equal(output.includes('history-before-repaint'), false);

        screen.render({ rows: [VIEWPORT_FILL, 'live', 'input', 'help'] });
        assert.equal(screen.needsResizeRepaint(), false);
        screen.exit();
    } finally {
        process.stdout.write = origWrite;
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
        if (rowsDesc) Object.defineProperty(process.stdout, 'rows', rowsDesc);
    }
});
