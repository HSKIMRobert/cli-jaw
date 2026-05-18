// ── Shared constants (frontend) ──
import { api } from './api.js';

export interface CliEntry {
    label: string;
    efforts: string[];
    models: string[];
    defaultProvider?: string;
    providers?: string[];
    modelsByProvider?: Record<string, string[]>;
    effortsByProvider?: Record<string, string[]>;
    effortNote?: string;
}

export type CliRegistry = Record<string, CliEntry>;

const FALLBACK_CLI_REGISTRY: CliRegistry = {
    'ai-e': {
        label: 'AI-E',
        defaultProvider: 'claude',
        providers: ['claude', 'codex', 'gemini', 'grok', 'copilot'],
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        models: [
            'opus', 'sonnet', 'haiku',
            'gpt-5.4', 'gpt-5.4-mini',
            'gemini-3-flash-preview',
            'grok-build',
            'gpt-5-mini',
        ],
        modelsByProvider: {
            claude: ['opus', 'sonnet', 'haiku'],
            codex: ['gpt-5.4', 'gpt-5.4-mini'],
            gemini: ['gemini-3-flash-preview'],
            grok: ['grok-build'],
            copilot: ['gpt-5-mini'],
        },
        effortsByProvider: {
            claude: ['low', 'medium', 'high', 'xhigh', 'max'],
            codex: ['low', 'medium', 'high', 'xhigh'],
            gemini: [],
            grok: [],
            copilot: ['low', 'medium', 'high'],
        },
    },
    claude: {
        label: 'Claude',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        // Mirrors getDefaultClaudeChoices() in src/cli/claude-models.ts —
        // aliases first, then verified pinned full IDs (hyphen form). The
        // [1m] suffix activates Claude Code's 1M-context window (Opus 4.7,
        // Opus 4.6, Sonnet 4.6 only).
        models: [
            'opus',
            'sonnet',
            'sonnet[1m]',
            'haiku',
            'claude-opus-4-7',
            'claude-opus-4-7[1m]',
            'claude-opus-4-6',
            'claude-opus-4-6[1m]',
            'claude-sonnet-4-6',
            'claude-sonnet-4-6[1m]',
            'claude-haiku-4-5',
        ],
    },
    'claude-e': {
        label: 'Claude E',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        models: [
            'opus',
            'sonnet',
            'haiku',
            'claude-opus-4-7',
            'claude-sonnet-4-6',
            'claude-haiku-4-5',
        ],
    },
    codex: {
        label: 'Codex',
        efforts: ['low', 'medium', 'high', 'xhigh'],
        models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
    },
    'codex-app': {
        label: 'Codex App',
        efforts: ['low', 'medium', 'high', 'xhigh'],
        models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'],
    },
    gemini: {
        label: 'Gemini',
        efforts: [],
        models: ['gemini-3.0-pro-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
    },
    grok: {
        label: 'Grok',
        efforts: [],
        effortNote: 'unsupported by grok-build; do not pass --effort',
        models: ['grok-build'],
    },
    opencode: {
        label: 'OpenCode',
        efforts: ['minimal', 'low', 'high', 'max'],
        models: [
            'opencode-go/glm-5.1',
            'opencode-go/kimi-k2.6',
            'opencode-go/mimo-v2.5-pro',
            'opencode-go/mimo-v2.5',
            'opencode-go/minimax-m2.7',
            'opencode-go/qwen3.6-plus',
            'opencode-go/deepseek-v4-pro',
            'opencode-go/deepseek-v4-flash',
        ],
    },
    copilot: {
        label: 'Copilot',
        efforts: ['low', 'medium', 'high'],
        effortNote: '-> ~/.copilot/config.json',
        models: [
            'gpt-5.5',
            'claude-sonnet-4.6',
            'claude-haiku-4.5',
            'gpt-5.4',
            'gpt-5.3-codex',
            'gpt-5.2-codex',
            'gpt-5.1-codex',
            'gpt-4.1',
            'gpt-5-mini',
            'gemini-3-pro-preview',
        ],
    },
};

type ModelMap = Record<string, string[]>;

function toModelMap(registry: CliRegistry): ModelMap {
    const out: ModelMap = {};
    for (const [key, value] of Object.entries(registry)) {
        out[key] = Array.isArray(value?.models) ? [...value.models] : [];
    }
    return out;
}

function normalizeRegistry(input: Record<string, unknown>): CliRegistry {
    const out: CliRegistry = {};
    for (const [key, value] of Object.entries(input || {})) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const normalized: CliEntry = {
            label: (v['label'] as string) || key,
            efforts: Array.isArray(v['efforts']) ? [...v['efforts']] as string[] : [],
            models: Array.isArray(v['models']) ? [...v['models']] as string[] : [],
        };
        if (typeof v['effortNote'] === 'string' && v['effortNote'].trim()) {
            normalized['effortNote'] = v['effortNote'];
        }
        if (typeof v['defaultProvider'] === 'string') normalized.defaultProvider = v['defaultProvider'];
        if (Array.isArray(v['providers'])) normalized.providers = [...v['providers']] as string[];
        if (v['modelsByProvider'] && typeof v['modelsByProvider'] === 'object') {
            normalized.modelsByProvider = Object.fromEntries(
                Object.entries(v['modelsByProvider'] as Record<string, unknown>)
                    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
                    .map(([provider, models]) => [provider, [...models]])
            );
        }
        if (v['effortsByProvider'] && typeof v['effortsByProvider'] === 'object') {
            normalized.effortsByProvider = Object.fromEntries(
                Object.entries(v['effortsByProvider'] as Record<string, unknown>)
                    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
                    .map(([provider, efforts]) => [provider, [...efforts]])
            );
        }
        out[key] = normalized;
    }
    return out;
}

export let CLI_REGISTRY: CliRegistry = normalizeRegistry(FALLBACK_CLI_REGISTRY as unknown as Record<string, unknown>);
export let CLI_KEYS: string[] = Object.keys(CLI_REGISTRY);
export let MODEL_MAP: ModelMap = toModelMap(CLI_REGISTRY);

function applyRegistry(registry: Record<string, unknown>): boolean {
    const normalized = normalizeRegistry(registry);
    if (!Object.keys(normalized).length) return false;
    CLI_REGISTRY = normalized;
    CLI_KEYS = Object.keys(normalized);
    MODEL_MAP = toModelMap(normalized);
    return true;
}

export async function loadCliRegistry(): Promise<CliRegistry> {
    try {
        const data = await api<Record<string, unknown>>('/api/cli-registry');
        if (!data || !applyRegistry(data)) throw new Error('invalid registry');
    } catch (e) {
        console.warn('[cli-registry] fallback:', (e as Error).message);
        applyRegistry(FALLBACK_CLI_REGISTRY as unknown as Record<string, unknown>);
    }
    return CLI_REGISTRY;
}

export function getCliKeys(): string[] {
    return CLI_KEYS;
}

export function getCliMeta(cli: string): CliEntry | null {
    return CLI_REGISTRY[cli] || null;
}

export const PRIMARY_CLIS: readonly string[] = ['claude', 'codex', 'gemini'];

export interface RolePreset {
    value: string;
    labelKey: string;
    label: string;
    prompt: string;
    skill: string | null;
}

export const ROLE_PRESETS: readonly RolePreset[] = [
    { value: 'frontend', labelKey: 'role.label.frontend', label: 'Frontend', prompt: 'Frontend employee — UI/UX, CSS, components', skill: 'dev-frontend' },
    { value: 'backend', labelKey: 'role.label.backend', label: 'Backend', prompt: 'Backend employee — API, DB, server logic', skill: 'dev-backend' },
    { value: 'data', labelKey: 'role.label.data', label: 'Data', prompt: 'Data employee — data pipeline, analysis, ML', skill: 'dev-data' },
    { value: 'docs', labelKey: 'role.label.docs', label: 'Docs', prompt: 'Docs employee — documentation, README, API docs', skill: 'documentation' },
    { value: 'custom', labelKey: 'role.label.custom', label: 'Custom...', prompt: '', skill: null },
] as const;
