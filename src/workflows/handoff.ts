// Builds Boss-safe employee dispatch tasks from workflow metadata.
// Does NOT import provider SDKs.

import type { OrcStateName } from '../orchestrator/state-machine.js';
import type { WorkflowHandoff, WorkflowHandoffMode } from './types.js';

const VERDICT_TOKENS: Record<string, string[]> = {
    A: ['PASS', 'FAIL'],
    B: ['DONE', 'NEEDS_FIX'],
    advisory: ['PASS', 'NEEDS_FIX'],
};

export function buildHandoff(opts: {
    projectRoot: string;
    phase: OrcStateName;
    mode: WorkflowHandoffMode;
    taskDescription: string;
}): WorkflowHandoff {
    const verdictKey = opts.mode === 'advisory'
        ? 'advisory'
        : (opts.phase === 'A' || opts.phase === 'B') ? opts.phase : 'advisory';

    const verdictTokens = VERDICT_TOKENS[verdictKey] ?? ['PASS', 'FAIL'];
    const modeHeader = opts.mode === 'read-only'
        ? 'READ-ONLY verification. Do not modify files.'
        : opts.mode === 'verification'
            ? 'VERIFICATION only. Do not implement new code.'
            : 'Advisory review. Results are non-binding.';

    const taskBody = [
        `Project root: ${opts.projectRoot}`,
        '',
        modeHeader,
        'If unsure of state, inspect before acting. Never chain actions through uncertainty.',
        `Report verdict as one of: ${verdictTokens.join(' | ')}`,
        '',
        opts.taskDescription,
    ].join('\n');

    return {
        projectRoot: opts.projectRoot,
        mode: opts.mode,
        phase: opts.phase,
        taskBody,
        verdictTokens,
    };
}

export function hasImplementationDelegation(taskBody: string): boolean {
    const lc = taskBody.toLowerCase();
    const delegationPatterns = [
        'implement the feature',
        'implement this',
        'write the code',
        'create the file',
        'write the function',
        'implement code',
        'build the module',
    ];
    return delegationPatterns.some(p => lc.includes(p));
}
