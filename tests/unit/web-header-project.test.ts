// #233 — instance web UI header "Project …" contracts (static, same pattern
// as web-refresh-state-recovery.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const wsSrc = readFileSync(join(root, 'public/js/ws.ts'), 'utf8');
const coreSrc = readFileSync(join(root, 'public/js/features/settings-core.ts'), 'utf8');
const htmlSrc = readFileSync(join(root, 'public/index.html'), 'utf8');

test('WHP-001: header markup has the project segment next to headerCli', () => {
    assert.ok(htmlSrc.includes('id="headerProject"'), 'headerProject span must exist');
    const headerLine = htmlSrc.split('\n').find(l => l.includes('id="headerCli"'));
    assert.ok(headerLine && headerLine.includes('id="headerProject"'), 'project segment must sit in the same header span');
});

test('WHP-002: settings_change updates the header without reloading settings', () => {
    const idx = wsSrc.indexOf("msg.type === 'settings_change'");
    assert.ok(idx > 0, 'ws dispatcher must handle settings_change');
    const block = wsSrc.slice(idx, idx + 500);
    assert.ok(block.includes("syncOrchestrateSnapshot('settings_change')"), 'existing snapshot sync must stay');
    assert.ok(block.includes('refreshHeaderFromSettingsChange'), 'header must refresh from the event payload');
    assert.ok(!block.includes('loadSettings('), 'must not re-run the full settings load per event');
});

test('WHP-003: settings-core renders the project label on load and on change', () => {
    assert.ok(coreSrc.includes('export function refreshHeaderFromSettingsChange'), 'header refresh entry must be exported');
    assert.ok(coreSrc.includes('setHeaderProject(s.projectDirs)'), 'loadSettings must render the project label');
    assert.ok(coreSrc.includes('formatProjectLabel'), 'must use the shared label formatter');
    const fnIdx = coreSrc.indexOf('function setHeaderProject');
    const block = coreSrc.slice(fnIdx, fnIdx + 600);
    assert.ok(block.includes('el.hidden = true'), 'unset projectDirs must hide the segment');
    assert.ok(block.includes('el.title = label.title'), 'full paths must land in the tooltip');
});
