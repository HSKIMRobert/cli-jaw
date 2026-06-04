import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { HEARTBEAT_JOBS_PATH, loadHeartbeatFile, saveHeartbeatFile } from '../../src/core/config.ts';
import { clearPromptCache, getSystemPrompt } from '../../src/prompt/builder.ts';

test('loadHeartbeatFile returns empty jobs only when heartbeat file is absent', () => {
    fs.rmSync(HEARTBEAT_JOBS_PATH, { force: true });
    assert.deepEqual(loadHeartbeatFile(), { jobs: [] });
});

test('loadHeartbeatFile fails closed on malformed heartbeat file', () => {
    fs.writeFileSync(HEARTBEAT_JOBS_PATH, '{ not-json');
    try {
        assert.throws(() => loadHeartbeatFile(), /heartbeat_load_failed/);
    } finally {
        fs.rmSync(HEARTBEAT_JOBS_PATH, { force: true });
        saveHeartbeatFile({ jobs: [] });
    }
});

test('system prompt surfaces malformed heartbeat file instead of silently dropping jobs', () => {
    clearPromptCache();
    fs.writeFileSync(HEARTBEAT_JOBS_PATH, '{ not-json');
    try {
        const prompt = getSystemPrompt({ forDisk: false });
        assert.match(prompt, /Heartbeat file failed to load:/);
        assert.match(prompt, /heartbeat_load_failed/);
    } finally {
        fs.rmSync(HEARTBEAT_JOBS_PATH, { force: true });
        saveHeartbeatFile({ jobs: [] });
        clearPromptCache();
    }
});
