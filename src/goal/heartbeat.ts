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

export function buildGoalContinuation(): GoalContinuationResult {
    const goal = getActiveGoal();
    if (!goal || goal.status !== 'active') {
        return { shouldContinue: false, reason: 'no_active_goal' };
    }

    const orcState = getState();
    if (orcState !== 'IDLE') {
        return { shouldContinue: false, reason: `pabcd_active:${orcState}` };
    }

    const workers = getActiveWorkers();
    if (workers.length > 0) {
        return { shouldContinue: false, reason: 'workers_busy' };
    }

    if (hasPendingWorkerReplays()) {
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
        '',
        'Continue the goal. Update progress with `/goal update <summary>` when you reach a milestone.',
        'If the goal is complete, run `/goal done`.',
        'If blocked, explain what is needed.',
        '',
        'RULE: If you need to wait for an external event (CI, deploy, build), register a temporary heartbeat job in heartbeat.json to poll. ScheduleWakeup only works in /loop mode. NEVER say "will report when done" and exit.',
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
