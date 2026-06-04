import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPiModelsConfig,
    normalizePiEndpoint,
    normalizePiProfile,
    parsePiModelList,
    parsePiRpcRecord,
    resolvePiCommand,
} from '../../src/agent/pi-runtime.ts';

test('Pi endpoint normalization infers OpenAI chat completions suffix', () => {
    const normalized = normalizePiEndpoint('http://127.0.0.1:18645/v1/chat/completions');
    assert.deepEqual(normalized, {
        baseUrl: 'http://127.0.0.1:18645/v1',
        inferredApiKind: 'openai-completions',
    });
});

test('Pi endpoint normalization infers responses and messages suffixes', () => {
    assert.equal(normalizePiEndpoint('https://api.example.com/v1/responses').inferredApiKind, 'openai-responses');
    assert.equal(normalizePiEndpoint('https://api.example.com/v1/messages').inferredApiKind, 'anthropic-messages');
});

test('Pi basic local proxy accepts empty API key and stores dummy', () => {
    const profile = normalizePiProfile({
        id: 'progrok',
        mode: 'basic',
        endpoint: 'http://localhost:18645/v1',
        model: 'grok-composer-2.5-fast',
        apiKey: '',
    });
    assert.equal(profile.apiKey, 'dummy');
});

test('Pi remote profile requires an API key', () => {
    assert.throws(() => normalizePiProfile({
        id: 'remote',
        mode: 'basic',
        endpoint: 'https://api.example.com/v1',
        model: 'm',
        apiKey: '',
    }), /api key required/);
});

test('Pi models.json config includes provider profile and selected model', () => {
    const profile = normalizePiProfile({
        id: 'progrok',
        endpoint: 'http://127.0.0.1:18645/v1',
        model: 'grok-4.3',
    });
    const config = buildPiModelsConfig({ defaultProfileId: 'progrok', profiles: [profile] });
    const provider = ((config.providers as Record<string, unknown>).progrok as Record<string, unknown>);
    assert.deepEqual((provider.models as Array<Record<string, unknown>>).map((entry) => entry.id), ['grok-4.3']);
    assert.equal(provider.api, 'openai-completions');
});

test('Pi offline model list parser extracts models for the selected provider', () => {
    const output = `provider model context\nprogrok grok-4.3 256000\nprogrok grok-composer-2.5-fast 256000\nother x 1\n`;
    assert.deepEqual(parsePiModelList(output, 'progrok'), ['grok-4.3', 'grok-composer-2.5-fast']);
});

test('Pi RPC parser treats prompt success as non-terminal and agent_end as done', () => {
    assert.deepEqual(parsePiRpcRecord({ id: 1, type: 'response', command: 'prompt', success: true }), {});
    assert.deepEqual(parsePiRpcRecord({ type: 'agent_end', sessionId: 's1' }), { done: true, sessionId: 's1' });
    assert.deepEqual(parsePiRpcRecord({
        type: 'agent_end',
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
        ],
    }), { done: true, text: 'answer' });
});

test('Pi command fallback is command/baseArgs tuple, not a shell string', () => {
    const cmd = resolvePiCommand({ PATH: '' });
    assert.equal(cmd.command, 'npm');
    assert.deepEqual(cmd.baseArgs.slice(0, 4), ['exec', '--yes', '--package', '@earendil-works/pi-coding-agent']);
});
