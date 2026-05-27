// Goal-run controller: manages run state and drives forward-only PABCD transitions.
// Does NOT import provider SDKs.

import type { GoalRunState, GoalRunMode, GoalRunBudget } from './types.js';
import { checkPreflightGates, allGatesPassed, checkBudget } from './policy.js';
import { classifyFailure } from './failure-matrix.js';
import { getActiveGoal } from '../goal/store.js';
import { getState } from '../orchestrator/state-machine.js';
import { getActiveWorkers, hasPendingWorkerReplays } from '../orchestrator/worker-registry.js';

let activeRun: GoalRunState | null = null;

const DEFAULT_BUDGET: GoalRunBudget = {
    maxTurns: 10,
    maxMinutes: 60,
    maxDispatches: 5,
    turnsUsed: 0,
    minutesUsed: 0,
    dispatchesUsed: 0,
};

export function getActiveRun(): GoalRunState | null {
    return activeRun;
}

export function preflight(mode: GoalRunMode = 'assist'): GoalRunState {
    const goal = getActiveGoal();
    const gates = checkPreflightGates({
        hasGoal: !!goal,
        orcState: getState(),
        workerBusy: getActiveWorkers().length > 0,
        pendingReplay: hasPendingWorkerReplays(),
    });
    const budgetGate = checkBudget(DEFAULT_BUDGET);
    gates.push(budgetGate);

    return {
        goalId: goal?.id ?? '',
        mode,
        status: 'preflight',
        budget: { ...DEFAULT_BUDGET },
        gates,
    };
}

export function startRun(mode: GoalRunMode = 'assist'): GoalRunState {
    const state = preflight(mode);
    if (!allGatesPassed(state.gates)) {
        state.status = 'failed';
        state.lastError = state.gates.filter(g => !g.passed).map(g => g.reason).join('; ');
        return state;
    }
    state.status = 'running';
    state.startedAt = new Date().toISOString();
    activeRun = state;
    return state;
}

export function pauseRun(): GoalRunState | null {
    if (!activeRun || activeRun.status !== 'running') return null;
    activeRun.status = 'paused';
    return activeRun;
}

export function resumeRun(): GoalRunState | null {
    if (!activeRun || activeRun.status !== 'paused') return null;
    const gates = checkPreflightGates({
        hasGoal: !!getActiveGoal(),
        orcState: getState(),
        workerBusy: getActiveWorkers().length > 0,
        pendingReplay: hasPendingWorkerReplays(),
    });
    const budgetGate = checkBudget(activeRun.budget);
    gates.push(budgetGate);

    if (!allGatesPassed(gates)) {
        activeRun.gates = gates;
        activeRun.lastError = gates.filter(g => !g.passed).map(g => g.reason).join('; ');
        return activeRun;
    }
    activeRun.status = 'running';
    activeRun.gates = gates;
    return activeRun;
}

export function stopRun(reason?: string): GoalRunState | null {
    if (!activeRun) return null;
    activeRun.status = 'stopped';
    activeRun.stoppedAt = new Date().toISOString();
    if (reason) activeRun.lastError = reason;
    const result = activeRun;
    activeRun = null;
    return result;
}

export function completeRun(): GoalRunState | null {
    if (!activeRun) return null;
    activeRun.status = 'completed';
    activeRun.stoppedAt = new Date().toISOString();
    const result = activeRun;
    activeRun = null;
    return result;
}

export function recordTurn(): void {
    if (activeRun?.status === 'running') {
        activeRun.budget.turnsUsed++;
    }
}

export function recordDispatch(): void {
    if (activeRun?.status === 'running') {
        activeRun.budget.dispatchesUsed++;
    }
}

export function handleFailure(phase: string, failureType: Parameters<typeof classifyFailure>[0]['failureType'], retryCount = 0) {
    const decision = classifyFailure({ phase, failureType, retryCount });
    if (decision.action === 'stop' && activeRun) {
        stopRun(decision.reason);
    }
    return decision;
}
