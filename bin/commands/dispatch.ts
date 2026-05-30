#!/usr/bin/env node
// bin/commands/dispatch.ts — CLI: jaw dispatch --agent <name> --task <task>
// Dispatches a jaw employee via the server API (pipe-mode compatible).

import { loadSettings, getServerUrl } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';
import { errString, isConnRefused } from '../_http-client.js';
import { unwrapEmployeeSummaries } from './dispatch-helpers.js';
import {
    displayShellCommand,
    displayShellCommandDetail,
} from '../../src/shared/shell-command-display.js';

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw dispatch — send task to an employee agent

  Usage: jaw dispatch --agent "Name" --task "instruction" [--watch]

  Options:
    --agent <name>    Employee name (must match settings.json employees)
    --task <text>     Task instruction to send
    --mutable         Allow employee to write/modify files (default: read-only)
    --scope <path>    Restrict writes to a subdirectory (optional, requires --mutable)
    --watch           Print live sanitized employee progress until completion
    --json            JSON output

  Result is returned via stdout. Employee names are case-sensitive.

  Examples:
    jaw dispatch --agent "Frontend" --task "Fix CSS bug in header"
    jaw dispatch --agent "Backend" --task "Add rate limiting to /api/chat"
`);

loadSettings();

if (process.env["JAW_EMPLOYEE_MODE"] === '1') {
    console.error('❌ jaw employee sessions cannot dispatch other employees. Complete the assigned task directly.');
    process.exit(2);
}

// Phase 8: boss-only dispatch. Token must be inherited from the server process.
const bossToken = process.env["JAW_BOSS_TOKEN"] || '';
if (!bossToken) {
    console.error('❌ JAW_BOSS_TOKEN missing. This session is not authorized to dispatch employees.');
    console.error('   Employees cannot dispatch. If you are the boss, ensure cli-jaw serve is running and this process inherited its env.');
    process.exit(2);
}

const portIdx = process.argv.indexOf('--port');
const PORT = (portIdx !== -1 && process.argv[portIdx + 1]) ? process.argv[portIdx + 1] : undefined;
const BASE = getServerUrl(PORT);

function getFlag(name: string): string | undefined {
    const idx = process.argv.indexOf(name);
    if (idx === -1 || !process.argv[idx + 1]) return undefined;
    return process.argv[idx + 1];
}

const agent = getFlag('--agent');
const task = getFlag('--task');
const mutable = process.argv.includes('--mutable');
const scope = getFlag('--scope');
const watch = process.argv.includes('--watch');

if (!agent || !task) {
    console.error('Usage: jaw dispatch --agent <name> --task <task>');
    console.error('  --agent   Employee name (e.g., Frontend, Backend, Data, Docs)');
    console.error('  --task    Task description to assign');
    process.exit(1);
}

const STARTUP_RETRY_DELAYS_MS = [500, 1000, 1500, 2000, 3000];

interface DispatchResultBody {
    state?: string;
    result?: { status?: string; text?: string; tools?: DispatchToolEntry[] } | string;
    tools?: DispatchToolEntry[];
    progress?: WorkerProgressSnapshotBody | null;
    progressUpdatedAt?: number | null;
    error?: string;
    worker?: { agentId?: string; employeeName?: string; startedAt?: number };
    existing?: { agentId?: string };
    orchestration?: {
        verdict?: string;
        statusPersisted?: boolean;
        persistedField?: string;
        currentState?: string;
        ctxPresent?: boolean;
    };
}

interface WorkerProgressRunBody {
    state?: string;
    tools?: DispatchToolEntry[];
}

interface WorkerProgressSnapshotBody {
    current?: WorkerProgressRunBody | null;
    previous?: WorkerProgressRunBody | null;
}

interface WorkerProgressResponseBody {
    ok?: boolean;
    progress?: WorkerProgressSnapshotBody | null;
    error?: string;
}

interface DispatchToolEntry {
    icon?: string;
    label?: string;
    detail?: string;
    toolType?: string;
    status?: string;
    stepRef?: string;
    isEmployee?: boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveAgentId(name: string): Promise<string | null> {
    const res = await cliFetch(`${BASE}/api/employees`);
    if (!res.ok) return null;
    const employees = unwrapEmployeeSummaries(await res.json() as unknown);
    const found = employees.find(e => e.name === name || e.id === name);
    return found?.id || null;
}

class DispatchPollError extends Error {
    constructor(message: string, public readonly agentId: string, public readonly agentName: string) {
        super(message);
        this.name = 'DispatchPollError';
    }
}

async function pollWorkerResult(agentId: string, agentName = ''): Promise<DispatchResultBody> {
    const deadline = Date.now() + 600_000;
    let lastState = 'unknown';
    while (Date.now() < deadline) {
        let res: Response;
        try {
            res = await cliFetch(`${BASE}/api/orchestrate/worker/${encodeURIComponent(agentId)}/result`);
        } catch (fetchErr) {
            throw new DispatchPollError(
                `dispatch poll failed: ${errString(fetchErr)}`,
                agentId,
                agentName,
            );
        }
        const body = await res.json() as DispatchResultBody;
        if (!res.ok) throw new DispatchPollError(body.error || `poll failed: ${res.status}`, agentId, agentName);
        lastState = body.state || 'unknown';
        if (body.state !== 'running') return body;
        await sleep(2_000);
    }
    throw new DispatchPollError(`timed out after 10 minutes (last state: ${lastState})`, agentId, agentName);
}

async function fetchWorkerProgress(agentId: string, agentName = ''): Promise<WorkerProgressSnapshotBody | null> {
    let res: Response;
    try {
        res = await cliFetch(`${BASE}/api/orchestrate/worker-progress/${encodeURIComponent(agentId)}`);
    } catch (fetchErr) {
        throw new DispatchPollError(
            `worker progress fetch failed: ${errString(fetchErr)}`,
            agentId,
            agentName,
        );
    }
    const body = await res.json() as WorkerProgressResponseBody;
    if (res.status === 404) return null;
    if (!res.ok) throw new DispatchPollError(body.error || `progress fetch failed: ${res.status}`, agentId, agentName);
    return body.progress || null;
}

function resultStatus(body: DispatchResultBody): string {
    if (typeof body.result === 'object' && typeof body.result?.status === 'string') return body.result.status;
    if (typeof body.state === 'string') return body.state;
    return 'done';
}

function resultText(body: DispatchResultBody): string | undefined {
    if (typeof body.result === 'object' && typeof body.result?.text === 'string') return body.result.text;
    if (typeof body.result === 'string') return body.result;
    return undefined;
}

function resultTools(body: DispatchResultBody): DispatchToolEntry[] {
    const progressTools = progressRun(body.progress)?.tools;
    if (Array.isArray(progressTools)) return progressTools;
    if (typeof body.result === 'object' && Array.isArray(body.result?.tools)) return body.result.tools;
    if (Array.isArray(body.tools)) return body.tools;
    return [];
}

function dispatchExitCode(body: DispatchResultBody): number {
    const status = resultStatus(body);
    return status === 'error' || status === 'failed' || status === 'cancelled' ? 1 : 0;
}

function formatToolLine(tool: DispatchToolEntry, index: number): string {
    const icon = tool.icon || '';
    const status = tool.status ? ` [${tool.status}]` : '';
    const label = displayShellCommand(tool.label || tool.toolType || 'tool');
    const detail = displayShellCommandDetail(tool.detail || '');
    const detailPreview = detail && detail.trim() !== label.trim()
        ? ` — ${detail.replace(/\s+/g, ' ').trim().slice(0, 120)}`
        : '';
    return `${index}. ${icon} ${label}${status}${detailPreview}`.replace(/\s+/g, ' ').trim();
}

function printEmployeeProcess(body: DispatchResultBody): void {
    const tools = resultTools(body);
    if (tools.length === 0) return;
    const max = 20;
    const omitted = Math.max(0, tools.length - max);
    const visible = tools.slice(-max);
    console.log('\n--- Employee Process ---');
    if (omitted > 0) console.log(`(${omitted} earlier step${omitted === 1 ? '' : 's'} omitted)`);
    visible.forEach((tool, idx) => {
        console.log(formatToolLine(tool, omitted + idx + 1));
    });
}

function progressRun(progress: WorkerProgressSnapshotBody | null | undefined): WorkerProgressRunBody | null {
    return progress?.current || progress?.previous || null;
}

function progressToolKey(tool: DispatchToolEntry, index: number): string {
    return tool.stepRef || `${index}:${tool.label || ''}:${tool.status || ''}:${tool.detail || ''}`;
}

function printProgressSnapshot(progress: WorkerProgressSnapshotBody | null | undefined, printed: Set<string>): void {
    const run = progressRun(progress);
    const tools = run?.tools || [];
    if (tools.length === 0) return;
    let printedHeader = printed.has('__header__');
    if (!printedHeader) {
        console.log('\n--- Employee Process (live) ---');
        printed.add('__header__');
        printedHeader = true;
    }
    void printedHeader;
    tools.forEach((tool, index) => {
        const key = progressToolKey(tool, index);
        if (printed.has(key)) return;
        printed.add(key);
        console.log(formatToolLine(tool, index + 1));
    });
}

async function pollAndPrintWorker(agentId: string, agentName: string): Promise<DispatchResultBody> {
    const deadline = Date.now() + 600_000;
    const printed = new Set<string>();
    let lastState = 'unknown';
    while (Date.now() < deadline) {
        const progress = await fetchWorkerProgress(agentId, agentName);
        printProgressSnapshot(progress, printed);
        const body = await pollWorkerResultOnce(agentId, agentName);
        lastState = body.state || lastState;
        printProgressSnapshot(body.progress, printed);
        if (body.state !== 'running') return body;
        await sleep(2_000);
    }
    throw new DispatchPollError(`timed out after 10 minutes (last state: ${lastState})`, agentId, agentName);
}

async function pollWorkerResultOnce(agentId: string, agentName = ''): Promise<DispatchResultBody> {
    let res: Response;
    try {
        res = await cliFetch(`${BASE}/api/orchestrate/worker/${encodeURIComponent(agentId)}/result`);
    } catch (fetchErr) {
        throw new DispatchPollError(
            `dispatch poll failed: ${errString(fetchErr)}`,
            agentId,
            agentName,
        );
    }
    const body = await res.json() as DispatchResultBody;
    if (!res.ok) throw new DispatchPollError(body.error || `poll failed: ${res.status}`, agentId, agentName);
    return body;
}

function printDispatchResult(agentName: string, body: DispatchResultBody, opts: { skipProcess?: boolean } = {}): void {
    console.log(`✅ ${agentName} completed (${resultStatus(body)})`);
    if (!opts.skipProcess) printEmployeeProcess(body);
    const text = resultText(body);
    if (text !== undefined) {
        console.log('\n--- Employee Response ---');
        console.log(text || '(empty response)');
    }
    if (body.orchestration) {
        const o = body.orchestration;
        const verdict = o.verdict ? String(o.verdict).toUpperCase() : 'none';
        const persisted = o.statusPersisted
            ? `persisted to ${o.persistedField}`
            : `not persisted (state=${o.currentState || 'unknown'}, ctx=${o.ctxPresent ? 'true' : 'false'})`;
        console.log(`\nOrchestration verdict: ${verdict} ${persisted}`);
    }
}

await getCliAuthToken(PORT);
try {
    console.log(`🚀 Dispatching to ${agent}...`);

    let res: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= STARTUP_RETRY_DELAYS_MS.length; attempt++) {
        try {
            res = await cliFetch(`${BASE}/api/orchestrate/dispatch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Jaw-Boss-Token': bossToken,
                },
                body: JSON.stringify({ agent, task, mutable, scope, ...(watch ? { wait: false } : {}) }),
            });
            break;
        } catch (e: unknown) {
            lastError = e;
            if (!isConnRefused(e) || attempt === STARTUP_RETRY_DELAYS_MS.length) break;
            if (attempt === 0) console.error('⏳ Server starting up, retrying...');
            await sleep(STARTUP_RETRY_DELAYS_MS[attempt]!);
        }
    }

    if (!res) {
        if (isConnRefused(lastError)) {
            console.error(
                `❌ Cannot reach ${BASE}. If running as launchd/systemd, wait a few seconds after reboot. `
                + 'For foreground mode: jaw serve',
            );
        } else {
        console.error(`❌ Error: ${errString(lastError)}`);
        }
        process.exit(1);
    }

    const body = await res.json() as DispatchResultBody;
    if (watch && res.status === 202) {
        const pollAgentId = body?.worker?.agentId || await resolveAgentId(agent);
        if (!pollAgentId) {
            console.error('❌ dispatch started but worker id was not returned');
            process.exit(1);
        }
        const watched = await pollAndPrintWorker(pollAgentId, agent);
        printDispatchResult(agent, watched, { skipProcess: true });
        process.exit(dispatchExitCode(watched));
    }
    if (!res.ok) {
        if (res.status === 409) {
            const pollAgentId = body?.worker?.agentId || body?.existing?.agentId || await resolveAgentId(agent);
            if (!pollAgentId) {
                console.error(`❌ ${body.error || `Failed: ${res.status}`}`);
                process.exit(1);
            }
            console.error(`⏳ ${agent} is already running (agentId: ${pollAgentId}), polling worker result...`);
            const polled = watch
                ? await pollAndPrintWorker(pollAgentId, agent)
                : await pollWorkerResult(pollAgentId, agent);
            printDispatchResult(agent, polled, watch ? { skipProcess: true } : {});
            process.exit(dispatchExitCode(polled));
        }
        console.error(`❌ ${body.error || `Failed: ${res.status}`}`);
        process.exit(1);
    }
    printDispatchResult(agent, body);
    process.exit(dispatchExitCode(body));
} catch (e: unknown) {
    if (e instanceof DispatchPollError) {
        console.error(`❌ ${e.message}`);
        console.error(`  agentId:  ${e.agentId}`);
        console.error(`  agent:    ${e.agentName || agent}`);
        console.error(`  recover:  cli-jaw dispatch --agent "${e.agentName || agent}" --task "(resume polling)"`);
        console.error(`  poll:     curl -s ${BASE}/api/orchestrate/worker/${encodeURIComponent(e.agentId)}/result`);
    } else {
        console.error(`❌ Error: ${errString(e)}`);
    }
    process.exit(1);
}
