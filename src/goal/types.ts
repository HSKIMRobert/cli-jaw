export type GoalStatus = 'active' | 'paused' | 'blocked' | 'complete' | 'cancelled';
export type GoalMode = 'direct' | 'plan';

export interface GoalBudget {
    maxTurns?: number;
    maxMinutes?: number;
    maxDispatches?: number;
}

export interface GoalCheckpoint {
    summary: string;
    nextAction: string;
    evidencePaths: string[];
    timestamp: string;
}

export interface GoalPauseAudit {
    actor: 'agent' | 'human';
    evidence: string;
    timestamp: string;
}

export interface GoalState {
    id: string;
    objective: string;
    status: GoalStatus;
    goalMode?: GoalMode | undefined;
    createdAt: string;
    updatedAt: string;
    repoRoot?: string | undefined;
    worklogPath?: string | undefined;
    currentPhase?: string | undefined;
    budget?: GoalBudget | undefined;
    lastCheckpoint?: GoalCheckpoint | undefined;
    checkpoints: GoalCheckpoint[];
    pauseReason?: string | undefined;
    pauseAudit?: GoalPauseAudit | undefined;
    cancelReason?: string | undefined;
    completionNote?: string | undefined;
    agentPauseCount?: number | undefined;
}

export interface GoalHistory {
    goals: GoalState[];
}

export interface GoalEvent {
    type: 'set' | 'update' | 'pause' | 'resume' | 'done' | 'cancel' | 'clear' | 'reset';
    goalId: string;
    timestamp: string;
    detail?: string;
}
