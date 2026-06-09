// ─── System info routes (health/session/runtime/token) ─
// Extracted from server.ts in Phase 2 (devlog 260609, 07 §3.2).
// jawAuthToken is a runtime secret generated at server start — it cannot be
// re-derived here, so it arrives as a factory dep.

import type { Router } from 'express';
import { ok } from '../http/response.js';
import { APP_VERSION, settings } from '../core/config.js';
import { drainLogRing } from '../core/logger.js';
import { getSession } from '../core/db.js';
import { buildChannelHealthSnapshot } from '../messaging/channel-health.js';
import { getCliModelAndEffort } from '../core/main-session.js';
import { isAgentBusy, messageQueue } from '../agent/spawn.js';

function getRuntimeSnapshot() {
    const cli = settings["cli"] || null;
    const model = cli ? getCliModelAndEffort(cli, settings).model : 'default';

    return {
        uptimeSec: Math.floor(process.uptime()),
        activeAgent: isAgentBusy(),
        queuePending: messageQueue.length,
        cli,
        model,
    };
}

export function registerSystemRoutes(app: Router, deps: { jawAuthToken: string }): void {
    app.get('/api/health', (_req, res) => res.json({
        ok: true,
        version: APP_VERSION,
        uptime: process.uptime(),
        channels: buildChannelHealthSnapshot(),
    }));

    app.get('/api/session', (_, res) => ok(res, getSession(), getSession() as Record<string, unknown> | undefined));

    app.get('/api/runtime', (req, res) => {
        if (req.query["logs"] === 'tail') {
            const lines = drainLogRing();
            res.json({ ok: true, lines });
            return;
        }
        ok(res, getRuntimeSnapshot(), getRuntimeSnapshot());
    });

    // Auth token endpoint — Sec-Fetch-Site guard blocks cross-origin XSS token theft
    // Browser-enforced header: cannot be set/spoofed by JS, absent from CLI/curl (passes through)
    app.get('/api/auth/token', (req, res) => {
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin' && site !== 'none') {
            res.status(403).json({ error: 'cross-origin token request blocked' });
            return;
        }
        res.json({ token: deps.jawAuthToken });
    });
}
