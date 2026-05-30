#!/usr/bin/env node
// bin/commands/goal.ts — CLI: jaw goal [set|status|update|done|cancel|pause|resume|clear|reset|history]
import { loadSettings, getServerUrl } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';
import { errString, isConnRefused } from '../_http-client.js';

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw goal — Persistent goal lifecycle

  Usage: jaw goal <subcommand> [args...]

  Subcommands:
    set <objective>     Set a new goal
    status              Show active goal
    update <summary>    Add a checkpoint  (add --evidence <note>[,<...>] to record verification)
    done [note]         Mark goal complete (add --force to skip the evidence gate)
    cancel [reason]     Cancel goal
    pause               Pause goal
    resume              Resume paused goal
    clear               Clear active goal
    reset               Reset goal store
    history [limit]     Show goal history

  Examples:
    jaw goal set "Implement keyboard shortcuts"
    jaw goal update "K0 done"
    jaw goal done "All phases complete"
    jaw goal status
`);

loadSettings();

const args = process.argv.slice(3);
const sub = (args[0] || 'status').toLowerCase();
const rest = args.slice(1).join(' ').trim();

const PORT = undefined;
const BASE = getServerUrl(PORT);
await getCliAuthToken(PORT);

try {
    if (sub === 'status' || sub === '--json') {
        const res = await cliFetch(`${BASE}/api/goal`);
        const body = await res.json() as Record<string, unknown>;
        if (!res.ok) { console.error((body['error'] as string) || `Failed: ${res.status}`); process.exit(1); }
        const goal = body['goal'] as Record<string, unknown> | null;
        if (!goal) { console.log('No active goal.'); process.exit(0); }
        if (sub === '--json') { console.log(JSON.stringify(goal, null, 2)); process.exit(0); }
        console.log(`Goal: ${goal['objective']}`);
        console.log(`Status: ${goal['status']}`);
        console.log(`ID: ${goal['id']}`);
        console.log(`Created: ${goal['createdAt']}`);
        process.exit(0);
    }

    if (sub === 'history') {
        const limit = Number(rest) || 10;
        const res = await cliFetch(`${BASE}/api/goal/history?limit=${limit}`);
        const body = await res.json() as Record<string, unknown>;
        if (!res.ok) { console.error((body['error'] as string) || `Failed: ${res.status}`); process.exit(1); }
        const items = (body['goals'] ?? body['history']) as Array<Record<string, unknown>> | undefined;
        if (!items || items.length === 0) { console.log('No goal history.'); process.exit(0); }
        for (const g of items) {
            console.log(`[${g['status']}] ${g['objective']} (${g['id']})`);
        }
        process.exit(0);
    }

    const actionMap: Record<string, string> = {
        set: 'set', done: 'done', cancel: 'cancel',
        update: 'update', pause: 'pause', resume: 'resume',
        clear: 'clear', reset: 'reset',
    };

    const action = actionMap[sub];
    if (!action) {
        console.error(`Unknown subcommand: ${sub}`);
        console.error('Use: set, status, update, done, cancel, pause, resume, clear, reset, history');
        process.exit(1);
    }

    const payload: Record<string, unknown> = { action };
    if (sub === 'set') payload['objective'] = rest || undefined;
    if (sub === 'cancel') payload['reason'] = rest || undefined;
    if (sub === 'done') {
        payload['note'] = args.slice(1).filter(a => a !== '--force').join(' ').trim() || undefined;
        if (args.includes('--force')) payload['force'] = true;
    }
    if (sub === 'update') {
        const u = args.slice(1);
        const evIdx = u.indexOf('--evidence');
        if (evIdx >= 0) {
            payload['summary'] = u.slice(0, evIdx).join(' ').trim() || undefined;
            payload['evidence'] = u.slice(evIdx + 1).join(' ').split(',').map(s => s.trim()).filter(Boolean);
        } else {
            payload['summary'] = rest || undefined;
        }
    }

    const res = await cliFetch(`${BASE}/api/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
        console.error((body['error'] as string) || `Failed: ${res.status}`);
        process.exit(1);
    }

    const goal = body['goal'] as Record<string, unknown> | null;
    switch (sub) {
        case 'set': console.log(`✅ Goal set: ${goal?.['objective']}`); break;
        case 'done': console.log(`✅ Goal completed: ${goal?.['objective']}`); break;
        case 'cancel': console.log(`✅ Goal cancelled: ${goal?.['objective']}`); break;
        case 'update': console.log(`✅ Checkpoint added`); break;
        case 'pause': console.log(`✅ Goal paused: ${goal?.['objective']}`); break;
        case 'resume': console.log(`✅ Goal resumed: ${goal?.['objective']}`); break;
        case 'clear': console.log('✅ Goal cleared'); break;
        case 'reset': console.log('✅ Goal store reset'); break;
    }
} catch (e) {
    if (isConnRefused(e)) {
        console.error(`Server not running. Start with: jaw serve`);
    } else {
        console.error(`Error: ${errString(e)}`);
    }
    process.exit(1);
}
