import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JAW_HOME } from '../core/config.js';
import type { GoalState, GoalHistory, GoalCheckpoint, GoalBudget, GoalPauseAudit } from './types.js';

const GOAL_DIR = path.join(JAW_HOME, 'goal');
const ACTIVE_PATH = path.join(GOAL_DIR, 'active.json');
const HISTORY_PATH = path.join(GOAL_DIR, 'history.json');
export const MAX_GOAL_OBJECTIVE_CHARS = 10000;

function ensureDir(): void {
    fs.mkdirSync(GOAL_DIR, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
    ensureDir();
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
}

function readJson<T>(filePath: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch (error) {
        if (fs.existsSync(filePath)) {
            console.warn(`[goal] failed to read ${filePath}: ${(error as Error).message}`);
        }
        return null;
    }
}

export function getActiveGoal(): GoalState | null {
    return readJson<GoalState>(ACTIVE_PATH);
}

export function getGoalHistory(): GoalHistory {
    return readJson<GoalHistory>(HISTORY_PATH) ?? { goals: [] };
}

export function setGoal(objective: string, opts?: { repoRoot?: string | undefined; budget?: GoalBudget | undefined; replace?: boolean }): GoalState {
    const normalizedObjective = objective.trim();
    if (!normalizedObjective) throw new Error('Goal objective is required.');
    if (normalizedObjective.length > MAX_GOAL_OBJECTIVE_CHARS) {
        throw new Error(`Goal objective exceeds ${MAX_GOAL_OBJECTIVE_CHARS} characters.`);
    }
    const existing = getActiveGoal();
    if (existing && (existing.status === 'active' || existing.status === 'paused')) {
        if (!opts?.replace) {
            throw new Error(`Active goal already exists: "${existing.objective.slice(0, 80)}". Cancel or complete it first, or pass replace: true.`);
        }
        archiveGoal(existing);
    }
    const now = new Date().toISOString();
    const goal: GoalState = {
        id: crypto.randomUUID().slice(0, 12),
        objective: normalizedObjective,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        repoRoot: opts?.repoRoot,
        budget: opts?.budget,
        checkpoints: [],
    };
    writeJson(ACTIVE_PATH, goal);
    return goal;
}

export function updateGoal(summary: string, nextAction = '', evidence: string[] = []): GoalState | null {
    const goal = getActiveGoal();
    if (!goal || goal.status !== 'active') return null;
    const cp: GoalCheckpoint = {
        summary,
        nextAction,
        evidencePaths: evidence,
        timestamp: new Date().toISOString(),
    };
    goal.checkpoints.push(cp);
    goal.lastCheckpoint = cp;
    goal.updatedAt = new Date().toISOString();
    writeJson(ACTIVE_PATH, goal);
    return goal;
}

export function completeGoal(note?: string): GoalState | null {
    const goal = getActiveGoal();
    if (!goal) {
        forceDeleteActive();
        return null;
    }
    goal.status = 'complete';
    if (note) goal.completionNote = note;
    goal.updatedAt = new Date().toISOString();
    archiveGoal(goal);
    forceDeleteActive();
    return goal;
}

export function cancelGoal(reason?: string): GoalState | null {
    const goal = getActiveGoal();
    if (!goal) {
        forceDeleteActive();
        return null;
    }
    goal.status = 'cancelled';
    if (reason) goal.cancelReason = reason;
    goal.updatedAt = new Date().toISOString();
    archiveGoal(goal);
    forceDeleteActive();
    return goal;
}

export function pauseGoal(opts?: { reason?: string | undefined; audit?: GoalPauseAudit | undefined }): GoalState | null {
    const goal = getActiveGoal();
    if (!goal) return null;
    if (goal.status === 'paused' && opts?.audit) {
        if (opts.reason) goal.pauseReason = opts.reason;
        goal.pauseAudit = opts.audit;
        goal.updatedAt = new Date().toISOString();
        writeJson(ACTIVE_PATH, goal);
        return goal;
    }
    if (goal.status !== 'active') return null;
    goal.status = 'paused';
    if (opts?.reason) goal.pauseReason = opts.reason;
    if (opts?.audit) goal.pauseAudit = opts.audit;
    goal.updatedAt = new Date().toISOString();
    writeJson(ACTIVE_PATH, goal);
    return goal;
}

export function resumeGoal(): GoalState | null {
    const goal = getActiveGoal();
    if (!goal || goal.status !== 'paused') return null;
    goal.status = 'active';
    goal.updatedAt = new Date().toISOString();
    writeJson(ACTIVE_PATH, goal);
    return goal;
}

export function clearGoal(): boolean {
    const goal = getActiveGoal();
    if (!goal) {
        forceDeleteActive();
        return false;
    }
    goal.status = 'cancelled';
    goal.updatedAt = new Date().toISOString();
    archiveGoal(goal);
    forceDeleteActive();
    return true;
}

export function resetGoalStore(): void {
    try { fs.unlinkSync(ACTIVE_PATH); } catch { /* noop */ }
    try { fs.unlinkSync(HISTORY_PATH); } catch { /* noop */ }
}

function forceDeleteActive(): void {
    try { fs.unlinkSync(ACTIVE_PATH); } catch { /* file may not exist */ }
}

function archiveGoal(goal: GoalState): void {
    const history = getGoalHistory();
    history.goals.unshift(goal);
    if (history.goals.length > 50) history.goals.length = 50;
    writeJson(HISTORY_PATH, history);
}

/** Completion-gate predicate: AI may complete only if the latest checkpoint carries at least one NON-BLANK verification evidence entry (blank/whitespace entries never satisfy the gate, regardless of how they were inserted). */
export function goalHasCompletionEvidence(goal: GoalState | null): boolean {
    return (goal?.lastCheckpoint?.evidencePaths ?? []).some(e => typeof e === 'string' && e.trim().length > 0);
}
