import test from 'node:test';
import assert from 'node:assert/strict';
import { Screen, diffFrames, type Frame } from '../../src/cli/tui/render/frame.ts';

test('Screen enter/exit emits alt-screen sequences', () => {
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
        assert.ok(output.includes('\x1b[?1049h'), 'enters alt-screen');
        screen.exit();
        assert.equal(screen.active, false);
        assert.ok(output.includes('\x1b[?1049l'), 'leaves alt-screen');
    } finally {
        process.stdout.write = origWrite;
    }
});

test('Screen render uses diffFrames for incremental updates', () => {
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

test('diffFrames full paint on null prev', () => {
    const patch = diffFrames(null, { rows: ['a', 'b'] });
    assert.ok(patch.includes('a'));
    assert.ok(patch.includes('b'));
});
