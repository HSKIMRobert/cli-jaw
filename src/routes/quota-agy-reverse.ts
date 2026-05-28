// Reverse-engineered Antigravity / AGY quota reader.

import { execFileSync } from 'child_process';
import { stripUndefined } from '../core/strip-undefined.js';
import { fetchGeminiUsage, readGeminiAccount } from './quota.js';

type QuotaRecord = Record<string, unknown>;

interface AntigravityModelQuota {
    label?: string;
    modelId?: string;
    remainingPercentage?: number;
    isExhausted?: boolean;
    resetTime?: string;
    isAutocompleteOnly?: boolean;
}

interface AntigravityQuotaSnapshot {
    method?: string;
    email?: string;
    planType?: string;
    models?: AntigravityModelQuota[];
}

function asRecord(value: unknown): QuotaRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as QuotaRecord
        : null;
}

function usedPercentFromRemaining(remaining?: number, exhausted?: boolean): number {
    if (exhausted) return 100;
    if (remaining == null || !Number.isFinite(remaining)) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - remaining) * 100)));
}

export function normalizeAntigravityUsageSnapshot(snapshot: AntigravityQuotaSnapshot): QuotaRecord {
    const models = Array.isArray(snapshot.models) ? snapshot.models : [];
    const windows = models
        .filter((model) => !model.isAutocompleteOnly)
        .slice(0, 8)
        .map((model) => stripUndefined({
            label: model.label || model.modelId || 'Model',
            percent: usedPercentFromRemaining(model.remainingPercentage, model.isExhausted),
            resetsAt: model.resetTime ?? null,
            modelId: model.modelId,
        }));

    return stripUndefined({
        authenticated: true,
        quotaCapable: windows.length > 0,
        quotaSource: `agy:antigravity-usage:${snapshot.method || 'auto'}`,
        displayTier: snapshot.planType ? `Antigravity ${snapshot.planType}` : 'Antigravity',
        account: stripUndefined({
            type: 'antigravity.google',
            tier: snapshot.planType ?? 'Google Cloud Code',
            email: snapshot.email,
        }),
        windows,
        reverseEngineered: true,
    });
}

function runAntigravityUsageJson(): AntigravityQuotaSnapshot | null {
    const commands: Array<[string, string[]]> = [
        ['antigravity-usage', ['--json']],
        ['npx', ['--yes', 'antigravity-usage', '--json']],
    ];
    for (const [binary, args] of commands) {
        try {
            const out = execFileSync(binary, args, {
                encoding: 'utf8',
                timeout: 15000,
                stdio: ['ignore', 'pipe', 'pipe'],
            }).trim();
            if (!out.startsWith('{')) continue;
            return JSON.parse(out) as AntigravityQuotaSnapshot;
        } catch {
            continue;
        }
    }
    return null;
}

function buildAgyStatusOnly(): QuotaRecord {
    return stripUndefined({
        authenticated: true,
        quotaCapable: false,
        quotaSource: 'not-exposed-by-agy-cli',
        displayTier: 'Antigravity',
        account: { type: 'antigravity.google', tier: 'runtime-checked' },
        windows: [],
        reverseEngineered: false,
    });
}

export async function fetchAgyUsage(): Promise<QuotaRecord> {
    const snapshot = runAntigravityUsageJson();
    if (snapshot?.models?.length) {
        return normalizeAntigravityUsageSnapshot(snapshot);
    }

    const geminiAccount = readGeminiAccount();
    if (geminiAccount) {
        const geminiUsage = await fetchGeminiUsage(geminiAccount);
        if (geminiUsage && !geminiUsage.error && Array.isArray(geminiUsage.windows) && geminiUsage.windows.length > 0) {
            return stripUndefined({
                ...geminiUsage,
                quotaCapable: true,
                quotaSource: 'agy:google-cloud-code-api',
                displayTier: 'Antigravity',
                account: stripUndefined({
                    type: 'antigravity.google',
                    tier: 'Google Cloud Code',
                    email: geminiUsage.account?.email,
                }),
                reverseEngineered: true,
            });
        }
        if (geminiUsage?.authenticated === false) {
            return stripUndefined({
                ...buildAgyStatusOnly(),
                authenticated: false,
            });
        }
    }

    return buildAgyStatusOnly();
}
