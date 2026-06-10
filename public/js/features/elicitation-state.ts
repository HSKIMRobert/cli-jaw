type QuestionType = 'single_select' | 'multi_select' | 'rank_priorities';
type VisibleWhen = Record<string, string[]>;

interface RawOption {
    id?: unknown;
    value?: unknown;
    label?: unknown;
    description?: unknown;
    submitText?: unknown;
}

interface RawQuestion {
    id?: unknown;
    type?: unknown;
    question?: unknown;
    title?: unknown;
    prompt?: unknown;
    options?: unknown;
    visibleWhen?: unknown;
}

export interface NormalizedOption {
    id: string;
    value: string;
    label: string;
    description: string;
    submitText: string;
}

export interface NormalizedQuestion {
    id: string;
    type: QuestionType;
    question: string;
    options: NormalizedOption[];
    visibleWhen: VisibleWhen;
}

export interface NormalizedSpec {
    questions: NormalizedQuestion[];
}

export interface MessageLike {
    role: string;
    content: string;
}

const STORAGE_PREFIX = 'jaw:elicitation:complete';
const STRUCTURED_RESPONSE_MARKER = '구조화 질문 응답:';

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseSpec(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeType(value: unknown): QuestionType {
    const raw = asString(value);
    if (raw === 'multi_select' || raw === 'multi' || raw === 'checkbox') return 'multi_select';
    if (raw === 'rank_priorities' || raw === 'rank' || raw === 'ranking') return 'rank_priorities';
    return 'single_select';
}

function normalizeOptions(rawOptions: unknown): NormalizedOption[] {
    if (!Array.isArray(rawOptions)) return [];
    return rawOptions.map((option, index): NormalizedOption | null => {
        if (typeof option === 'string') {
            const label = option.trim();
            if (!label) return null;
            return { id: `option_${index + 1}`, value: label, label, description: '', submitText: '' };
        }
        if (!option || typeof option !== 'object') return null;
        const raw = option as RawOption;
        const label = asString(raw.label) || asString(raw.value) || asString(raw.id);
        if (!label) return null;
        const value = asString(raw.value) || label;
        return {
            id: asString(raw.id) || value || `option_${index + 1}`,
            value,
            label,
            description: asString(raw.description),
            submitText: asString(raw.submitText),
        };
    }).filter((option): option is NormalizedOption => Boolean(option));
}

function normalizeVisibleWhen(value: unknown): VisibleWhen {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const visibleWhen: VisibleWhen = {};
    for (const [rawKey, rawAllowed] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.trim();
        if (!key) continue;
        const allowed = Array.isArray(rawAllowed)
            ? rawAllowed.map(asString).filter(Boolean)
            : [asString(rawAllowed)].filter(Boolean);
        if (allowed.length > 0) visibleWhen[key] = allowed;
    }
    return visibleWhen;
}

function normalizeQuestion(rawQuestion: unknown, index: number): NormalizedQuestion | null {
    if (!rawQuestion || typeof rawQuestion !== 'object') return null;
    const raw = rawQuestion as RawQuestion;
    const question = asString(raw.question) || asString(raw.title) || asString(raw.prompt);
    if (!question) return null;
    return {
        id: asString(raw.id) || `q${index + 1}`,
        type: normalizeType(raw.type),
        question,
        options: normalizeOptions(raw.options),
        visibleWhen: normalizeVisibleWhen(raw.visibleWhen),
    };
}

export function normalizeElicitationSpec(rawSpec: unknown): NormalizedSpec | null {
    if (!rawSpec || typeof rawSpec !== 'object') return null;
    const spec = rawSpec as { questions?: unknown; question?: unknown; options?: unknown; type?: unknown };
    const questions = Array.isArray(spec.questions)
        ? spec.questions
        : [{ question: spec.question, options: spec.options, type: spec.type }];
    const normalized = questions
        .map((question, index) => normalizeQuestion(question, index))
        .filter((question): question is NormalizedQuestion => Boolean(question));
    return normalized.length > 0 ? { questions: normalized } : null;
}

export function parseElicitationSpec(raw: string): NormalizedSpec | null {
    return normalizeElicitationSpec(parseSpec(raw));
}

export function extractElicitationSpecs(content: string): string[] {
    const specs: string[] = [];
    const re = /^ {0,3}```(?:elicitation|choice-buttons)[^\n]*\n([\s\S]*?)^ {0,3}```/gm;
    for (const match of content.matchAll(re)) {
        const raw = match[1]?.trim();
        if (raw) specs.push(raw);
    }
    return specs;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashText(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function currentScope(): string {
    const locationKey = typeof window === 'undefined' ? 'unknown' : `${window.location.origin}${window.location.pathname}`;
    let messageScope = 'default';
    try { messageScope = localStorage.getItem('clijaw_scope') || 'default'; } catch { /* storage unavailable */ }
    return hashText(`${locationKey}::${messageScope}`);
}

export function specHash(spec: NormalizedSpec): string {
    return hashText(stableStringify(spec));
}

export function completionStorageKey(input: { turnIndex: number; blockIndex: number; spec: NormalizedSpec }): string {
    return `${STORAGE_PREFIX}:${currentScope()}:${input.turnIndex}:${input.blockIndex}:${specHash(input.spec)}`;
}

export function completionKeyForBlock(block: HTMLElement, spec: NormalizedSpec): string | null {
    const msg = block.closest<HTMLElement>('.msg');
    const rawTurnIndex = msg?.dataset['turnIndex'] || '';
    const turnIndex = Number(rawTurnIndex);
    if (!Number.isFinite(turnIndex) || turnIndex < 0) return null;
    const owner = block.closest<HTMLElement>('.msg-content') || msg;
    const siblings = owner
        ? Array.from(owner.querySelectorAll<HTMLElement>('.elicitation-pending, .elicitation-block'))
        : [block];
    const blockIndex = Math.max(0, siblings.indexOf(block));
    return completionStorageKey({ turnIndex, blockIndex, spec });
}

export function isElicitationCompleted(key: string | null): boolean {
    if (!key) return false;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function markElicitationCompleted(key: string | null): void {
    if (!key) return;
    try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
}

function isAssistantRole(role: string): boolean {
    return role === 'assistant' || role === 'agent';
}

function isUserStructuredResponse(message: MessageLike | undefined): boolean {
    return message?.role === 'user' && message.content.includes(STRUCTURED_RESPONSE_MARKER);
}

function responseMatchesSpec(response: string, spec: NormalizedSpec): boolean {
    return spec.questions.some(question => response.includes(question.question));
}

export function seedCompletedElicitationsFromMessages(messages: MessageLike[]): void {
    messages.forEach((message, turnIndex) => {
        if (!isAssistantRole(message.role)) return;
        const next = messages[turnIndex + 1];
        if (!isUserStructuredResponse(next)) return;
        extractElicitationSpecs(message.content).forEach((rawSpec, blockIndex) => {
            const spec = parseElicitationSpec(rawSpec);
            if (!spec || !responseMatchesSpec(next.content, spec)) return;
            markElicitationCompleted(completionStorageKey({ turnIndex, blockIndex, spec }));
        });
    });
}
