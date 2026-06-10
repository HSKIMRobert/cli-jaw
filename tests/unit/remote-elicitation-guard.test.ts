import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRemoteChannelElicitationGuard,
    normalizeRemoteChannelElicitationOutput,
    orchestrate,
} from '../../src/orchestrator/pipeline.ts';
import {
    resetState,
    setState,
    type OrcContext,
} from '../../src/orchestrator/state-machine.ts';

const ctx: OrcContext = {
    originalPrompt: 'Clarify the remote channel behavior.',
    workingDir: null,
    plan: 'Remote channels must not emit Web-only elicitation fences.',
    workerResults: [],
    origin: 'telegram',
};

test.afterEach(() => {
    resetState('default');
});

test('remote channel elicitation guard is absent for web and heartbeat origins', () => {
    assert.equal(buildRemoteChannelElicitationGuard('web'), '');
    assert.equal(buildRemoteChannelElicitationGuard('heartbeat'), '');
});

test('remote channel elicitation guard forbids structured fences for Telegram and Discord', () => {
    for (const origin of ['telegram', 'discord']) {
        const guard = buildRemoteChannelElicitationGuard(origin);

        assert.match(guard, new RegExp(`Current origin is ${origin}`));
        assert.match(guard, /Do not output standalone ```elicitation/);
        assert.match(guard, /```choice-buttons/);
        assert.match(guard, /numbered options/);
    }
});

test('orchestrate appends the remote guard after PABCD prompt assembly only for remote origins', async () => {
    let telegramPrompt = '';
    let webPrompt = '';
    setState('B', ctx, 'default');

    await orchestrate('continue', {
        origin: 'telegram',
        _skipClear: true,
        _skipInsert: true,
        _spawnAgent: (prompt: string) => {
            telegramPrompt = prompt;
            return { child: null, promise: Promise.resolve({ text: 'ok', code: 0 }) };
        },
    } as any);

    resetState('default');
    setState('B', { ...ctx, origin: 'web' }, 'default');

    await orchestrate('continue', {
        origin: 'web',
        _skipClear: true,
        _skipInsert: true,
        _spawnAgent: (prompt: string) => {
            webPrompt = prompt;
            return { child: null, promise: Promise.resolve({ text: 'ok', code: 0 }) };
        },
    } as any);

    assert.match(telegramPrompt, /## Approved Plan \(authoritative\)/);
    assert.match(telegramPrompt, /## Remote Channel Capability Override/);
    assert.ok(
        telegramPrompt.indexOf('## Remote Channel Capability Override') > telegramPrompt.indexOf('## Approved Plan (authoritative)'),
        'remote guard should be appended after approved-plan and state prompt assembly',
    );
    assert.doesNotMatch(webPrompt, /Remote Channel Capability Override/);
});

test('remote channel output normalization converts elicitation fences to plain numbered text', () => {
    const spec = JSON.stringify({
        questions: [{
            id: 'scope',
            question: '무엇을 진행할까요?',
            options: [
                { label: 'Web만 유지', value: 'web_only' },
                { label: 'Remote도 native 구현', value: 'remote_native' },
            ],
        }],
    });
    const output = normalizeRemoteChannelElicitationOutput(`설명\n\n\`\`\`elicitation\n${spec}\n\`\`\``, 'telegram');

    assert.doesNotMatch(output, /```elicitation/);
    assert.doesNotMatch(output, /"questions"/);
    assert.match(output, /번호나 텍스트로 답해주세요/);
    assert.match(output, /무엇을 진행할까요\?/);
    assert.match(output, /1\. Web만 유지/);
    assert.match(output, /2\. Remote도 native 구현/);
});

test('remote channel output normalization supports choice-buttons alias', () => {
    const spec = JSON.stringify({
        question: '진행 방식은?',
        options: ['plain text', 'native buttons'],
    });
    const output = normalizeRemoteChannelElicitationOutput(`\`\`\`choice-buttons\n${spec}\n\`\`\``, 'discord');

    assert.doesNotMatch(output, /```choice-buttons/);
    assert.match(output, /진행 방식은\?/);
    assert.match(output, /1\. plain text/);
    assert.match(output, /2\. native buttons/);
});

test('web output normalization preserves structured fences', () => {
    const raw = '```elicitation\n{"questions":[{"question":"선택?","options":["A"]}]}\n```';

    assert.equal(normalizeRemoteChannelElicitationOutput(raw, 'web'), raw);
});
