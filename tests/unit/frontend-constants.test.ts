import test from 'node:test';
import assert from 'node:assert/strict';
import { getCliMeta } from '../../public/js/constants.js';

test('frontend copilot meta exposes selectable efforts', () => {
    const meta = getCliMeta('copilot');
    assert.ok(meta, 'copilot metadata missing');
    assert.deepEqual(meta.efforts, ['low', 'medium', 'high']);
});

test('frontend copilot meta preserves effortNote hint', () => {
    const meta = getCliMeta('copilot');
    assert.equal(meta.effortNote, '-> ~/.copilot/config.json');
});

test('frontend cursor meta exposes model-ID effort choices', () => {
    const meta = getCliMeta('cursor');
    assert.ok(meta, 'cursor metadata missing');
    assert.ok(meta.models.includes('gpt-5.5'));
    assert.ok(meta.efforts.includes('medium-fast'));
    assert.match(meta.effortNote || '', /model IDs/);
});
