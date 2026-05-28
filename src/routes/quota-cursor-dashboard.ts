// Reverse-engineered Cursor dashboard quota reader (unofficial API).

import { execFileSync } from 'child_process';
import { stripUndefined } from '../core/strip-undefined.js';

const CURSOR_USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary';

type QuotaRecord = Record<string, unknown>;

function readCursorJsonCommand(binary: string, command: string, args: string[] = []): QuotaRecord | null {
    try {
        const out = execFileSync(binary, [command, ...args], {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const parsed = JSON.parse(out) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as QuotaRecord
            : null;
    } catch {
        return null;
    }
}

export function readCursorDashboardSessionToken(): string | null {
    for (const key of ['CURSOR_SESSION_TOKEN', 'CURSOR_DASHBOARD_SESSION_TOKEN']) {
        const value = process.env[key]?.trim();
        if (value) return value;
    }
    return null;
}

export function readCursorStatus(binary = 'cursor-agent'): QuotaRecord {
    let authenticated = false;
    let source = 'none';
    let subscriptionTier: string | undefined;
    let cliVersion: string | undefined;
    let userEmail: string | undefined;
    let defaultModel: string | undefined;

    if (process.env["CURSOR_API_KEY"]?.trim()) {
        authenticated = true;
        source = 'CURSOR_API_KEY';
    }

    const status = readCursorJsonCommand(binary, 'status', ['--format', 'json']);
    if (status) {
        authenticated = status["isAuthenticated"] === true
            || status["status"] === 'authenticated'
            || authenticated;
        const userInfo = status["userInfo"];
        if (userInfo && typeof userInfo === 'object' && !Array.isArray(userInfo)) {
            const email = (userInfo as QuotaRecord)["email"];
            if (typeof email === 'string' && email.trim()) userEmail = email;
        }
        if (authenticated && source === 'none') source = 'cursor-agent status';
    }

    const about = readCursorJsonCommand(binary, 'about', ['--format', 'json']);
    if (about) {
        if (typeof about["subscriptionTier"] === 'string') subscriptionTier = about["subscriptionTier"];
        if (typeof about["cliVersion"] === 'string') cliVersion = about["cliVersion"];
        if (typeof about["model"] === 'string') defaultModel = about["model"];
        if (typeof about["userEmail"] === 'string' && about["userEmail"].trim()) {
            userEmail = about["userEmail"];
        }
        if (authenticated && source === 'none') source = 'cursor-agent about';
    }

    return stripUndefined({
        authenticated,
        quotaCapable: false,
        quotaSource: 'not-exposed-by-cursor-cli',
        futureQuotaHook: 'cursor-dashboard-unofficial-api',
        displayTier: subscriptionTier ? `Cursor ${subscriptionTier}` : 'Cursor',
        account: stripUndefined({
            type: 'cursor',
            tier: subscriptionTier ?? 'auth/status only',
            email: userEmail,
        }),
        source,
        cliVersion,
        defaultModel,
        subscriptionTier,
        windows: [],
    });
}

function asRecord(value: unknown): QuotaRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as QuotaRecord
        : null;
}

function numberField(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeCursorUsageSummary(data: QuotaRecord): QuotaRecord {
    const individualUsage = asRecord(data["individualUsage"]);
    const plan = asRecord(individualUsage?.["plan"]);
    const windows: Array<{ label: string; percent: number; resetsAt?: string | null }> = [];
    const resetsAt = typeof data["billingCycleEnd"] === 'string' ? data["billingCycleEnd"] : null;
    const membershipType = typeof data["membershipType"] === 'string' ? data["membershipType"] : undefined;

    const totalPercentUsed = numberField(plan?.["totalPercentUsed"]);
    const apiPercentUsed = numberField(plan?.["apiPercentUsed"]);
    const autoPercentUsed = numberField(plan?.["autoPercentUsed"]);

    if (totalPercentUsed != null) {
        windows.push({ label: 'Cycle', percent: Math.round(totalPercentUsed), resetsAt });
    } else if (apiPercentUsed != null) {
        windows.push({ label: 'API', percent: Math.round(apiPercentUsed), resetsAt });
    }
    if (autoPercentUsed != null && autoPercentUsed > 0) {
        windows.push({ label: 'Auto', percent: Math.round(autoPercentUsed), resetsAt });
    }

    return stripUndefined({
        authenticated: true,
        quotaCapable: windows.length > 0,
        quotaSource: 'cursor-dashboard-unofficial-api',
        displayTier: membershipType ? `Cursor ${membershipType}` : 'Cursor',
        account: stripUndefined({
            type: 'cursor',
            tier: membershipType,
            plan: membershipType,
        }),
        windows,
        billingCycleStart: data["billingCycleStart"],
        billingCycleEnd: data["billingCycleEnd"],
        planUsed: plan?.["used"],
        planLimit: plan?.["limit"],
        planRemaining: plan?.["remaining"],
        reverseEngineered: true,
    });
}

export async function fetchCursorDashboardUsage(sessionToken: string): Promise<QuotaRecord | null> {
    try {
        const resp = await fetch(CURSOR_USAGE_SUMMARY_URL, {
            headers: { Cookie: `WorkosCursorSessionToken=${sessionToken}` },
            signal: AbortSignal.timeout(8000),
        });
        if (resp.status === 401 || resp.status === 403) {
            return { authenticated: false, reason: 'dashboard_session_expired' };
        }
        if (!resp.ok) return { error: true };
        const data = await resp.json() as QuotaRecord;
        return normalizeCursorUsageSummary(data);
    } catch {
        return { error: true };
    }
}

function mergeCursorQuota(base: QuotaRecord, overlay: QuotaRecord | null): QuotaRecord {
    if (!overlay) return base;
    if (overlay["authenticated"] === false) {
        return stripUndefined({
            ...base,
            dashboardAuth: false,
            dashboardHint: 'Set CURSOR_SESSION_TOKEN from cursor.com dashboard cookie WorkosCursorSessionToken',
        });
    }
    if (overlay["error"]) {
        return stripUndefined({ ...base, error: true, reason: 'dashboard_fetch_failed' });
    }
    return stripUndefined({
        ...base,
        ...overlay,
        authenticated: base["authenticated"] !== false,
        account: { ...(asRecord(base["account"]) || {}), ...(asRecord(overlay["account"]) || {}) },
    });
}

export async function fetchCursorUsage(binary = 'cursor-agent'): Promise<QuotaRecord> {
    const base = readCursorStatus(binary);
    const sessionToken = readCursorDashboardSessionToken();
    if (!sessionToken) return base;
    const dashboard = await fetchCursorDashboardUsage(sessionToken);
    return mergeCursorQuota(base, dashboard);
}
