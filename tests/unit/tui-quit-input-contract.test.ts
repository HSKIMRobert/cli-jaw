import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executeCommand, parseCommand } from '../../src/cli/commands.ts';

const overlaysSource = readFileSync(new URL('../../bin/commands/tui/overlays.ts', import.meta.url), 'utf8');
const inputHandlerSource = readFileSync(new URL('../../bin/commands/tui/input-handler.ts', import.meta.url), 'utf8');

test('fullscreen /quit remains a CLI command that returns exit code', async () => {
    const parsed = parseCommand('/quit');

    assert.equal(parsed?.type, 'known');
    assert.equal(parsed?.name, 'quit');

    const result = await executeCommand(parsed, { interface: 'cli' });
    assert.equal(result?.ok, true);
    assert.equal(result?.code, 'exit');
});

test('fullscreen runSlashCommand keeps terminal cleanup before process exit', () => {
    assert.match(overlaysSource, /export async function runSlashCommand/);
    assert.match(overlaysSource, /result\?\.code === 'exit'/);
    assert.match(overlaysSource, /cleanupScrollRegion/);
    assert.match(overlaysSource, /setBracketedPaste\(false\)/);
    assert.match(overlaysSource, /process\.stdin\.setRawMode\(false\)/);
    assert.match(overlaysSource, /process\.exit\(0\)/);
});

test('fullscreen input handler parses slash drafts before normal chat send', () => {
    const parseIndex = inputHandlerSource.indexOf('const parsed = draft !== null ? parseCommand(text) : null;');
    const commandIndex = inputHandlerSource.indexOf('void runSlashCommand(ctx, parsed);');
    const sendIndex = inputHandlerSource.indexOf("ctx.ws.send(JSON.stringify({ type: 'send_message', text }));");

    assert.ok(parseIndex >= 0, 'slash draft parse should exist');
    assert.ok(commandIndex > parseIndex, 'runSlashCommand should follow slash parsing');
    assert.ok(sendIndex > commandIndex, 'normal chat send should remain after slash command branch');
});
