// Cursor model/effort helpers.
// Cursor CLI does not expose --effort; effort is encoded in account model IDs.

const CURSOR_EFFORT_SUFFIX: Record<string, string> = {
    none: 'none',
    'none-fast': 'none-fast',
    low: 'low',
    'low-fast': 'low-fast',
    medium: 'medium',
    'medium-fast': 'medium-fast',
    high: 'high',
    'high-fast': 'high-fast',
    xhigh: 'extra-high',
    'xhigh-fast': 'extra-high-fast',
    max: 'max',
    'max-fast': 'max-fast',
};

const CURSOR_EFFORTS = new Set(Object.keys(CURSOR_EFFORT_SUFFIX));

const CURSOR_BASE_MODELS = new Set([
    'auto',
    'composer-2.5',
    'composer-2',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.3-codex',
    'gpt-5.2',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'claude-opus-4-7',
    'claude-opus-4-7-thinking',
    'claude-4.6-opus',
    'claude-4.6-opus-thinking',
    'claude-4.6-sonnet',
    'gemini-3.1-pro',
    'grok-4.3',
]);

function normalizeCursorValue(value: string | null | undefined): string {
    return String(value || '').trim();
}

function cursorEffortSuffix(base: string, effort: string): string | undefined {
    if ((effort === 'xhigh' || effort === 'xhigh-fast') && base !== 'gpt-5.5') {
        return effort;
    }
    return CURSOR_EFFORT_SUFFIX[effort];
}

export function isCursorFullModelId(model: string): boolean {
    const value = normalizeCursorValue(model);
    if (!value || value === 'default') return false;
    if (CURSOR_BASE_MODELS.has(value)) return false;
    return /-(none|low|medium|high|max|extra-high|xhigh)(-fast)?$/i.test(value)
        || /^composer-\d+(?:\.\d+)?-fast$/i.test(value);
}

export function resolveCursorModelVariant(model: string, effort: string): string {
    const base = normalizeCursorValue(model);
    const selectedEffort = normalizeCursorValue(effort);
    if (!base || base === 'default') return base || 'default';
    if (base === 'auto') return 'auto';
    if (isCursorFullModelId(base)) return base;

    if (base.startsWith('composer-')) {
        return selectedEffort === 'fast' || selectedEffort === 'medium-fast'
            ? `${base}-fast`
            : base;
    }

    if (!selectedEffort || !CURSOR_EFFORTS.has(selectedEffort)) return base;
    const suffix = cursorEffortSuffix(base, selectedEffort);
    return suffix ? `${base}-${suffix}` : base;
}
