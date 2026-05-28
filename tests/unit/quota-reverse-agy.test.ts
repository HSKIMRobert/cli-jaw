import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAntigravityUsageSnapshot } from '../../src/routes/quota-agy-reverse.ts';

test('normalizeAntigravityUsageSnapshot converts remaining percentage to used percent bars', () => {
    const result = normalizeAntigravityUsageSnapshot({
        method: 'google',
        email: 'user@example.com',
        planType: 'Google AI Pro',
        models: [
            {
                label: 'Gemini 3.1 Pro (Low)',
                modelId: 'gemini-3.1-pro-low',
                remainingPercentage: 0.25,
                resetTime: '2026-05-28T18:00:00.000Z',
            },
            {
                label: 'Claude Sonnet 4.6 (Thinking)',
                modelId: 'claude-sonnet-4-6-thinking',
                remainingPercentage: 1,
                isExhausted: false,
            },
            {
                label: 'Autocomplete',
                modelId: 'gemini-2.5-flash-002',
                remainingPercentage: 0.5,
                isAutocompleteOnly: true,
            },
        ],
    });

    assert.equal(result.quotaCapable, true);
    assert.equal(result.quotaSource, 'agy:antigravity-usage:google');
    assert.equal(result.windows?.length, 2);
    assert.equal(result.windows?.[0]?.label, 'Gemini 3.1 Pro (Low)');
    assert.equal(result.windows?.[0]?.percent, 75);
    assert.equal(result.windows?.[1]?.percent, 0);
});
