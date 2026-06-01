// ── WebSocket Connection ──
import { state } from './state.js';
import { API_BASE } from './api.js';
import { setStatus, updateQueueBadge, addSystemMsg, appendAgentText, finalizeAgent, addMessage, showProcessStep, cleanupToolActivity, showLiveToolActivity, applyQueuedOverlay, hydrateActiveRun, reconcileChatBottomAfterRestore, showChatRestoreIndicator, markSteered, isRecentSteer } from './ui.js';
import { renderPendingQueue } from './features/pending-queue.js';
import { t, getLang } from './features/i18n.js';
import { getVirtualScroll } from './virtual-scroll.js';
import { ICONS, emojiToIcon } from './icons.js';
import { escapeHtml, cancelPostRender } from './render.js';
import type { HeartbeatRuntimeState, OrcStateName, ResolvedSelectionState } from './state.js';
import { notifyUnreadResponse } from './features/attention-badge.js';
import { shouldApplyOrcStateEvent } from './features/orchestrate-scope.js';
import { providerLabel } from './provider-icons.js';
import { applyWorkflowEvent, type WorkflowEventMessage } from './features/workflow-event-adapter.js';

const ROADMAP_PHASES = ['I', 'P', 'A', 'B', 'C'] as const;

/** Track current phase for resize recalculation */
let currentSharkPhase: string | null = null;

/** Position shark midway between active dot and next dot.
 *  For C (last phase), center on the C dot itself.
 *  Uses dot midpoints to avoid CENTER brand element skewing connector index mapping. */
function positionShark(roadmap: HTMLElement, shark: HTMLElement, phase: string): void {
    const idx = ROADMAP_PHASES.indexOf(phase as typeof ROADMAP_PHASES[number]);
    if (idx < 0) return;
    const barRect = roadmap.getBoundingClientRect();
    const sharkW = shark.offsetWidth || 36;
    const dot = document.getElementById(`dot-${phase}`);
    if (!dot) return;

    const nextPhase = ROADMAP_PHASES[idx + 1];
    const nextDot = nextPhase ? document.getElementById(`dot-${nextPhase}`) : null;
    if (nextDot) {
        const dotRect = dot.getBoundingClientRect();
        const nextRect = nextDot.getBoundingClientRect();
        const mid = (dotRect.right + nextRect.left) / 2;
        shark.style.left = (mid - barRect.left - sharkW / 2) + 'px';
    } else {
        const dotRect = dot.getBoundingClientRect();
        shark.style.left = (dotRect.left - barRect.left + dotRect.width / 2 - sharkW / 2) + 'px';
    }
}

interface WsMessage {
    type: string;
    scope?: string;
    running?: boolean;
    status?: string;
    agentId?: string;
    phase?: string;
    phaseLabel?: string;
    pending?: number;
    queued?: Array<{ id: string; prompt: string; source?: string; ts?: number }>;
    path?: string;
    round?: number;
    agentPhases?: { agent?: string; name?: string }[];
    subtasks?: { agent?: string; name?: string }[];
    action?: string;
    icon?: string;
    rawIcon?: string;
    label?: string;
    toolType?: string;
    detail?: string;
    stepRef?: string;
    traceRunId?: string;
    traceSeq?: number;
    detailAvailable?: boolean;
    detailBytes?: number;
    rawRetentionStatus?: string;
    text?: string;
    toolLog?: { icon: string; label: string; detail?: string; toolType?: string; stepRef?: string; isEmployee?: boolean; traceRunId?: string; traceSeq?: number; detailAvailable?: boolean; detailBytes?: number; rawRetentionStatus?: string }[];
    from?: string;
    to?: string;
    source?: string;
    role?: string;
    content?: string;
    cli?: string;
    delay?: number;
    state?: string;
    title?: string;
    isEmployee?: boolean;
    fromQueue?: boolean;
    reason?: HeartbeatRuntimeState['reason'];
    policy?: HeartbeatRuntimeState['policy'];
    jobId?: string;
    jobName?: string;
    deferredPending?: number;
    taskAnchor?: string | null;
    resolvedSelection?: ResolvedSelectionState | null;
    buildBudget?: {
        maxWorkerDispatches: number;
        maxSelfHealRetries: number;
        maxVerificationRounds: number;
        spent: {
            workerDispatches: number;
            selfHealRetries: number;
            verificationRounds: number;
        };
    } | null;
    interview?: { known: string[]; unknown: string[]; round: number } | null;
    delaySeconds?: number;
    attempts?: number;
    event?: WorkflowEventMessage;
    code?: string;
    employeeName?: string;
    exitCode?: number;
    error?: string;
    message?: string;
    steered?: boolean;
    steerWaitMs?: number;
}

// Agent phase state (populated by agent_status events from orchestrator)
const agentPhaseState: Record<string, { phase: string; phaseLabel: string }> = {};

let currentOrcScope = '';
let lastLoadTs = 0;
let snapshotSyncInFlight: Promise<void> | null = null;
let lastSnapshotSyncAt = 0;
let restoreHooksRegistered = false;
let lastRestoreTriggerAt = 0;
const SNAPSHOT_SYNC_THROTTLE_MS = 750;
const RESTORE_TRIGGER_DEBOUNCE_MS = 750;

async function refreshRuntimeSnapshot(options: { hydrateRun?: boolean } = {}): Promise<void> {
    const response = await fetch(`${API_BASE}/api/orchestrate/snapshot`);
    const snap = await response.json();
    currentOrcScope = String(snap.orc.scope || '');
    applyOrcState(snap.orc.state);
    applyOrcContext(snap.orc.ctx || null);
    applyHeartbeatRuntime(snap.heartbeat || { pending: 0, deferredPending: 0 });
    hydrateAgentPhases(snap.workers);
    updateQueueBadge(snap.runtime.queuePending);
    applyQueuedOverlay(snap.queued || []);
    renderPendingQueue(snap.queued || []);
    if (options.hydrateRun) hydrateActiveRun(snap.activeRun);
    hydrateGoalState();
    setStatus(snap.runtime.busy ? 'running' : 'idle');
    if (snap.runtime.busy && (snap.activeRun?.cli === 'agy' || snap.activeRun?.cli === 'kiro-code')) {
        showLiveToolActivity(`${providerLabel(snap.activeRun.cli)} working...`);
    }
    import('./features/employees.js').then(m => {
        if (typeof m.renderEmployees === 'function') m.renderEmployees();
    });
}

export function syncOrchestrateSnapshot(reason = 'manual', options: { hydrateRun?: boolean } = {}): Promise<void> {
    const now = Date.now();
    if (!options.hydrateRun) {
        if (snapshotSyncInFlight) return snapshotSyncInFlight;
        if (now - lastSnapshotSyncAt < SNAPSHOT_SYNC_THROTTLE_MS) return Promise.resolve();
        lastSnapshotSyncAt = now;
        snapshotSyncInFlight = refreshRuntimeSnapshot(options)
            .catch(error => {
                console.warn(`[ws] orchestrate snapshot sync failed (${reason})`, error);
                throw error;
            })
            .finally(() => {
                snapshotSyncInFlight = null;
            });
        return snapshotSyncInFlight;
    }
    return refreshRuntimeSnapshot(options);
}

function syncAfterBrowserRestore(reason: string): void {
    showChatRestoreIndicator(reason);
    syncOrchestrateSnapshot(reason, { hydrateRun: true })
        .finally(() => {
            reconcileChatBottomAfterRestore(reason);
        })
        .catch(() => {});
}

function requestBrowserRestoreSync(reason: string): void {
    const now = Date.now();
    if (reason !== 'discard' && now - lastRestoreTriggerAt < RESTORE_TRIGGER_DEBOUNCE_MS) return;
    lastRestoreTriggerAt = now;
    syncAfterBrowserRestore(reason);
}

function registerOrchestrateRestoreHooks(): void {
    if (restoreHooksRegistered) return;
    restoreHooksRegistered = true;
    window.addEventListener('focus', () => {
        requestBrowserRestoreSync('focus');
    });
    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        requestBrowserRestoreSync('pageshow');
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            requestBrowserRestoreSync('visibilitychange');
        }
    });
    document.addEventListener('resume', () => {
        requestBrowserRestoreSync('resume');
    });
    if ('wasDiscarded' in document
        && Boolean((document as Document & { wasDiscarded?: boolean }).wasDiscarded)) {
        requestBrowserRestoreSync('discard');
    }
    window.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'jaw-preview-visibility' && event.data.visible) {
            requestBrowserRestoreSync('iframe-visible');
        }
    });
}

/** Hydrate agent phase cache from snapshot (used after reconnect) */
export function hydrateAgentPhases(workers: Array<{
    agentId: string;
    state: string;
    phase?: string;
    phaseLabel?: string;
}>) {
    for (const key of Object.keys(agentPhaseState)) {
        delete agentPhaseState[key];
    }
    for (const w of workers) {
        if (w.state === 'running' && w.phase) {
            agentPhaseState[w.agentId] = {
                phase: w.phase,
                phaseLabel: w.phaseLabel || '',
            };
        }
    }
}

function applyHeartbeatRuntime(input: Partial<HeartbeatRuntimeState> | null | undefined): void {
    const runtime: HeartbeatRuntimeState = {
        pending: Number(input?.pending || 0),
        deferredPending: Number(input?.deferredPending || 0),
        ...(input?.reason ? { reason: input.reason } : {}),
        ...(input?.policy ? { policy: input.policy } : {}),
        ...(input?.jobId ? { jobId: input.jobId } : {}),
        ...(input?.jobName ? { jobName: input.jobName } : {}),
    };
    state.heartbeatRuntime = runtime;

    const el = document.getElementById('pabcHeartbeatStatus');
    if (!el) return;
    if (runtime.reason === 'pabcd_active' && runtime.deferredPending > 0) {
        const suffix = runtime.jobName ? `: ${runtime.jobName}` : '';
        el.textContent = `heartbeat deferred (${runtime.deferredPending})${suffix}`;
        el.hidden = false;
    } else {
        el.textContent = '';
        el.hidden = true;
    }
}

function applyOrcContext(ctx: { taskAnchor?: string | null; resolvedSelection?: ResolvedSelectionState | null; interview?: { known: string[]; unknown: string[]; round: number } | null } | null): void {
    state.orcTaskAnchor = String(ctx?.taskAnchor || '').trim();
    state.orcResolvedSelection = ctx?.resolvedSelection || null;

    const el = document.getElementById('pabcTaskAnchor');
    if (!el) return;
    if (state.orcTaskAnchor) {
        const selected = state.orcResolvedSelection?.index ? `${state.orcResolvedSelection.index}. ` : '';
        el.textContent = `anchor: ${selected}${state.orcTaskAnchor}`;
        el.hidden = false;
    } else {
        el.textContent = '';
        el.hidden = true;
    }
    renderInterviewPanel(ctx?.interview || null);
}

let interviewCollapsed: boolean = (() => {
    try { return localStorage.getItem('jaw:interviewCollapsed') === '1'; } catch { return false; }
})();

function setInterviewCollapsed(collapsed: boolean): void {
    interviewCollapsed = collapsed;
    try { localStorage.setItem('jaw:interviewCollapsed', collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
    const panel = document.getElementById('interviewPanel');
    if (!panel) return;
    panel.classList.toggle('collapsed', collapsed);
    const toggle = panel.querySelector('.iv-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
}

interface InterviewEvidenceView {
    fact: string;
    source?: string;
    confidence?: number;
    turnNumber?: number;
    dimension?: string;
}

interface DimensionAssessmentView {
    goal: string;
    constraint: string;
    success: string;
    ontology: string;
}

function renderDimensionBars(assessment: DimensionAssessmentView): string {
    const levelToScore = (l: string) => {
        switch (l) {
            case 'max': return 1.0;
            case 'xhigh': return 0.8;
            case 'high': return 0.6;
            case 'medium': return 0.4;
            default: return 0.2;
        }
    };
    const levelColor = (l: string) => {
        switch (l) {
            case 'max': return '#2196f3';
            case 'xhigh': return '#4caf50';
            case 'high': return '#8bc34a';
            case 'medium': return '#ff9800';
            default: return '#f44336';
        }
    };
    const scores = [levelToScore(assessment.goal), levelToScore(assessment.constraint), levelToScore(assessment.success), levelToScore(assessment.ontology)];
    const overall = 1 - (scores.reduce((a, b) => a + b, 0) / scores.length);
    const allMax = Object.values(assessment).every(v => v === 'max');
    const overallLabel = allMax ? '🟢 Ready' : overall <= 0.2 ? '🟢 Ready' : overall <= 0.4 ? '🟡 Almost' : '🔴 Needs work';

    const bar = (dim: string, level: string) => {
        const score = levelToScore(level);
        const pct = score * 100;
        const color = levelColor(level);
        return `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
            <span style="width:70px;color:var(--text-secondary)">${dim}</span>
            <div style="flex:1;height:5px;background:var(--bg-tertiary);border-radius:3px">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .3s"></div>
            </div>
            <span style="width:60px;text-align:right;font-weight:600;font-size:11px">${score.toFixed(1)} ${level.toUpperCase()}</span>
        </div>`;
    };
    return `<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
            <span style="color:var(--text-secondary)">Ambiguity: ${overall.toFixed(2)}</span>
            <span>${overallLabel}</span>
        </div>
        ${bar('Goal', assessment.goal)}
        ${bar('Constraint', assessment.constraint)}
        ${bar('Success', assessment.success)}
        ${bar('Ontology', assessment.ontology)}
    </div>`;
}

function renderInterviewPanel(interview: { known: (string | InterviewEvidenceView)[]; unknown: string[]; round: number; assessment?: DimensionAssessmentView } | null): void {
    const panel = document.getElementById('interviewPanel');
    if (!panel) return;
    if (!interview || (!interview.known.length && !interview.unknown.length)) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    panel.classList.toggle('collapsed', interviewCollapsed);

    const sourceIcon = (src?: string) => {
        switch (src) {
            case 'user_statement': return '🟢';
            case 'repo_fact': return '🔵';
            case 'inference': return '🟡';
            case 'assumption': return '🟠';
            case 'default': return '⚪';
            default: return '·';
        }
    };

    const knownHtml = interview.known.map(k => {
        if (typeof k === 'string') return `<li class="iv-known">· ${escapeHtml(k)}</li>`;
        const ev = k as InterviewEvidenceView;
        const icon = sourceIcon(ev.source);
        const dim = ev.dimension ? ` <span class="iv-dim">[${ev.dimension}]</span>` : '';
        return `<li class="iv-known">${icon} ${escapeHtml(ev.fact)}${dim}</li>`;
    }).join('');
    const unknownHtml = interview.unknown.map(u => `<li class="iv-unknown">❓ ${escapeHtml(typeof u === 'string' ? u : JSON.stringify(u))}</li>`).join('');
    panel.innerHTML = `
        <button type="button" class="iv-toggle" aria-expanded="${!interviewCollapsed}" aria-controls="interviewBody" title="인터뷰 트래커 접기/펼치기">
            <span class="iv-chevron" aria-hidden="true">▸</span>
            <span class="iv-summary">Interview · <span class="iv-known-count">Known ${interview.known.length}</span> · <span class="iv-unknown-count">Unknown ${interview.unknown.length}</span>${interview.known.filter(k => typeof k === 'object' && k && 'source' in k && (k as InterviewEvidenceView).source === 'assumption').length > 0 ? ` · <span class="iv-assumption-count">⚠️ ${interview.known.filter(k => typeof k === 'object' && k && 'source' in k && (k as InterviewEvidenceView).source === 'assumption').length} assumptions</span>` : ''} · Round ${interview.round}</span>
        </button>
        <div class="iv-body" id="interviewBody">
            ${interview.assessment ? `<div class="iv-section iv-section-ambiguity">${renderDimensionBars(interview.assessment)}</div>` : ''}
            <div class="iv-section iv-section-known"><strong>Known (${interview.known.length})</strong><ul>${knownHtml}</ul></div>
            <div class="iv-section iv-section-unknown"><strong>Unknown (${interview.unknown.length})</strong><ul>${unknownHtml}</ul></div>
        </div>
    `;
    if (!panel.dataset['toggleBound']) {
        panel.dataset['toggleBound'] = '1';
        panel.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.iv-toggle')) {
                setInterviewCollapsed(!interviewCollapsed);
            }
        });
    }
}

function renderBudgetPanel(budget: { maxWorkerDispatches: number; maxSelfHealRetries: number; maxVerificationRounds: number; spent: { workerDispatches: number; selfHealRetries: number; verificationRounds: number } } | null, orcState: string): void {
    const panel = document.getElementById('budgetPanel');
    if (!panel) return;
    if (!budget || orcState !== 'B') { panel.hidden = true; return; }
    panel.hidden = false;
    const bar = (label: string, spent: number, max: number) => {
        const pct = max > 0 ? Math.min((spent / max) * 100, 100) : 0;
        const color = pct >= 100 ? '#f44336' : pct >= 66 ? '#ff9800' : '#4caf50';
        return `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
            <span style="width:70px;color:var(--text-secondary)">${label}</span>
            <div style="flex:1;height:5px;background:var(--bg-tertiary);border-radius:3px">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
            </div>
            <span style="width:30px;text-align:right;font-size:11px">${spent}/${max}</span>
        </div>`;
    };
    panel.innerHTML = `<div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-secondary)">Build Budget</div>
        ${bar('Workers', budget.spent.workerDispatches, budget.maxWorkerDispatches)}
        ${bar('Self-heal', budget.spent.selfHealRetries, budget.maxSelfHealRetries)}
        ${bar('Verify', budget.spent.verificationRounds, budget.maxVerificationRounds)}`;
}

async function hydrateGoalState(): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/api/goal`);
        if (!res.ok) return;
        const data = await res.json() as { goal?: { id: string; objective: string; status: string; createdAt: string; updatedAt: string; lastCheckpoint?: { summary: string; nextAction: string } } | null };
        if (data.goal) {
            state.activeGoal = {
                id: data.goal.id,
                objective: data.goal.objective,
                status: data.goal.status as 'active' | 'paused' | 'blocked' | 'complete' | 'cancelled',
                createdAt: data.goal.createdAt,
                updatedAt: data.goal.updatedAt,
                lastCheckpointSummary: data.goal.lastCheckpoint?.summary,
                nextAction: data.goal.lastCheckpoint?.nextAction,
            };
        } else {
            state.activeGoal = null;
        }
        renderGoalCockpit();
    } catch { /* noop */ }
}

function renderGoalCockpit(): void {
    const el = document.getElementById('goalCockpit');
    if (!el) return;
    const goal = state.activeGoal;
    if (!goal || goal.status === 'complete' || goal.status === 'cancelled') {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    el.replaceChildren();
    const statusClass = goal.status === 'paused' ? 'paused' : goal.status === 'blocked' ? 'blocked' : 'active';
    const objSpan = document.createElement('span');
    objSpan.className = 'goal-objective';
    objSpan.title = goal.objective;
    objSpan.textContent = goal.objective;
    const statusSpan = document.createElement('span');
    statusSpan.className = `goal-status goal-status--${statusClass}`;
    statusSpan.textContent = goal.status;
    el.append(objSpan, statusSpan);
    if (goal.nextAction) {
        const nextSpan = document.createElement('span');
        nextSpan.className = 'goal-next';
        nextSpan.textContent = goal.nextAction;
        el.append(nextSpan);
    }
}

/** Apply orchestration state to UI (shared by WS events and reconnect snapshot) */
function applyOrcState(orcState: string, title?: string) {
    const allowed = new Set<OrcStateName>(['IDLE', 'I', 'P', 'A', 'B', 'C', 'D']);
    const nextState = allowed.has(orcState as OrcStateName) ? (orcState as OrcStateName) : 'IDLE';
    state.orcState = nextState;

    if (nextState === 'IDLE' || nextState === 'D') {
        document.body.removeAttribute('data-orc-state');
        document.body.style.removeProperty('--orc-glow');
    } else {
        document.body.setAttribute('data-orc-state', nextState);
        const glowVar = `--orc-glow-${nextState}`;
        const glow = getComputedStyle(document.documentElement).getPropertyValue(glowVar).trim();
        document.body.style.setProperty('--orc-glow', glow);
    }

    document.body.classList.add('orc-pulse');
    setTimeout(() => document.body.classList.remove('orc-pulse'), 700);

    const badge = document.getElementById('orcStateBadge');
    if (badge) {
        const labels: Record<OrcStateName, string> = {
            IDLE: '', I: 'INTERVIEW', P: 'PLAN', A: 'AUDIT', B: 'BUILD', C: 'CHECK', D: 'DONE',
        };
        badge.textContent = labels[nextState];
        badge.style.display = nextState === 'IDLE' ? 'none' : 'inline-block';
    }

    // ─── Roadmap Bar ───
    const roadmap = document.getElementById('pabcRoadmap');
    const shark = document.getElementById('sharkRunner');
    const brand = document.getElementById('pabcBrand');

    if (roadmap && shark) {
        if (!roadmap.dataset['resizeObserved']) {
            roadmap.dataset['resizeObserved'] = '1';
            new ResizeObserver(() => {
                if (currentSharkPhase && shark.classList.contains('running')) {
                    positionShark(roadmap, shark, currentSharkPhase);
                }
            }).observe(roadmap);
            let rafId = 0;
            window.addEventListener('resize', () => {
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    if (currentSharkPhase && shark.classList.contains('running')) {
                        positionShark(roadmap, shark, currentSharkPhase);
                    }
                });
            });
        }

        if (nextState === 'IDLE') {
            roadmap.classList.remove('visible', 'shimmer-out');
            shark.classList.remove('running');
            currentSharkPhase = null;
        } else if (nextState === 'D') {
            ROADMAP_PHASES.forEach(p => {
                const dot = document.getElementById(`dot-${p}`);
                if (dot) { dot.className = 'pabc-dot done'; dot.setAttribute('data-phase', p); }
            });
            for (let i = 0; i < ROADMAP_PHASES.length; i++) {
                const c = document.getElementById(`pabc-conn-${i}`);
                if (c) c.className = 'pabc-connector done';
            }
            shark.classList.remove('running');
            currentSharkPhase = null;
            roadmap.classList.add('shimmer-out');
            setTimeout(() => roadmap.classList.remove('visible', 'shimmer-out'), 1000);
        } else {
            roadmap.classList.remove('shimmer-out');
            roadmap.classList.add('visible');
            shark.classList.add('running');

            const idx = ROADMAP_PHASES.indexOf(nextState as typeof ROADMAP_PHASES[number]);
            ROADMAP_PHASES.forEach((p, pi) => {
                const dot = document.getElementById(`dot-${p}`);
                if (dot) {
                    dot.className = `pabc-dot ${pi < idx ? 'done' : pi === idx ? 'active' : 'future'}`;
                    dot.setAttribute('data-phase', p);
                }
            });
            for (let i = 0; i < ROADMAP_PHASES.length; i++) {
                const c = document.getElementById(`pabc-conn-${i}`);
                if (c) c.className = `pabc-connector ${i < idx ? 'done' : ''}`;
            }

            currentSharkPhase = nextState;
            requestAnimationFrame(() => positionShark(roadmap, shark, nextState));
        }

        if (brand && title) {
            brand.textContent = title;
        }
    }
}

export function connect(): void {
    registerOrchestrateRestoreHooks();
    const wsBase = import.meta.env?.DEV ? 'ws://localhost:3458' : `ws://${location.host}`;
    state.ws = new WebSocket(`${wsBase}${API_BASE}/?lang=${getLang()}`);
    state.ws.onmessage = (e: MessageEvent) => {
        let msg: WsMessage;
        try {
            msg = JSON.parse(e.data as string);
        } catch {
            console.warn('[ws] malformed message:', e.data);
            return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            console.warn('[ws] invalid message shape:', msg);
            return;
        }
        if (msg.type === 'agent_status') {
            if (!msg.running && isRecentSteer()) return;
            if (msg.running !== undefined) {
                setStatus(msg.running ? 'running' : 'idle');
                if (msg.running && (msg.cli === 'agy' || msg.cli === 'kiro-code')) {
                    showLiveToolActivity(`${providerLabel(msg.cli)} working...`);
                }
            } else {
                setStatus(msg.status || 'idle');
                if (msg.status === 'running' && (msg.cli === 'agy' || msg.cli === 'kiro-code')) {
                    showLiveToolActivity(`${providerLabel(msg.cli)} working...`);
                }
            }
            // Track per-agent phase for badge rendering
            if (msg.agentId && msg.phase) {
                agentPhaseState[msg.agentId] = { phase: msg.phase, phaseLabel: msg.phaseLabel || '' };
                import('./features/employees.js').then(m => m.loadEmployees());
            }
        } else if (msg.type === 'queue_update') {
            updateQueueBadge(msg.pending || 0);
            if (Array.isArray(msg.queued)) {
                renderPendingQueue(msg.queued);
            }
            syncOrchestrateSnapshot('queue_update').catch(() => { /* snapshot not critical — UI recovers on next event */ });
        } else if (msg.type === 'worklog_created') {
            addSystemMsg(`${ICONS.clipboard} Worklog: ${escapeHtml(msg.path || '')}`);
        } else if (msg.type === 'round_start') {
            const agents = (msg.agentPhases || msg.subtasks || []);
            const names = agents.map(a => escapeHtml(a.agent || a.name || '')).join(', ');
            addSystemMsg(t('ws.roundStart', { round: msg.round || 0, count: agents.length, names }));
        } else if (msg.type === 'round_done') {
            if (msg.action === 'complete') {
                addSystemMsg(t('ws.roundDone', { round: msg.round || 0 }));
            } else if (msg.action === 'next') {
                addSystemMsg(t('ws.roundNext', { round: msg.round || 0 }));
            } else {
                addSystemMsg(t('ws.roundRetry', { round: msg.round || 0 }));
            }
        } else if (msg.type === 'agent_tool') {
            const stepType = msg.toolType === 'thinking' ? 'thinking'
                : msg.toolType === 'search' ? 'search'
                    : msg.toolType === 'subagent' ? 'subagent' : 'tool';
            showProcessStep({
                id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: stepType,
                icon: msg.icon || ICONS.tool,
                rawIcon: msg.rawIcon || msg.icon || '',
                label: msg.label || '',
                isEmployee: msg.isEmployee === true,
                detail: msg.detail || '',
                stepRef: msg.stepRef || '',
                traceRunId: msg.traceRunId || '',
                traceSeq: msg.traceSeq,
                detailAvailable: msg.detailAvailable,
                detailBytes: msg.detailBytes,
                rawRetentionStatus: msg.rawRetentionStatus,
                status: (msg.status as 'running' | 'done' | 'error') || 'running',
                startTime: Date.now(),
            });
        } else if (msg.type === 'agent_output' || msg.type === 'agent_chunk') {
            appendAgentText(msg.text || '');
        } else if (msg.type === 'agent_retry') {
            const retryDelay = Number(msg.delay ?? 0);
            const retryReasonValue = (msg as WsMessage & { reason?: unknown }).reason;
            const retryReason = escapeHtml(String(retryReasonValue || '429'));
            const retryKey = retryDelay > 0 ? 'ws.retry' : 'ws.retryNow';
            addSystemMsg(t(retryKey, { cli: escapeHtml(msg.cli || ''), reason: retryReason, delay: retryDelay }), 'tool-activity');
        } else if (msg.type === 'agent_fallback') {
            addSystemMsg(t('ws.fallback', { from: escapeHtml(msg.from || ''), to: escapeHtml(msg.to || '') }), 'tool-activity');
        } else if (msg.type === 'agent_smoke') {
            addSystemMsg(`${ICONS.warning} ${escapeHtml(msg.cli || 'agent')}: smoke response detected — auto-continuing`, 'tool-activity');
        } else if (msg.type === 'goal_done') {
            state.activeGoal = null;
            renderGoalCockpit();
            addSystemMsg(`🎯 Goal completed${msg.source === 'ai_output' ? ' (detected from AI output)' : ''}`, 'tool-activity');
        } else if (msg.type === 'goal_cancel') {
            state.activeGoal = null;
            renderGoalCockpit();
            addSystemMsg(`🎯 Goal cancelled`, 'tool-activity');
        } else if (msg.type === 'schedule_wakeup') {
            addSystemMsg(`⏰ Wakeup scheduled in ${msg.delaySeconds}s — ${escapeHtml(String(msg.reason || ''))}`, 'tool-activity');
        } else if (msg.type === 'goal_continuation_limit') {
            addSystemMsg(`⚠️ Goal continuation limit reached (${msg.attempts} attempts)`, 'tool-activity');
        } else if (msg.type === 'goal_continuation') {
            addSystemMsg(`🎯 Active goal — auto-continuing`, 'tool-activity');
        } else if (msg.type === 'workflow_event') {
            const evt = msg.event;
            if (evt) applyWorkflowEvent(evt);
        } else if (msg.type === 'agent_done') {
            if (msg.steered || isRecentSteer()) {
                // Suppress agent_done from steered (killed) process.
                // Server sets steered:true; isRecentSteer is fallback for edge cases.
            } else {
                finalizeAgent(msg.text || '', msg.toolLog);
                notifyUnreadResponse();
            }
        } else if (msg.type === 'orchestrate_done') {
            finalizeAgent(msg.text || '');
            notifyUnreadResponse();
        } else if (msg.type === 'clear') {
            cancelPostRender();
            cleanupToolActivity();
            getVirtualScroll().clear();
            const el = document.getElementById('chatMessages');
            if (el) el.innerHTML = '';
            // Intentional clear — also wipe IndexedDB cache
            import('./features/idb-cache.js').then(m => m.clearCache()).catch(() => {});
        } else if (msg.type === 'session_reset') {
            addSystemMsg(`${ICONS.refresh} Session reset — history preserved`, 'tool-activity');
        } else if (msg.type === 'agent_added' || msg.type === 'agent_updated' || msg.type === 'agent_deleted') {
            import('./features/employees.js').then(m => m.loadEmployees());
        } else if (msg.type === 'heartbeat_pending') {
            const heartbeatRuntimePatch: Partial<HeartbeatRuntimeState> = {
                pending: msg.pending || 0,
                deferredPending: msg.deferredPending || 0,
            };
            if (msg.reason !== undefined) heartbeatRuntimePatch.reason = msg.reason;
            if (msg.policy !== undefined) heartbeatRuntimePatch.policy = msg.policy;
            if (msg.jobId !== undefined) heartbeatRuntimePatch.jobId = msg.jobId;
            if (msg.jobName !== undefined) heartbeatRuntimePatch.jobName = msg.jobName;
            applyHeartbeatRuntime(heartbeatRuntimePatch);
        } else if (msg.type === 'orc_state') {
            if (!shouldApplyOrcStateEvent(msg.scope, currentOrcScope)) return;
            applyOrcState(typeof msg.state === 'string' ? msg.state : 'IDLE', msg.title);
            applyOrcContext({
                taskAnchor: msg.taskAnchor || null,
                resolvedSelection: msg.resolvedSelection || null,
                interview: msg.interview || null,
            });
            renderBudgetPanel(msg.buildBudget || null, typeof msg.state === 'string' ? msg.state : 'IDLE');
        } else if (msg.type === 'memory_status') {
            import('./features/memory.js').then(m => m.refreshMemorySidebar());
        } else if (msg.type === 'steer_started') {
            markSteered();
            finalizeAgent('');
            setStatus('steering');
        } else if (msg.type === 'new_message' && (msg.source === 'telegram' || msg.source === 'discord' || msg.fromQueue === true)) {
            addMessage(msg.role === 'assistant' ? 'agent' : (msg.role || 'user'), msg.content || '', msg.cli);
        } else if (msg.type === 'system_notice') {
            addSystemMsg(`ℹ️ ${escapeHtml(msg.text || '')}`, 'tool-activity');
        } else if (msg.type === 'worker_stalled') {
            addSystemMsg(`⚠️ Worker stalled: ${escapeHtml(msg.employeeName || msg.agentId || '')}`, 'tool-activity');
        } else if (msg.type === 'worker_disconnected') {
            addSystemMsg(`🔌 Worker disconnected: ${escapeHtml(msg.agentId || '')} (exit ${escapeHtml(String(msg.exitCode ?? '?'))})`, 'tool-activity');
        } else if (msg.type === 'worker_timeout') {
            addSystemMsg(`⏱️ Worker timed out: ${escapeHtml(msg.employeeName || msg.agentId || '')}`, 'tool-activity');
        } else if (msg.type === 'alert_escalation') {
            addSystemMsg(escapeHtml(msg.message || ''), 'tool-activity');
        } else if (msg.type === 'schedule_wakeup_failed') {
            addSystemMsg(`⚠️ Wakeup failed — ${escapeHtml(String(msg.reason || ''))}: ${escapeHtml(msg.error || '')}`, 'tool-activity');
        } else if (msg.type === 'goal_continuation_failed') {
            addSystemMsg(`⚠️ Goal continuation failed: ${escapeHtml(msg.error || '')}`, 'tool-activity');
        } else if (msg.type === 'settings_change') {
            syncOrchestrateSnapshot('settings_change').catch(() => {});
        } else if (msg.type === 'session_switched' || msg.type === 'session_created') {
            // Reload messages for the new active session
            window.location.reload();
        }
    };
    state.ws.onopen = () => {
        console.log('[ws] connected');
        const now = Date.now();
        const skipReload = now - lastLoadTs < 10000;
        import('./ui.js').then(async m => {
            m.cleanupToolActivity();
            if (!skipReload) {
                try {
                    await m.loadMessages();
                    lastLoadTs = Date.now();
                } catch (error) {
                    console.error('[ws] loadMessages failed', error);
                }
            }
            syncOrchestrateSnapshot('reconnect', { hydrateRun: true })
                .catch(() => { /* snapshot not critical — UI recovers on next WS event */ })
                .finally(() => m.reconcileChatBottomAfterRestore('reconnect'));
        });
    };
    state.ws.onclose = () => {
        console.log('[ws] disconnected, reconnecting in 2s...');
        import('./ui.js').then(m => m.cleanupToolActivity());
        setStatus('idle');
        addSystemMsg(`${ICONS.exec} ${t('ws.disconnected')}`, 'tool-activity');
        setTimeout(connect, 2000);
    };
}

export function getAgentPhase(agentId: string): { phase: string; phaseLabel: string } | null {
    return agentPhaseState[agentId] || null;
}
