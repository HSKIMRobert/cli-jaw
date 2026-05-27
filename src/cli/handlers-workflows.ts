import { t } from '../core/i18n.js';
import { buildPlanCompatArtifact, formatPlanCompatText } from '../workflows/plan.js';
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

export function interviewWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const request = joinArgs(args) || '<rough request>';
    const locale = ctx.locale || 'ko';
    return info([
        tr('cmd.workflow.interview.title', locale, 'Requirements interview'),
        '',
        `Request: ${request}`,
        '',
        'Ask one clarifying question at a time.',
        'Score goal, constraints, success criteria, and context.',
        'Stop when the spec is clear enough for PABCD P.',
    ].join('\n'));
}

export function planWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const locale = ctx.locale || 'ko';
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
    const request = joinArgs(args) || '<plan or request>';
    const locale = ctx.locale || 'ko';
    return info([
        tr('cmd.workflow.deliberate.title', locale, 'Role-based plan review'),
        '',
        `Input: ${request}`,
        '',
        'Planner: propose the implementation approach.',
        'Architect: check integration and codebase fit.',
        'Critic: identify risks, missing tests, and alternatives.',
        'Finish with one agreed plan and explicit tradeoffs.',
    ].join('\n'));
}

export function planAuditWorkflowHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const plan = joinArgs(args) || '<current PABCD plan>';
    const locale = ctx.locale || 'ko';
    return info([
        tr('cmd.workflow.planAudit.title', locale, 'Read-only plan audit'),
        '',
        'Project root: <absolute project root>',
        '',
        `Plan: ${plan}`,
        '',
        'Read-only audit only.',
        'Verify file paths, imports, signatures, tests, docs/source-of-truth, and numbered devlog convention.',
        'PABCD A employee verdict must be PASS or FAIL.',
    ].join('\n'));
}

export function goalWorkflowStubHandler(args: string[], ctx: CliCommandContext): SlashResult {
    const locale = ctx.locale || 'ko';
    if ((args[0] || '').toLowerCase() === 'run') {
        return blocked(tr(
            'cmd.workflow.goalRun.notReady',
            locale,
            '/goal run is available after Phase 5 adds permissions, checkpoints, and stop controls.',
        ), 'workflow_requires_preflight');
    }
    return blocked(tr(
        'cmd.workflow.goal.notReady',
        locale,
        '/goal is available after Phase 3 adds durable goal state.',
    ));
}
