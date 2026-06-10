import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupWebUiDom, resetWebUiDom } from './web-ui-test-dom.ts';

function read(path: string): string {
    return readFileSync(join(import.meta.dirname, '../..', path), 'utf8');
}

const markdownSrc = read('public/js/render/markdown.ts');
const sanitizeSrc = read('public/js/render/sanitize.ts');
const postRenderSrc = read('public/js/render/post-render.ts');
const delegationsSrc = read('public/js/render/delegations.ts');
const messageHistorySrc = read('public/js/features/message-history.ts');
const chatMessagesSrc = read('public/js/features/chat-messages.ts');
const elicitationSrc = read('public/js/features/elicitation.ts');

test.afterEach(() => {
    resetWebUiDom();
});

test('renderer maps elicitation and choice-buttons fences to sanitizer-safe placeholders', async () => {
    setupWebUiDom();
    const { renderMarkdown } = await import('../../public/js/render.ts');

    const spec = JSON.stringify({
        questions: [{
            id: 'scope',
            question: '구현 범위는?',
            type: 'single_select',
            options: [{ id: 'mvp', label: 'MVP', value: 'single_select MVP' }],
        }],
    });
    const elicitationHtml = renderMarkdown(`\`\`\`elicitation\n${spec}\n\`\`\``);
    const aliasHtml = renderMarkdown(`\`\`\`choice-buttons\n${JSON.stringify({ question: '선택?', options: ['A', 'B'] })}\n\`\`\``);

    assert.match(elicitationHtml, /class="elicitation-pending"/);
    assert.match(elicitationHtml, /data-elicitation-kind="elicitation"/);
    assert.match(elicitationHtml, /data-elicitation-spec="/);
    assert.doesNotMatch(elicitationHtml, /<pre><code/);
    assert.doesNotMatch(elicitationHtml, /"questions"/);

    assert.match(aliasHtml, /class="elicitation-pending"/);
    assert.match(aliasHtml, /data-elicitation-kind="choice-buttons"/);
});

test('sanitizer preserves only the placeholder data attributes required for hydration', () => {
    assert.match(sanitizeSrc, /'data-elicitation-kind'/);
    assert.match(sanitizeSrc, /'data-elicitation-spec'/);
    assert.match(sanitizeSrc, /'data-elicitation-hydrated'/);
    assert.match(sanitizeSrc, /FORBID_TAGS:\s*\[[\s\S]*'form'[\s\S]*'input'/);
});

test('hydration is wired through render finalization, live messages, and virtual scroll history', () => {
    assert.match(markdownSrc, /renderElicitationPlaceholder/);
    assert.match(postRenderSrc, /hydrateElicitationBlocks\(msgContainer\)/);
    assert.match(delegationsSrc, /ensureElicitationDelegation\(\)/);

    const lazyIdx = messageHistorySrc.indexOf('vs.onLazyRender = ');
    const postIdx = messageHistorySrc.indexOf('vs.onPostRender = ');
    assert.ok(lazyIdx >= 0, 'message-history must define onLazyRender');
    assert.ok(postIdx >= 0, 'message-history must define onPostRender');
    assert.match(messageHistorySrc.slice(lazyIdx, lazyIdx + 1400), /hydrateElicitationBlocks\(el\)/);
    assert.match(messageHistorySrc.slice(postIdx, postIdx + 700), /hydrateElicitationBlocks\(viewport\)/);

    assert.match(chatMessagesSrc, /hydrateElicitationBlocks\(div\)/);
    assert.match(chatMessagesSrc, /hydrateElicitationBlocks\(viewport\)/);
});

test('elicitation feature avoids chat imports and submits through cmd-execute', () => {
    assert.doesNotMatch(elicitationSrc, /from ['"].*chat(?:\.js)?['"]/);
    assert.doesNotMatch(elicitationSrc, /sendMessage/);
    assert.match(elicitationSrc, /cmd-execute/);
    assert.match(elicitationSrc, /data-elicitation-action="skip"/);
    assert.match(elicitationSrc, /data-elicitation-action="submit-custom"/);
    assert.match(elicitationSrc, /SUBMITTING_STATE/);
    assert.match(elicitationSrc, /block\.remove\(\)/);
});

test('hydrated single-question option click composes a user message and removes wizard', async () => {
    setupWebUiDom();
    const input = document.createElement('textarea');
    input.id = 'chatInput';
    document.body.appendChild(input);

    let sent = 0;
    input.addEventListener('cmd-execute', () => { sent += 1; });

    const { renderMarkdown } = await import('../../public/js/render.ts');
    const { hydrateElicitationBlocks } = await import('../../public/js/features/elicitation.ts');
    const spec = {
        questions: [{
            id: 'scope',
            question: '구현 범위',
            type: 'single_select',
            options: [{
                id: 'mvp',
                label: 'single_select MVP',
                value: 'single_select MVP',
                description: '작게 시작',
            }],
        }],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMarkdown(`\`\`\`elicitation\n${JSON.stringify(spec)}\n\`\`\``);
    document.body.appendChild(wrapper);

    hydrateElicitationBlocks(wrapper);

    const option = wrapper.querySelector<HTMLButtonElement>('.elicitation-option');
    assert.ok(option, 'hydration should render an option button');
    option.click();
    option.click();

    assert.equal(sent, 1);
    assert.equal(wrapper.querySelector('.elicitation-block'), null);
    assert.match(input.value, /구조화 질문 응답:/);
    assert.match(input.value, /- 구현 범위: single_select MVP \(값: single_select MVP\)/);
    assert.match(input.value, /위 응답을 기준으로 계속 진행해줘\./);
});
