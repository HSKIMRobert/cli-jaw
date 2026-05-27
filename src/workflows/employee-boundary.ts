// Shared assertions for Boss-only dispatch and employee boundaries.
// Does NOT import provider SDKs.

import type { OrcStateName } from '../orchestrator/state-machine.js';
import { hasImplementationDelegation } from './handoff.js';

export function assertBossOnlyDispatch(isBoss: boolean): void {
    if (!isBoss) {
        throw new Error('Only the Boss agent can dispatch jaw employees');
    }
}

export function assertNoImplementationDelegation(phase: OrcStateName, taskBody: string): void {
    if (phase === 'B' && hasImplementationDelegation(taskBody)) {
        throw new Error('B-phase employees are read-only verifiers; implementation delegation is forbidden');
    }
}

export function assertReadOnlyAudit(phase: OrcStateName, taskBody: string): void {
    if (phase === 'A') {
        const lc = taskBody.toLowerCase();
        if (lc.includes('write file') || lc.includes('create file') || lc.includes('modify code')) {
            throw new Error('A-phase audit must be read-only');
        }
    }
}

export function validateDispatchTask(opts: {
    isBoss: boolean;
    phase: OrcStateName;
    taskBody: string;
}): { ok: boolean; error?: string } {
    try {
        assertBossOnlyDispatch(opts.isBoss);
        assertNoImplementationDelegation(opts.phase, opts.taskBody);
        assertReadOnlyAudit(opts.phase, opts.taskBody);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}
