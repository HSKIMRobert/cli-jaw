// Competitive gap registry: structured tracking of external feature patterns vs cli-jaw state.
// Does NOT import provider SDKs.

export type GapPriority = 'high' | 'medium' | 'low';
export type GapAdoptionStatus = 'done' | 'partial' | 'planned' | 'not-started';

export interface CompetitiveGap {
    id: string;
    feature: string;
    externalPattern: string;
    cliJawState: string;
    adoptionStatus: GapAdoptionStatus;
    priority: GapPriority;
    dependsOn?: string[];
    phaseRef?: string;
}

export const COMPETITIVE_GAPS: CompetitiveGap[] = [
    {
        id: '15B',
        feature: 'Workflow permission profiles',
        externalPattern: 'Codex sandbox/approval; OpenCode per-agent permissions; Claude tool allow/deny',
        cliJawState: 'WorkflowPermissionProfile with read/edit/bash/network/MCP scopes',
        adoptionStatus: 'done',
        priority: 'high',
        phaseRef: 'Phase 7-13',
    },
    {
        id: '15C',
        feature: 'Checkpoint/restore',
        externalPattern: 'Gemini shadow git snapshots; Claude /rewind; Codex protected paths',
        cliJawState: 'Checkpoint store exists; pre-write hooks not wired',
        adoptionStatus: 'partial',
        priority: 'high',
        phaseRef: 'Phase 5',
    },
    {
        id: '15D',
        feature: 'Worktree team mode',
        externalPattern: 'OMX team isolated git worktrees; Claude subagent worktree',
        cliJawState: '/team gates write mode behind disjoint file scopes',
        adoptionStatus: 'planned',
        priority: 'high',
        dependsOn: ['Phase 14'],
    },
    {
        id: '15E',
        feature: 'Command bundle format',
        externalPattern: 'Gemini TOML custom commands; Claude skill folders',
        cliJawState: 'Static slash registry with workflow metadata',
        adoptionStatus: 'planned',
        priority: 'medium',
    },
    {
        id: '15F',
        feature: 'Hook lifecycle',
        externalPattern: 'Claude hooks; OMX hook events',
        cliJawState: 'Heartbeat/channel/trace events exist; no generic tool hooks',
        adoptionStatus: 'planned',
        priority: 'medium',
    },
    {
        id: '15G',
        feature: 'CLI JSON control plane',
        externalPattern: 'OMX team JSON API; Codex exec; Gemini reload/list',
        cliJawState: 'API routes exist; --json flags partially wired',
        adoptionStatus: 'partial',
        priority: 'medium',
    },
    {
        id: '15H',
        feature: 'Repo-map/context builder',
        externalPattern: 'Aider repo map; git diff/history context shaping',
        cliJawState: 'context-map/builder.ts exists with repo tree, hot files, diffs',
        adoptionStatus: 'done',
        priority: 'medium',
        phaseRef: 'Phase 8',
    },
    {
        id: '15I',
        feature: 'MCP status polish',
        externalPattern: 'Claude/Gemini visible MCP status/reload/auth',
        cliJawState: '/mcp sync/install exists; workflow preflight lacks MCP rows',
        adoptionStatus: 'planned',
        priority: 'medium',
    },
    {
        id: '15J',
        feature: 'Terminal polish',
        externalPattern: 'Claude /status /copy /export; Codex/Gemini robust TUI',
        cliJawState: 'Web UI strong; CLI product surfaces less polished',
        adoptionStatus: 'planned',
        priority: 'low',
    },
];

export function getGapsByStatus(status: GapAdoptionStatus): CompetitiveGap[] {
    return COMPETITIVE_GAPS.filter(g => g.adoptionStatus === status);
}

export function getGapsByPriority(priority: GapPriority): CompetitiveGap[] {
    return COMPETITIVE_GAPS.filter(g => g.priority === priority);
}

export function getGapSummary(): { total: number; done: number; partial: number; planned: number; notStarted: number } {
    return {
        total: COMPETITIVE_GAPS.length,
        done: getGapsByStatus('done').length,
        partial: getGapsByStatus('partial').length,
        planned: getGapsByStatus('planned').length,
        notStarted: getGapsByStatus('not-started').length,
    };
}
