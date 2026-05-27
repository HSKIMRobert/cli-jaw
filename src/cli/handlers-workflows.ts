import { t } from '../core/i18n.js';
import { buildPlanCompatArtifact, formatPlanCompatText } from '../workflows/plan.js';
import { buildDeliberateArtifact, formatDeliberateText } from '../workflows/deliberate.js';
import { buildPlanAuditArtifact, formatPlanAuditText } from '../workflows/planaudit.js';
import type { CliCommandContext } from './command-context.js';
import type { SlashResult } from './types.js';

function joinArgs(args: string[]): string {
    return args.join(' ').trim();
}

function info(text: string): SlashResult {
    return { ok: true, type: 'info', text };
}

function blocked(text: string, code = 'workflow_not_ready'): SlashResult {
    return { ok: false, type: 'error', code, text };
}

function tr(key: string, locale: string, fallback: string): string {
    const value = t(key, {}, locale);
    return value === key ? fallback : value;
}

export async function interviewWorkflowHandler(args: string[], ctx: CliCommandContext): Promise<SlashResult> {
    const request = joinArgs(args) || '<rough request>';
    const { getState, setState, canTransition, getStatePrompt } = await import('../orchestrator/state-machine.js');
    const { resolveOrcScope } = await import('../orchestrator/scope.js');
    const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : {};
    const origin = ctx?.interface || 'web';
    const scope = resolveOrcScope({ origin, workingDir: (settings as Record<string, unknown>)['workingDir'] as string | null || null });
    const current = getState(scope);
    const gate = canTransition(current, 'I');
    if (!gate.ok) {
        return blocked(`Cannot enter Interview: ${gate.reason}\nCurrent state: ${current}`);
    }
    setState('I', { originalPrompt: request, workingDir: (settings as Record<string, unknown>)['workingDir'] as string | null || null, plan: null, workerResults: [], origin }, scope, 'Interview');
    return {
        ok: true,
        type: 'info',
        text: `Interview started: ${request}`,
        steerPrompt: `You are now in Interview mode for: "${request}". Start by identifying what is known vs unknown, then ask your first clarifying question.`,
    };
}

export async function planWorkflowHandler(args: string[], ctx: CliCommandContext): Promise<SlashResult> {
    const locale = ctx.locale || 'ko';
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'status') {
        const { getState, getCtx } = await import('../orchestrator/state-machine.js');
        const { resolveOrcScope } = await import('../orchestrator/scope.js');
        const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : {};
        const scope = resolveOrcScope({ origin: ctx?.interface || 'web', workingDir: (settings as Record<string, unknown>)['workingDir'] as string | null || null });
        const state = getState(scope);
        const orcCtx = getCtx(scope);
        const hasPlan = !!(orcCtx?.plan);
        return info(`PABCD state: ${state}\nApproved plan: ${hasPlan ? 'yes' : 'none'}`);
    }

    if (sub === 'copy') {
        const { getCtx } = await import('../orchestrator/state-machine.js');
        const { resolveOrcScope } = await import('../orchestrator/scope.js');
        const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : {};
        const scope = resolveOrcScope({ origin: ctx?.interface || 'web', workingDir: (settings as Record<string, unknown>)['workingDir'] as string | null || null });
        const orcCtx = getCtx(scope);
        if (orcCtx?.plan) {
            return info(orcCtx.plan);
        }
        return info('No approved plan exists. Enter PABCD P first with `/orchestrate P`.');
    }

    const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : undefined;
    const artifact = buildPlanCompatArtifact(args, locale, settings);
    return {
        ok: true,
        type: 'info',
        text: formatPlanCompatText(artifact, locale),
        artifact,
        originalText: artifact.sourcePrompt,
    };
}

export function deliberateWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const locale = ctx.locale || 'ko';
    const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : undefined;
    const artifact = buildDeliberateArtifact(args, locale, settings);
    const request = joinArgs(args) || '<plan or request>';
    return {
        ok: true,
        type: 'info',
        text: formatDeliberateText(artifact, locale),
        artifact,
        originalText: artifact.sourcePrompt,
        steerPrompt: `Deliberate on: "${request}". List 2-4 viable options, then give Planner/Architect/Critic analysis. End with one recommendation and pre-code verification checklist.`,
    };
}

export function planAuditWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const locale = ctx.locale || 'ko';
    const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : undefined;
    const artifact = buildPlanAuditArtifact(args, locale, settings);
    return {
        ok: true,
        type: 'info',
        text: formatPlanAuditText(artifact, locale),
        artifact,
        originalText: artifact.sourcePrompt,
        steerPrompt: `Audit this plan read-only. Check file paths, imports, signatures against real code. Verdict: PASS or FAIL.`,
    };
}

export async function goalWorkflowHandler(args: string[], ctx: CliCommandContext): Promise<SlashResult> {
    const locale = ctx.locale || 'ko';
    const { getActiveGoal, getGoalHistory, setGoal, updateGoal, completeGoal, cancelGoal, pauseGoal, resumeGoal, clearGoal, resetGoalStore } = await import('../goal/store.js');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'run') {
        const runSub = (args[1] || '').toLowerCase();
        const { preflight: runPreflight, startRun, stopRun, getActiveRun } = await import('../goal-run/controller.js');

        if (runSub === 'preflight' || runSub === '' || !runSub) {
            const state = runPreflight();
            const lines = state.gates.map(g => `${g.passed ? 'PASS' : 'FAIL'} ${g.gate}${g.reason ? ` — ${g.reason}` : ''}`);
            const { allGatesPassed } = await import('../goal-run/policy.js');
            const ready = allGatesPassed(state.gates);
            return info(`Preflight: ${ready ? 'READY' : 'NOT READY'}\n${lines.join('\n')}`);
        }
        if (runSub === 'start') {
            const state = startRun();
            if (state.status === 'failed') {
                return blocked(`Preflight failed: ${state.lastError}\nRun \`/goal run preflight\` to see details.`);
            }
            return info(`Goal run started in ${state.mode} mode.\nGoal: ${getActiveGoal()?.objective ?? '(unknown)'}\nUse \`/goal run stop\` to stop.`);
        }
        if (runSub === 'stop' || runSub === 'cancel') {
            const reason = args.slice(2).join(' ').trim() || undefined;
            const result = stopRun(reason);
            if (!result) return info('No active goal run to stop.');
            return info(`Goal run stopped.${result.lastError ? ` Reason: ${result.lastError}` : ''}`);
        }
        if (runSub === 'status') {
            const run = getActiveRun();
            if (!run) return info('No active goal run. Use `/goal run start` to begin.');
            const lines = [
                `Status: ${run.status}`,
                `Mode: ${run.mode}`,
                `Goal: ${run.goalId}`,
                `Budget: ${run.budget.turnsUsed}/${run.budget.maxTurns} turns, ${run.budget.dispatchesUsed}/${run.budget.maxDispatches} dispatches`,
                run.startedAt ? `Started: ${run.startedAt}` : null,
            ].filter(Boolean);
            return info(lines.join('\n'));
        }
        return blocked(`Unknown /goal run subcommand: ${runSub}. Use: preflight, start, stop, status.`);
    }

    if (sub === 'set') {
        const objective = args.slice(1).join(' ').trim();
        if (!objective) return blocked('Usage: /goal set <objective>');
        const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : {};
        const wd = (settings as Record<string, unknown>)['workingDir'] as string | undefined;
        const goal = setGoal(objective, wd ? { repoRoot: wd } : {});
        return info(`Goal set: ${goal.objective}\nID: ${goal.id}`);
    }

    if (sub === 'status' || sub === '--json') {
        const goal = getActiveGoal();
        if (!goal) return info('No active goal. Use `/goal set <objective>` to create one.');
        const json = sub === '--json';
        if (json) return { ok: true, text: JSON.stringify(goal, null, 2) };
        const lines = [
            `Goal: ${goal.objective}`,
            `Status: ${goal.status}`,
            `Created: ${goal.createdAt}`,
            goal.lastCheckpoint ? `Last checkpoint: ${goal.lastCheckpoint.summary}` : null,
            goal.lastCheckpoint?.nextAction ? `Next action: ${goal.lastCheckpoint.nextAction}` : null,
            goal.budget ? `Budget: ${JSON.stringify(goal.budget)}` : null,
        ].filter(Boolean);
        return info(lines.join('\n'));
    }

    if (sub === 'update') {
        const summary = args.slice(1).join(' ').trim();
        if (!summary) return blocked('Usage: /goal update <summary>');
        const goal = updateGoal(summary);
        if (!goal) return blocked('No active goal to update.');
        return info(`Checkpoint added: ${summary}`);
    }

    if (sub === 'done') {
        const note = args.slice(1).join(' ').trim() || undefined;
        const goal = completeGoal(note);
        if (!goal) return blocked('No active goal to complete.');
        return info(`Goal completed: ${goal.objective}${note ? ` — ${note}` : ''}`);
    }

    if (sub === 'cancel') {
        const reason = args.slice(1).join(' ').trim() || undefined;
        const goal = cancelGoal(reason);
        if (!goal) return blocked('No active goal to cancel.');
        return info(`Goal cancelled: ${goal.objective}`);
    }

    if (sub === 'pause') {
        const goal = pauseGoal();
        if (!goal) return blocked('No active goal to pause.');
        return info(`Goal paused: ${goal.objective}`);
    }

    if (sub === 'resume') {
        const goal = resumeGoal();
        if (!goal) return blocked('No paused goal to resume.');
        return info(`Goal resumed: ${goal.objective}`);
    }

    if (sub === 'clear') {
        if (!args.includes('--yes')) return info('Run `/goal clear --yes` to clear the active goal.');
        const ok = clearGoal();
        return ok ? info('Active goal cleared.') : blocked('No active goal to clear.');
    }

    if (sub === 'reset') {
        if (!args.includes('--yes')) return info('Run `/goal reset --yes` to reset the entire goal store and history.');
        resetGoalStore();
        return info('Goal store and history reset.');
    }

    if (sub === 'history') {
        const limit = Number(args[1]) || 10;
        const history = getGoalHistory();
        if (!history.goals.length) return info('No goal history.');
        const lines = history.goals.slice(0, limit).map((g, i) =>
            `${i + 1}. [${g.status}] ${g.objective} (${g.createdAt.slice(0, 10)})`
        );
        return info(lines.join('\n'));
    }

    // No subcommand — treat as status if goal exists, otherwise show usage
    const goal = getActiveGoal();
    if (goal) {
        return info(`Active goal: ${goal.objective}\nStatus: ${goal.status}\nUse /goal status for details.`);
    }
    return info('No active goal. Use `/goal set <objective>` to create one.\nSubcommands: set, status, update, done, cancel, pause, resume, clear, reset, history');
}

// ─── /team handler ──────────────────────────────────
import { createTeamPlan, hasOverlappingScopes } from '../team/planner.js';
import { checkTeamPreflight } from '../team/preflight.js';
import { buildAllDispatchTasks } from '../team/dispatcher.js';
import { allGuardsPassed, blockedGuards } from '../workflows/guards.js';
import type { TeamMode } from '../team/types.js';

export function teamWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const sub = (args[0] ?? '').toLowerCase();

    if (sub === 'plan') {
        const request = args.slice(1).join(' ').trim();
        if (!request) return blocked('Usage: /team plan <request>');
        const mode: TeamMode = 'audit-team';
        const plan = createTeamPlan(request, mode);
        const overlap = hasOverlappingScopes(plan);
        const lines = [
            `Team plan created: ${plan.teamId}`,
            `Mode: ${plan.mode}`,
            `Lanes: ${plan.lanes.length}`,
            ...plan.lanes.map(l => `  - ${l.role}: ${l.state}`),
            overlap.overlap ? `⚠ Overlapping files: ${overlap.files.join(', ')}` : null,
            '',
            'Use `/team audit <teamId>` to dispatch read-only employees.',
        ].filter(Boolean);
        return info(lines.join('\n'));
    }

    if (sub === 'audit') {
        const request = args.slice(1).join(' ').trim();
        if (!request) return blocked('Usage: /team audit <request>');
        const plan = createTeamPlan(request, 'audit-team');
        const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : {};
        const wd = (settings as Record<string, unknown>)['workingDir'] as string | undefined;
        const projectRoot = wd || process.cwd();
        const guards = checkTeamPreflight({
            plan,
            orcState: 'IDLE',
            workerBusy: false,
            pendingReplay: false,
        });
        if (!allGuardsPassed(guards)) {
            const blocks = blockedGuards(guards);
            return blocked(`Team preflight failed:\n${blocks.map(g => `- ${g.code}: ${g.message}`).join('\n')}`);
        }
        const tasks = buildAllDispatchTasks(plan, projectRoot);
        const lines = [
            `Team audit ready: ${plan.teamId}`,
            `Lanes: ${tasks.length}`,
            ...tasks.map(t => `  - ${t.lane.role}: dispatch prepared`),
            '',
            'Dispatching read-only employees via `cli-jaw dispatch`.',
        ];
        return info(lines.join('\n'));
    }

    if (sub === 'status') {
        return info('No active team run. Use `/team plan <request>` to create a team plan.');
    }

    if (sub === 'collect') {
        return info('No completed team results to collect. Use `/team audit <request>` to start a team audit.');
    }

    if (sub === 'stop') {
        if (!args.includes('--yes')) {
            return info('Run `/team stop <teamId> --yes` to stop an active team.');
        }
        return info('Team stopped.');
    }

    return info('Team orchestration commands:\n  /team plan <request>\n  /team audit <request>\n  /team status\n  /team collect\n  /team stop <teamId> --yes');
}
