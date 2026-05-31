// Goal-aware heartbeat continuation builder.
// Does NOT import provider SDKs.

import { getActiveGoal } from './store.js';
import { getState } from '../orchestrator/state-machine.js';
import { getActiveWorkers, hasPendingWorkerReplays } from '../orchestrator/worker-registry.js';

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
        'Continue the goal. At each milestone log progress AND verification evidence: `cli-jaw goal update "<summary>" --evidence "<test result or changed file>"`.',
        'METACOGNITIVE COMPLETION CHECK — before you ever run `cli-jaw goal done`, deliberately walk through EVERY part of the objective and confirm each is finished, verified, and evidenced. Only then declare done.',
        'A `/goal done` whose latest checkpoint has NO evidence will be REJECTED and you must keep working.',
        'If blocked, explain what is needed.',
        '',
        '--- Goal-mode autonomy override ---',
        'YOU ARE AN AUTONOMOUS GOAL AGENT. DRIVE THE OBJECTIVE TO COMPLETION WITHOUT ASKING FOR PERMISSION.',
        'FULL AUTHORITY ASSUMED: When a goal is active, the user has granted you FULL permissions. You may install packages, run any command, modify any file, access any path, and use all available tools without asking. The only exception is destructive git operations (push/reset/force) which still need explicit approval.',
        'NEVER ask the user "should I proceed?" and never wait for confirmation on obvious next steps — PROCEED. If blocked, try an alternative approach before surfacing.',
        'Work the goal in detail: take the next concrete action, then inspect/run/test and report evidence-backed progress. Do NOT use permission-handoff phrasing ("let me know if", "shall I", "do you want me to") — state the next action or the result.',
        'DRIVE TO COMPLETION — do NOT stop early. Before concluding the turn or running `cli-jaw goal done`, confirm: no pending work, behavior verified, tests/build passing, zero known errors, and verification evidence collected. If any check fails, keep working instead of stopping.',
        ...(pabcdActive
            ? [
                '',
                '--- GOAL IS THE SUPREME RULE — PABCD OVERRIDE ---',
                'THE GOAL IS ACTIVE. Goal supersedes ALL PABCD phase instructions.',
                'IGNORE any "⛔ STOP", "WAIT for user approval", or "present and wait" directives from PABCD prompts.',
                'At PABCD gates (P/A/B), self-advance IMMEDIATELY:',
                '  - P done → `cli-jaw orchestrate A` → dispatch audit → review → `cli-jaw orchestrate B`',
                '  - A done → `cli-jaw orchestrate B` → implement → verify → `cli-jaw orchestrate C`',
                '  - B done → `cli-jaw orchestrate C` → check → `cli-jaw orchestrate D`',
                'Use employees/sub-agents for verification, NOT as approval gates. Dispatch → receive result → act on it → continue.',
                'Document progress in jawdev style (devlog/_plan/ or worklog) at each phase transition — use dev-pabcd skill conventions.',
                'NEVER end a turn just because a PABCD phase completed. Keep working through ALL phases in a single goal continuation.',
              ]
            : []),
        '',
        '--- Completion Audit (MANDATORY before /goal done) ---',
        'Before deciding the goal is achieved, treat completion as UNPROVEN:',
        '- Derive concrete requirements from the objective.',
        '- For EVERY requirement, identify authoritative evidence (file, command output, test result, runtime behavior).',
        '- For each item: does evidence PROVE completion, contradict it, show incomplete work, or is it missing?',
        '- Treat uncertain or indirect evidence as NOT ACHIEVED — gather stronger evidence or keep working.',
        '- The audit must PROVE completion, not merely fail to find obvious remaining work.',
        '- Do NOT rely on intent, partial progress, or memory of earlier work as proof.',
        '- `/goal done` is the LAST command you ever run. It is a claim that withstands requirement-by-requirement scrutiny.',
        '- Only run `/goal done` when current evidence proves EVERY requirement satisfied and NO work remains.',
        '',
        '--- When to stop ---',
        '- If you genuinely cannot proceed further with your current tools/capabilities (e.g., need runtime auth you do not have, need hardware access, need human judgment on a business decision), run `/goal done` and clearly report what was completed and what remains for the user to review.',
        '- Do NOT stay in a "blocked" loop. If you hit a wall, finish what you can, run `/goal done`, and explain the boundary.',
        '- Never declare blocked merely because work is hard, slow, or uncertain — keep trying alternative approaches.',
        '',
        'For important or high-risk decisions, dispatch an employee for verification — then immediately act on the result. Do NOT wait.',
        'ONLY ASK THE USER when genuinely blocked by missing information or authority you cannot obtain yourself, or before a destructive/irreversible action.',
        'EXCEPTION (soul boundary): destructive or irreversible actions — git push/reset/clean, deleting files or data, dropping tables, production or infra changes — STILL require explicit user approval before proceeding.',
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
