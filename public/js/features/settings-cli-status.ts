// ── CLI Status & Quota ──
import { api } from '../api.js';
import { escapeHtml } from '../render.js';
import { t } from './i18n.js';
import { state } from '../state.js';
import { ICONS } from '../icons.js';
import { providerIcon, providerLabel } from '../provider-icons.js';
import type { QuotaEntry } from './settings-types.js';

const CLI_STATUS_INTERVAL_VALUES = new Set([0, 600, 1800]);
const DEFAULT_CLI_STATUS_INTERVAL_SEC = 0;
/** Defer heavy /api/quota so chat/history APIs win on initial page load. */
const QUOTA_LOAD_DEFER_MS = 2000;

const QUOTA_HIDDEN_CLIS = new Set(['ai-e', 'codex-app']);
const QUOTA_CUSTOM_MSG: Record<string, string> = {
    claude: 'Currently subscribed, by June with credit',
};

type QuotaSetupHint = {
    title: string;
    commands: string[];
    note?: string;
};

/** Actionable setup when plan quota is not wired yet (quotaCapable=false). */
const QUOTA_SETUP_HINTS: Record<string, QuotaSetupHint> = {
    cursor: {
        title: 'Enable quota bars (dashboard session)',
        commands: [
            'cursor-agent login',
            'export CURSOR_SESSION_TOKEN="<WorkosCursorSessionToken from cursor.com DevTools>"',
            'echo "$CURSOR_SESSION_TOKEN" > ~/.cli-jaw/quota/cursor-session-token && chmod 600 ~/.cli-jaw/quota/cursor-session-token',
        ],
    },
    agy: {
        title: 'Enable Gem / Cla quota bars',
        commands: [
            'npx antigravity-usage login',
            'npx antigravity-usage --json',
        ],
    },
    grok: {
        title: 'Grok Build auth (plan quota not in grok CLI)',
        commands: [
            'grok login --oauth',
            'grok models   # verify auth',
        ],
        note: 'Subscription remaining quota: xAI console only. No official grok quota subcommand.',
    },
    opencode: {
        title: 'OpenCode auth + optional plan quota plugin',
        commands: [
            'opencode auth login',
            'opencode plugin add @slkiser/opencode-quota',
            'npx @slkiser/opencode-quota show',
        ],
        note: 'Built-in opencode stats shows session tokens/cost, not subscription limits. opencode-go/* models use the same CLI.',
    },
};

let cliStatusTimer: number | null = null;
let cliStatusPreviewHooksRegistered = false;
let cliStatusLoadSeq = 0;
let cliStatusLoadInFlight: Promise<void> | null = null;

const CLI_STATUS_COLLAPSED_KEY = 'cliStatusCollapsed';

export function isEmbeddedPreviewFrame(): boolean {
    try {
        return window.parent !== window;
    } catch {
        return true;
    }
}

function readCliStatusCollapsed(): boolean {
    try { return localStorage.getItem(CLI_STATUS_COLLAPSED_KEY) === 'true'; }
    catch { return false; }
}

function saveCliStatusCollapsed(collapsed: boolean): void {
    try { localStorage.setItem(CLI_STATUS_COLLAPSED_KEY, collapsed ? 'true' : 'false'); }
    catch { /* ignore */ }
}

let cliStatusExpanded = !readCliStatusCollapsed();

export function isCliStatusExpanded(): boolean {
    return cliStatusExpanded;
}

export function expandCliStatus(): void {
    cliStatusExpanded = true;
    const list = document.getElementById('cliStatusList');
    const header = document.getElementById('cliStatusHeader');
    if (list) list.style.display = 'block';
    if (header) header.classList.add('expanded');
    saveCliStatusCollapsed(false);
    void loadCliStatus(true);
}

export function initCliStatusToggle(): void {
    const header = document.getElementById('cliStatusHeader');
    const list = document.getElementById('cliStatusList');
    if (!header || !list) return;

    if (!cliStatusExpanded) {
        list.style.display = 'none';
    } else {
        list.style.display = 'block';
        header.classList.add('expanded');
    }

    header.addEventListener('click', () => {
        cliStatusExpanded = !cliStatusExpanded;
        list.style.display = cliStatusExpanded ? 'block' : 'none';
        header.classList.toggle('expanded', cliStatusExpanded);
        saveCliStatusCollapsed(!cliStatusExpanded);
        if (cliStatusExpanded) void loadCliStatus(true);
    });
}

function readCliStatusInterval(): number {
    const raw = Number(localStorage.getItem('cliStatusInterval') || DEFAULT_CLI_STATUS_INTERVAL_SEC);
    return CLI_STATUS_INTERVAL_VALUES.has(raw) ? raw : DEFAULT_CLI_STATUS_INTERVAL_SEC;
}

function syncCliStatusIntervalSelect(interval = readCliStatusInterval()): void {
    const select = document.getElementById('cliStatusInterval') as HTMLSelectElement | null;
    if (!select) return;
    const value = String(interval);
    select.value = Array.from(select.options).some(option => option.value === value)
        ? value
        : String(DEFAULT_CLI_STATUS_INTERVAL_SEC);
}

export function scheduleCliStatusRefresh(): void {
    if (cliStatusTimer != null) {
        window.clearInterval(cliStatusTimer);
        cliStatusTimer = null;
    }

    const interval = readCliStatusInterval();
    syncCliStatusIntervalSelect(interval);
    if (interval <= 0) return;

    cliStatusTimer = window.setInterval(() => {
        if (document.hidden || !cliStatusExpanded) return;
        // Parent dashboard keeps focus while iframe preview is visible.
        if (!isEmbeddedPreviewFrame() && !document.hasFocus()) return;
        void loadCliStatus(true);
    }, interval * 1000);
}

export function initCliStatusPreviewHooks(): void {
    if (cliStatusPreviewHooksRegistered || !isEmbeddedPreviewFrame()) return;
    cliStatusPreviewHooksRegistered = true;
    window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: unknown; visible?: unknown } | null;
        if (data?.type !== 'jaw-preview-visibility' || data.visible !== true) return;
        if (!cliStatusExpanded) return;
        void loadCliStatus(false);
    });
}

export function setCliStatusInterval(value: string): void {
    const parsed = Number(value);
    const interval = CLI_STATUS_INTERVAL_VALUES.has(parsed) ? parsed : DEFAULT_CLI_STATUS_INTERVAL_SEC;
    localStorage.setItem('cliStatusInterval', String(interval));
    syncCliStatusIntervalSelect(interval);
    scheduleCliStatusRefresh();
}

export function normalizeQuotaWindowLabel(cliName: string, label: string): string {
    if (cliName === 'gemini') {
        if (label === 'Pro' || label === 'P') return 'P';
        if (label === 'Flash' || label === 'F') return 'F';
        return label;
    }

    if (cliName === 'copilot') {
        if (label === 'Premium' || label === 'Prem') return '30d';
        if (label.includes('plus monthly subscriber quota')) return '30d';
    }

    return label
        .replace('-hour', 'h')
        .replace('-day', 'd')
        .replace(' Sonnet', '')
        .replace(' Opus', '');
}

function describeStatusOnlyQuota(cliName: string, q: QuotaEntry): string {
    if (q.delegatedProvider) return `Delegates quota/status to ${q.delegatedProvider}`;
    const match = q.quotaSource?.match(/^not-exposed-by-(.*?)-cli$/);
    if (match) return `Quota not exposed by ${match[1].toUpperCase()} CLI`;
    if (q.quotaSource) return q.quotaSource;
    return cliName === 'opencode' ? 'Auth/status only' : 'Usage data not exposed by this CLI';
}

function normalizeAccountToken(value: string): string {
    return value.toLowerCase().replace(/^cursor\s+/i, '').trim();
}

const ACCOUNT_LABEL_SKIP = new Set([
    'auth/status only',
    'google cloud code',
    'runtime-checked',
]);

const PROVIDER_ACCOUNT_TYPES = new Set([
    'cursor',
    'antigravity.google',
    'antigravity',
    'max',
    'copilot',
    'gemini',
]);

function buildAccountParts(_cliName: string, q: QuotaEntry): string[] {
    const account = q.account;
    if (!account) return [];

    const parts: string[] = [];
    if (account.email) parts.push(account.email);

    const seen = new Set(parts.map(normalizeAccountToken));
    for (const value of [account.plan, account.tier]) {
        if (!value) continue;
        const norm = normalizeAccountToken(value);
        if (!norm || ACCOUNT_LABEL_SKIP.has(norm)) continue;
        if (PROVIDER_ACCOUNT_TYPES.has(norm)) continue;
        if (seen.has(norm)) continue;
        seen.add(norm);
        parts.push(value);
        break;
    }

    return parts;
}

function renderSetupHelpMark(cliName: string, q: QuotaEntry, extraTooltip: string[] = []): string {
    const hint = QUOTA_SETUP_HINTS[cliName];
    const tooltipParts = [
        ...extraTooltip,
        ...(hint ? hint.commands : []),
        ...(hint?.note ? [hint.note] : []),
    ].filter(Boolean);
    if (!tooltipParts.length) return '';
    return `<span style="cursor:help;opacity:0.55;margin-left:4px;font-weight:400" title="${escapeHtml(tooltipParts.join('\n'))}">?</span>`;
}

function renderQuotaSetupBox(cliName: string, q: QuotaEntry): string {
    const hint = QUOTA_SETUP_HINTS[cliName];
    const usage = q.sessionUsage;
    const extraTooltip: string[] = [];
    if (usage?.primaryModelId) extraTooltip.push(`Model: ${usage.primaryModelId}`);
    if (usage?.contextTokensUsed && usage?.contextWindowTokens) {
        extraTooltip.push(`Session context: ${Math.round(usage.contextTokensUsed).toLocaleString()} / ${Math.round(usage.contextWindowTokens).toLocaleString()} tokens`);
    } else if (usage?.turnCount) {
        extraTooltip.push(`Session turns: ${Math.round(usage.turnCount).toLocaleString()}`);
    }
    const helpMark = renderSetupHelpMark(cliName, q, extraTooltip);

    if (hint) {
        const commandLines = hint.commands.map(cmd => `
            <div style="margin-top:3px"><code style="font-size:10px;background:var(--border);padding:1px 4px;border-radius:2px;word-break:break-all">${escapeHtml(cmd)}</code></div>
        `).join('');
        return `
            <div style="font-size:10px;color:var(--text-dim);margin:4px 0 0 16px;padding:5px 7px;background:var(--surface);border:1px solid var(--border);border-radius:5px">
                <div style="color:var(--text);font-weight:600">${escapeHtml(hint.title)}${helpMark}</div>
                ${commandLines}
                ${hint.note ? `<div style="margin-top:4px;opacity:0.75">${escapeHtml(hint.note)}</div>` : ''}
            </div>
        `;
    }

    return `
        <div style="font-size:10px;color:var(--text-dim);margin:4px 0 0 16px;padding:5px 7px;background:var(--surface);border:1px solid var(--border);border-radius:5px">
            <div style="color:var(--text);font-weight:600">${escapeHtml(q.displayTier || providerLabel(cliName))}${helpMark}</div>
            <div style="margin-top:2px">${escapeHtml(describeStatusOnlyQuota(cliName, q))}</div>
        </div>
    `;
}

function scheduleEmbeddedQuotaRetry(
    seq: number,
    cliStatus: Record<string, { available: boolean }>,
    cachedQuota: Record<string, QuotaEntry> | null | undefined,
): void {
    if (!isEmbeddedPreviewFrame()) return;
    void (async () => {
        await new Promise(resolve => window.setTimeout(resolve, 600));
        if (seq !== cliStatusLoadSeq) return;
        const retry = await api<Record<string, QuotaEntry>>('/api/quota');
        if (seq !== cliStatusLoadSeq || !retry) return;
        state.cliStatusCache = { cliStatus, quota: retry } as Record<string, unknown>;
        state.cliStatusTs = Date.now();
        renderCliStatus({ cliStatus, quota: retry });
    })();
}

async function fetchAndRenderQuota(
    seq: number,
    cliStatus: Record<string, { available: boolean }>,
    cachedQuota: Record<string, QuotaEntry> | null | undefined,
): Promise<void> {
    const quota = await api<Record<string, QuotaEntry>>('/api/quota');
    if (seq !== cliStatusLoadSeq) return;

    const resolvedQuota = quota ?? cachedQuota ?? null;
    state.cliStatusCache = { cliStatus, quota: resolvedQuota } as Record<string, unknown>;
    if (quota) state.cliStatusTs = Date.now();
    renderCliStatus({ cliStatus, quota: resolvedQuota });

    if (!quota) scheduleEmbeddedQuotaRetry(seq, cliStatus, cachedQuota);
}

function scheduleQuotaFetch(
    force: boolean,
    seq: number,
    cliStatus: Record<string, { available: boolean }>,
    cachedQuota: Record<string, QuotaEntry> | null | undefined,
): void {
    const run = () => { void fetchAndRenderQuota(seq, cliStatus, cachedQuota); };
    if (force) {
        void fetchAndRenderQuota(seq, cliStatus, cachedQuota);
        return;
    }
    window.setTimeout(run, QUOTA_LOAD_DEFER_MS);
}

export async function loadCliStatus(force = false): Promise<void> {
    if (!cliStatusExpanded) return;

    if (cliStatusLoadInFlight) {
        if (force) await cliStatusLoadInFlight.catch(() => {});
        else return;
    }

    cliStatusLoadInFlight = (async () => {
        const seq = ++cliStatusLoadSeq;
        const interval = readCliStatusInterval();
        if (!force && state.cliStatusCache && interval > 0 && (Date.now() - state.cliStatusTs) < interval * 1000) {
            renderCliStatus({
                cliStatus: (state.cliStatusCache as Record<string, unknown>)?.['cliStatus'] as Record<string, { available: boolean }> | null,
                quota: (state.cliStatusCache as Record<string, unknown>)?.['quota'] as Record<string, QuotaEntry> | null,
            });
            return;
        }

        const el = document.getElementById('cliStatusList');
        const cachedQuota = (state.cliStatusCache as Record<string, unknown> | null)?.['quota'] as Record<string, QuotaEntry> | null | undefined;
        if (el && !cachedQuota) el.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Loading...</div>';

        const cliStatus = await api<Record<string, { available: boolean }>>('/api/cli-status');
        if (seq !== cliStatusLoadSeq) return;
        if (!cliStatus || typeof cliStatus !== 'object') {
            if (el) el.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Failed to load CLI status</div>';
            return;
        }

        renderCliStatus({ cliStatus, quota: cachedQuota ?? null });

        scheduleQuotaFetch(force, seq, cliStatus, cachedQuota);
    })().finally(() => {
        cliStatusLoadInFlight = null;
    });

    await cliStatusLoadInFlight;
}

function renderCliStatus(data: { cliStatus: Record<string, { available: boolean }> | null; quota: Record<string, QuotaEntry> | null }): void {
    const { cliStatus, quota } = data;
    const el = document.getElementById('cliStatusList');

    const AUTH_HINTS: Record<string, { install: string; auth: string }> = {
        agy: { install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash', auth: 'agy runtime auth, antigravity-usage login, or ~/.gemini oauth for quota' },
        'ai-e': { install: 'Install AI-E helper', auth: 'delegates to selected AI-E provider' },
        claude: { install: 'npm i -g @anthropic-ai/claude-code', auth: 'claude auth' },
        'claude-e': { install: 'Install claude-e helper', auth: 'claude auth' },
        codex: { install: 'npm i -g @openai/codex', auth: 'codex login' },
        'codex-app': { install: 'npm i -g @openai/codex', auth: 'codex login' },
        cursor: { install: 'curl https://cursor.com/install -fsS | bash', auth: 'cursor-agent login, CURSOR_API_KEY, or CURSOR_SESSION_TOKEN for quota' },
        gemini: { install: 'npm i -g @google/gemini-cli', auth: `gemini  (${t('cli.gemini.auth')})` },
        grok: { install: 'curl -fsSL https://x.ai/cli/install.sh | bash', auth: 'grok login --oauth' },
        opencode: { install: 'npm i -g opencode-ai', auth: 'opencode auth' },
        copilot: { install: 'npm i -g copilot', auth: t('cli.copilot.authHint') },
    };

    let html = '';

    if (!cliStatus || typeof cliStatus !== 'object') {
        if (el) el.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Failed to load CLI status</div>';
        return;
    }

    for (const [name, info] of Object.entries(cliStatus)) {
        const q = quota?.[name];
        let dotClass: string;
        if (!info.available) {
            dotClass = 'missing';
        } else if (!q || q.error) {
            dotClass = 'ok';
        } else if (q.authenticated === false) {
            dotClass = 'warn';
        } else {
            dotClass = 'ok';
        }

        let accountLine = '';
        const showSetupBox = q?.quotaCapable === false
            && q.authenticated !== false
            && info.available
            && !QUOTA_CUSTOM_MSG[name]
            && !QUOTA_HIDDEN_CLIS.has(name);
        if (q?.account && !showSetupBox) {
            const parts = buildAccountParts(name, q);
            if (parts.length) accountLine = `<div style="font-size:10px;color:var(--text-dim);margin:2px 0 4px 16px">${escapeHtml(parts.join(' · '))}</div>`;
        }

        let authHint = '';
        if (!info.available || dotClass === 'warn') {
            const hint = AUTH_HINTS[name];
            if (hint) {
                const isNotInstalled = !info.available;
                const title = isNotInstalled ? t('cli.authRequired') : t('cli.notAuthenticated');
                const borderColor = isNotInstalled ? 'var(--error)' : 'var(--warning)';
                authHint = `
                    <div style="font-size:10px;margin:4px 0 2px 16px;padding:6px 8px;background:var(--surface);border-radius:4px;border-left:2px solid ${borderColor}">
                        <div style="color:${borderColor};margin-bottom:3px">${title}</div>
                        ${isNotInstalled ? `<div style="color:var(--text-dim)"><code style="font-size:10px;background:var(--border);padding:1px 4px;border-radius:2px">${escapeHtml(hint.install)}</code></div>` : ''}
                        <div style="color:var(--text-dim)${isNotInstalled ? ';margin-top:2px' : ''}"><code style="font-size:10px;background:var(--border);padding:1px 4px;border-radius:2px">${escapeHtml(hint.auth)}</code></div>
                    </div>
                `;
            }
        }

        let windowsHtml = '';
        const customQuotaMsg = QUOTA_CUSTOM_MSG[name];
        if (QUOTA_HIDDEN_CLIS.has(name)) {
            // no quota display for this CLI
        } else if (customQuotaMsg && info.available) {
            windowsHtml = `
                <div style="font-size:10px;color:var(--text-dim);margin:4px 0 0 16px;padding:5px 7px;background:var(--surface);border:1px solid var(--border);border-radius:5px">
                    ${escapeHtml(customQuotaMsg)}
                </div>
            `;
        } else if (showSetupBox) {
            windowsHtml = renderQuotaSetupBox(name, q);
        } else if (q?.windows?.length) {
            windowsHtml = q.windows.map(w => {
                const pct = Math.round(w.percent);
                const barColor = pct > 80 ? 'var(--error)' : pct > 50 ? 'var(--warning)' : 'var(--info)';
                const shortLabel = normalizeQuotaWindowLabel(name, w.label);
                let resetStr = '';
                if (w.resetsAt) {
                    const d = new Date(typeof w.resetsAt === 'number' ? w.resetsAt * 1000 : w.resetsAt);
                    const now = new Date();
                    if (d.toDateString() === now.toDateString()) {
                        resetStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                    } else {
                        resetStr = `${d.getMonth() + 1}/${d.getDate()}`;
                    }
                }
                return `
                    <div style="display:flex;align-items:center;gap:4px;margin-left:16px;font-size:10px;color:var(--text-dim)">
                        <span style="min-width:18px;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(shortLabel)}</span>
                        <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px"></div>
                        </div>
                        <span style="width:24px;text-align:right">${pct}%</span>
                        ${resetStr ? `<span style="width:30px;text-align:right;opacity:0.6">${resetStr}</span>` : ''}
                    </div>
                `;
            }).join('');
        } else if (q?.error && info.available) {
            const msg = q.reason === 'rate_limited' ? 'Rate limited — retry in a moment' : 'Usage data unavailable';
            windowsHtml = `<div style="font-size:10px;color:var(--text-dim);margin:2px 0 0 16px;opacity:0.7">${ICONS.warning} ${msg}</div>`;
        }

        const quotaHelpMark = q?.quotaCapable && QUOTA_SETUP_HINTS[name]
            ? renderSetupHelpMark(name, q)
            : '';

        html += `
            <div class="settings-group" style="margin-bottom:6px;padding:8px 10px">
                <div class="cli-status-row">
                    <span class="cli-dot ${dotClass}"></span>
                    <span class="cli-provider-icon" aria-hidden="true">${providerIcon(name) || ''}</span>
                    <span class="cli-name" style="font-weight:600">${escapeHtml(providerLabel(name))}${quotaHelpMark}</span>${name === 'copilot' ? `<button id="copilotKeychainBtn" style="font-size:9px;margin-left:6px;padding:1px 5px;background:var(--border);color:var(--text-dim);border:1px solid var(--text-dim);border-radius:3px;cursor:pointer;vertical-align:middle;line-height:1" title="${t('copilot.keychainHint')}">${ICONS.key}</button>` : ''}
                </div>
                ${accountLine}
                ${authHint}
                ${windowsHtml}
            </div>
        `;
    }

    if (el) el.innerHTML = html;

    const allEntries = Object.entries(cliStatus);
    const hasReadyCli = allEntries.some(([name, info]) => {
        if (!info.available) return false;
        const q = quota?.[name];
        return !q || q.authenticated !== false;
    });
    if (!hasReadyCli && allEntries.length > 0 && el) {
        el.insertAdjacentHTML('afterbegin',
            `<div style="padding:8px 10px;margin-bottom:8px;background:var(--warning-dim);border:1px solid var(--warning);border-radius:6px;font-size:11px;color:var(--warning)">
                ${ICONS.warning} ${t('cli.noReadyCli')}
            </div>`
        );
    }

    const kcBtn = document.getElementById('copilotKeychainBtn');
    if (kcBtn) {
        kcBtn.addEventListener('click', async () => {
            const btn = kcBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.innerHTML = ICONS.hourglass;
            try {
                const res = await api<{ ok: boolean }>('/api/copilot/refresh', { method: 'POST' });
                btn.innerHTML = res?.ok ? ICONS.check : ICONS.error;
                if (res?.ok) await loadCliStatus(true);
            } catch {
                btn.innerHTML = ICONS.error;
            }
            setTimeout(() => { btn.innerHTML = ICONS.key; btn.disabled = false; }, 2000);
        });
    }
}
