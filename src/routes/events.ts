// ─── GET /api/events — multiplexed SSE event stream ──
// data-only wire format (devlog 260609 00_1 F1): no `event:` SSE field —
// topic + event travel inside the JSON payload so client onmessage fires.

import type { Router, Request, Response, RequestHandler } from 'express';
import {
    subscribe, replaySince, hasReplayGap,
    MAX_SSE_LISTENERS, type BusEvent,
} from '../core/event-bus.js';

const HEARTBEAT_MS = 15_000;
let activeConnections = 0;

export function getActiveSseConnections(): number { return activeConnections; }

function formatSse(entry: BusEvent): string {
    return `id: ${entry.id}\ndata: ${JSON.stringify({ ...entry.data, topic: entry.topic, event: entry.event })}\n\n`;
}

function parseLastEventId(req: Request): number {
    const header = req.headers['last-event-id'];
    const query = req.query['lastEventId'];
    const raw = typeof header === 'string' ? header
        : typeof query === 'string' ? query : '';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function registerEventsRoutes(app: Router, requireAuth: RequestHandler): void {
    app.get('/api/events', requireAuth, (req: Request, res: Response) => {
        if (activeConnections >= MAX_SSE_LISTENERS) {
            res.status(503).json({ error: 'SSE_CAPACITY' });
            return;
        }
        activeConnections++;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        });
        // Flush headers immediately — without a first write the client's
        // fetch/EventSource would hang until the 15s heartbeat.
        res.write(': connected\n\n');

        // Replay missed events (Last-Event-ID header or ?lastEventId= query)
        const lastId = parseLastEventId(req);
        if (lastId > 0) {
            if (hasReplayGap(lastId)) {
                res.write(`data: ${JSON.stringify({ topic: 'system', event: 'replay_gap' })}\n\n`);
            }
            for (const entry of replaySince(lastId)) res.write(formatSse(entry));
        }

        // Live delivery
        const unsub = subscribe((entry) => {
            if (!res.writableEnded) res.write(formatSse(entry));
        });

        // Keep-alive comment ping (proxies + browser idle timeout)
        const hb = setInterval(() => {
            if (!res.writableEnded) res.write(': ping\n\n');
        }, HEARTBEAT_MS);
        hb.unref();

        // close fires on both req and res for the same teardown — guard so
        // activeConnections is decremented exactly once per connection.
        let closed = false;
        const cleanup = () => {
            if (closed) return;
            closed = true;
            unsub();
            clearInterval(hb);
            activeConnections--;
            if (!res.writableEnded) res.end();
        };
        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);
    });
}
