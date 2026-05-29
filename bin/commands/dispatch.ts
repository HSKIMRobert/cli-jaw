#!/usr/bin/env node
// bin/commands/dispatch.ts — CLI: jaw dispatch --agent <name> --task <task>
// Dispatches a jaw employee via the server API (pipe-mode compatible).

import { loadSettings, getServerUrl } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';
import { errString, isConnRefused } from '../_http-client.js';
import { unwrapEmployeeSummaries } from './dispatch-helpers.js';

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw dispatch — send task to an employee agent

  Usage: jaw dispatch --agent "Name" --task "instruction"

  Options:
    --agent <name>    Employee name (must match settings.json employees)
    --task <text>     Task instruction to send
    --mutable         Allow employee to write/modify files (default: read-only)
    --scope <path>    Restrict writes to a subdirectory (optional, requires --mutable)
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

if (!agent || !task) {
    console.error('Usage: jaw dispatch --agent <name> --task <task>');
    console.error('  --agent   Employee name (e.g., Frontend, Backend, Data, Docs)');
    console.error('  --task    Task description to assign');
    process.exit(1);
}

const STARTUP_RETRY_DELAYS_MS = [500, 1000, 1500, 2000, 3000];

interface DispatchResultBody {
    state?: string;
    result?: { status?: string; text?: string } | string;
    error?: string;
    worker?: { agentId?: string };
    existing?: { agentId?: string };
    orchestration?: {
        verdict?: string;
        statusPersisted?: boolean;
        persistedField?: string;
        currentState?: string;
        ctxPresent?: boolean;
    };
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

function dispatchExitCode(body: DispatchResultBody): number {
    const status = resultStatus(body);
    return status === 'error' || status === 'failed' || status === 'cancelled' ? 1 : 0;
}

function printDispatchResult(agentName: string, body: DispatchResultBody): void {
    console.log(`✅ ${agentName} completed (${resultStatus(body)})`);
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
                body: JSON.stringify({ agent, task, mutable, scope }),
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
    if (!res.ok) {
        if (res.status === 409) {
            const pollAgentId = body?.worker?.agentId || body?.existing?.agentId || await resolveAgentId(agent);
            if (!pollAgentId) {
                console.error(`❌ ${body.error || `Failed: ${res.status}`}`);
                process.exit(1);
            }
            console.error(`⏳ ${agent} is already running (agentId: ${pollAgentId}), polling worker result...`);
            const polled = await pollWorkerResult(pollAgentId, agent);
            printDispatchResult(agent, polled);
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
