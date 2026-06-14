import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const chatSource = readFileSync(join(root, 'bin/commands/chat.ts'), 'utf8');
const fullscreenSource = readFileSync(join(root, 'bin/commands/tui/fullscreen-mode.ts'), 'utf8');
const frameSource = readFileSync(join(root, 'src/cli/tui/render/frame.ts'), 'utf8');

test('fullscreen jaw chat does not hydrate persisted message history at launch', () => {
    assert.equal(chatSource.includes('/api/messages?limit='), false);
    assert.equal(chatSource.includes('hydrateFullscreenHistory'), false);
    assert.equal(chatSource.includes('hydrateTranscriptFromHistory'), false);
});

test('fullscreen jaw chat still starts from welcome prelude and live renderer', () => {
    assert.ok(chatSource.includes('ctx.welcomeLines = welcomeLines'));
    assert.ok(chatSource.includes('await runFullscreenMode(ctx)'));
});

test('fullscreen welcome remains in the launch prelude instead of pre-render stdout', () => {
    assert.equal(fullscreenSource.includes('function printWelcomeToScrollback'), false);
    assert.equal(fullscreenSource.includes('ctx.welcomeLines = [];'), false);
    assert.ok(fullscreenSource.includes('viewport.setPrelude(renderWelcomePrelude(ctx, cols))'));
    assert.ok(fullscreenSource.includes([
        'rebuildFooter(ctx);',
        '    screen.enter();',
        "    if (ctx.tuiConfig['mouseTracking'] === true) screen.enableMouse();",
        '    scheduler.request();',
    ].join('\n')));
});

test('fullscreen scrollback commit uses a scroll region instead of plain newline append', () => {
    const commitStart = frameSource.indexOf('commitLines(lines: string[]): boolean');
    const commitEnd = frameSource.indexOf('forceRedraw(): void', commitStart);
    const commitBlock = frameSource.slice(commitStart, commitEnd);

    assert.ok(commitBlock.includes('buildInsertHistorySequence'));
    assert.ok(commitBlock.includes('this.lastFillRows'));
    assert.ok(commitBlock.includes('this.needsResizeRepaint()'));
    assert.ok(commitBlock.includes('liveZoneTop <= 0'));
    assert.equal(commitBlock.includes("buf += '\\r\\n\\x1b[2K'"), false);
    assert.ok(frameSource.includes("out += lines[i] ?? '';"));
});

test('fullscreen resize uses redraw without clearing terminal history', () => {
    const resizeStart = fullscreenSource.indexOf("process.stdout.on('resize'");
    const resizeEnd = fullscreenSource.indexOf("process.stdin.on('data'", resizeStart);
    const resizeBlock = fullscreenSource.slice(resizeStart, resizeEnd);

    assert.ok(frameSource.includes('needsResizeRepaint(): boolean'));
    assert.ok(frameSource.includes('geometryChanged(width: number, height: number): boolean'));
    assert.ok(frameSource.includes('forceResizeRedraw(): void'));
    assert.ok(frameSource.includes('buildViewportRepaintSequence'));
    assert.ok(resizeBlock.includes([
        'viewport.setWidth(process.stdout.columns || 80);',
        '        screen.forceResizeRedraw();',
        '        scheduler.request();',
        '',
        '        if (ctx.resizeTimer) clearTimeout(ctx.resizeTimer);',
    ].join('\n')), 'resize handler should request an immediate repaint before trailing debounce');
    assert.equal(resizeBlock.includes('screen.forceRedraw();'), false);
    assert.equal(resizeBlock.includes('screen.resetViewport();'), false);
    assert.equal(frameSource.includes('\\x1b[2J'), false);
    assert.equal(frameSource.includes('\\x1b[3J'), false);
});
