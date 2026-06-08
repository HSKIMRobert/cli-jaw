import { settings } from '../core/config.js';
import type { WorkflowArtifact } from '../cli/types.js';
import {
    createWorkflowArtifactId,
    createWorkflowStorage,
    projectKeyFromSettings,
} from './artifacts.js';

export interface ReviewFlags {
    fix: boolean;
    dispatch: boolean;
}

export function parseReviewFlags(args: string[]): ReviewFlags {
    return {
        fix: args.includes('--fix'),
        dispatch: args.includes('--dispatch'),
    };
}

export function buildReviewArtifact(
    flags: ReviewFlags,
    locale = 'ko',
    settingsOverride?: unknown,
): WorkflowArtifact {
    const s = settingsOverride ?? settings;
    const projectKey = projectKeyFromSettings(s);
    const workingDir = (s && typeof s === 'object' ? (s as Record<string, unknown>)['workingDir'] : null) as string | null;
    const projectRoot = workingDir || '<absolute project root>';

    const mode = flags.dispatch ? 'subagent' : 'direct';
    const fixLabel = flags.fix ? ' + auto-fix' : '';
    const sourcePrompt = `/review${flags.fix ? ' --fix' : ''}${flags.dispatch ? ' --dispatch' : ''}`;

    return {
        id: createWorkflowArtifactId('reviewReport'),
        kind: 'reviewReport',
        version: 1,
        title: `Code Review (${mode}${fixLabel})`,
        sourcePrompt,
        summary: `One-shot code review: mode=${mode}, fix=${flags.fix}`,
        locale,
        createdAt: new Date().toISOString(),
        lifetime: 'ephemeral',
        durable: false,
        authoritative: false,
        storage: createWorkflowStorage(projectKey),
        sections: [
            { id: 'project-root', title: 'Project root', body: projectRoot, format: 'plain', required: true },
            { id: 'target', title: 'Review target', body: 'git diff HEAD (uncommitted changes)', format: 'plain', required: true },
            { id: 'mode', title: 'Mode', body: mode, format: 'plain', required: true },
            { id: 'fix', title: 'Auto-fix', body: flags.fix ? 'enabled' : 'disabled', format: 'plain', required: true },
        ],
        suggestedNextActions: [
            { id: 'copy', labelKey: 'cmd.artifact.action.copy', kind: 'copy' },
        ],
    };
}

export function buildReviewSteerPrompt(flags: ReviewFlags, projectRoot: string): string {
    const lines = [
        `[System] User invoked /review. Perform a one-shot code review of uncommitted changes.`,
        '',
        `Project root: ${projectRoot}`,
        '',
        'Steps:',
        '1. Run `git diff HEAD` in the project root to get the diff. If empty, report "No uncommitted changes to review." and stop.',
        '2. Read the dev-code-reviewer skill (`cat` the SKILL.md from skills/dev-code-reviewer/).',
        '3. Run pre-scan: `npx tsc --noEmit` (if TypeScript project). Note any errors.',
        '4. Review the diff following the skill methodology in order:',
        '   - Architecture: right layer, right abstraction?',
        '   - Correctness: logic errors, edge cases, null handling, error paths',
        '   - Security: input validation, injection risks, secrets exposure',
        '   - Performance: N+1, unbounded collections, missing indexes',
        '   - Maintainability: naming, structure, complexity',
        '5. Output a structured review report with findings grouped by severity:',
        '   - Each finding: `file:line` | Severity (Critical/High/Medium/Low) | Description | Suggested fix',
        '6. End with a verdict: ✅ Approve / 🔧 Approve with suggestions / ⚠️ Request changes / 🚫 Block',
    ];

    if (flags.fix) {
        lines.push(
            '',
            'AUTO-FIX MODE:',
            '7. After the review report, auto-fix all Critical and High severity findings.',
            '8. For each fix: edit the file, verify it compiles, report what changed.',
            '9. Re-run `npx tsc --noEmit` after all fixes to confirm no regressions.',
        );
    }

    if (flags.dispatch) {
        lines.push(
            '',
            'DISPATCH MODE:',
            'Delegate this entire review to a CLI subagent (Agent tool). Do NOT do the review yourself.',
            'Pass the full instruction above to the subagent. Synthesize and relay its findings.',
        );
    }

    return lines.join('\n');
}

export function formatReviewText(artifact: WorkflowArtifact): string {
    const lines = [
        artifact.title,
        '',
        ...artifact.sections.flatMap(section => [
            `## ${section.title}`,
            section.body,
            '',
        ]),
        'Review will start automatically.',
    ];
    return lines.join('\n').trim();
}
