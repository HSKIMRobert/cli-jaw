// Goal-aware heartbeat continuation builder.
// Does NOT import provider SDKs.

import { getActiveGoal } from './store.js';
import { getState } from '../orchestrator/state-machine.js';
import { getActiveWorkers, hasPendingWorkerReplays } from '../orchestrator/worker-registry.js';
import type { GoalState } from './types.js';

export interface GoalContinuationResult {
    shouldContinue: boolean;
    reason: string;
    prompt?: string;
}

const STALE_GOAL_MS = 3 * 24 * 60 * 60 * 1000;

export function buildGoalContinuation(): GoalContinuationResult {
    const goal = getActiveGoal();
    if (!goal || goal.status !== 'active') {
        return { shouldContinue: false, reason: 'no_active_goal' };
    }

    const lastUpdate = new Date(goal.updatedAt).getTime();
    if (Date.now() - lastUpdate > STALE_GOAL_MS) {
        return { shouldContinue: false, reason: 'goal_stale' };
    }

    const orcState = getState();
    // Goal continuation still fires during PABCD — the goal wraps the
    // orchestration cycle. The continuation prompt includes the current
    // PABCD state so the AI knows where it is.
    const pabcdActive = orcState !== 'IDLE';

    const workers = getActiveWorkers();
    if (workers.length > 0) {
        return { shouldContinue: false, reason: 'workers_busy' };
    }

    // During an active PABCD cycle the Boss dispatches employees synchronously and
    // consumes their results inline (`cli-jaw dispatch` returns via stdout); the
    // pendingReplay flag is async bookkeeping that routes/orchestrate.ts clears on
    // the dispatch response's `finish` event. At turn-end it can still be set due
    // to that async race — and the heartbeat safety net is deferred during PABCD —
    // so blocking here would strand the goal. Only block on pending replays OUTSIDE
    // orchestration, where a lingering replay means a genuinely undelivered result
    // awaiting drain. `workers_busy` (a genuinely running worker) still blocks above.
    if (!pabcdActive && hasPendingWorkerReplays()) {
        return { shouldContinue: false, reason: 'pending_replay' };
    }

    const checkpoint = goal.lastCheckpoint;
    const nextAction = checkpoint?.nextAction || 'Continue working on the objective.';
    const summary = checkpoint?.summary || 'No checkpoint yet.';

    const prompt = [
        `[goal-continuation] Active goal: ${goal.objective}`,
        `Last checkpoint: ${summary}`,
        `Next action: ${nextAction}`,
        `Goal ID: ${goal.id}`,
        ...(pabcdActive ? [`PABCD state: ${orcState}`] : []),
        '',
        'Continue the goal. Update progress with `cli-jaw goal update "<summary>"` when you reach a milestone.',
        'If the goal is complete, run `cli-jaw goal done`.',
        'If blocked, explain what is needed.',
        '',
        'RULE: If you need to wait for an external event (CI, deploy, build), use ScheduleWakeup to schedule a delayed check. The server intercepts ScheduleWakeup and resumes this session after the delay. NEVER say "will report when done" and exit.',
    ].join('\n');

    return { shouldContinue: true, reason: 'goal_active', prompt };
}

export function shouldHeartbeatContinueGoal(): boolean {
    return buildGoalContinuation().shouldContinue;
}

export function getGoalContinuationPrompt(): string | null {
    const result = buildGoalContinuation();
    return result.prompt ?? null;
}
