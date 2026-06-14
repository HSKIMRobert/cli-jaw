import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const chatSource = readFileSync(join(root, 'bin/commands/chat.ts'), 'utf8');
const fullscreenSource = readFileSync(join(root, 'bin/commands/tui/fullscreen-mode.ts'), 'utf8');

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
