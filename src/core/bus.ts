// ─── Broadcast Bus (EventEmitter-style) ──────────────
// All modules import from here to avoid circular deps.

import type { WebSocketServer, WebSocket } from 'ws';
import { sanitizeToolLogEntry, sanitizeToolLogForDurableStorage } from '../shared/tool-log-sanitize.js';
import { publish as ssePublish, type EventTopic } from './event-bus.js';

export type BroadcastListener = (type: string, data: Record<string, any>) => void;
type BroadcastPayload = Parameters<BroadcastListener>[1];

const broadcastListeners = new Set<BroadcastListener>();
let wss: WebSocketServer | null = null;

export function setWss(w: WebSocketServer | null) { wss = w; }

export function addBroadcastListener(fn: BroadcastListener) { broadcastListeners.add(fn); }
export function removeBroadcastListener(fn: BroadcastListener) { broadcastListeners.delete(fn); }
export function clearAllBroadcastListeners() { broadcastListeners.clear(); }

function sanitizeBroadcastData(type: string, data: BroadcastPayload): BroadcastPayload {
    if (type === 'agent_tool') {
        return { ...data, ...sanitizeToolLogEntry(data) };
    }
    if (type === 'agent_done' && Array.isArray(data["toolLog"])) {
        return { ...data, toolLog: sanitizeToolLogForDurableStorage(data["toolLog"]) };
    }
    return data;
}

// Topic inference for the SSE dual-emit. The trace branch must stay first:
// internal claude-e runtime events must never route to the public 'agent'
// topic (devlog 260609 00_1 F2). agents CRUD precedes the generic agent_ prefix.
export function inferTopic(type: string): EventTopic {
    if (type.startsWith('agent:claude-e:')) return 'trace';
    if (type === 'agent_added' || type === 'agent_updated' || type === 'agent_deleted') return 'agents';
    if (type.startsWith('agent_') || type.startsWith('agent:') || type === 'steer_started') return 'agent';
    if (type.startsWith('orc_') || type.startsWith('orchestrate_')
        || type === 'worklog_created' || type === 'round_start' || type === 'round_done') return 'orchestrate';
    if (type.startsWith('goal_')) return 'goal';
    if (type === 'workflow_event') return 'workflow';
    if (type.startsWith('memory_')) return 'memory';
    if (type.startsWith('worker_')) return 'worker';
    if (type === 'new_message') return 'message';
    if (type === 'queue_update') return 'queue';
    if (type === 'heartbeat_pending') return 'heartbeat';
    if (type.startsWith('schedule_')) return 'schedule';
    if (type === 'clear' || type.startsWith('session_')) return 'session';
    if (type === 'settings_change') return 'settings';
    return 'system';
}

export function broadcast(type: string, data: Record<string, any>, audience: 'public' | 'internal' = 'public') {
    const safeData = sanitizeBroadcastData(type, data);
    // Dual-emit to the SSE event-bus — public only (P1-09 audience gate),
    // sanitized payload only (P1-08). WS behavior below is unchanged (P1-05).
    if (audience === 'public') {
        ssePublish(inferTopic(type), type, safeData);
    }
    const msg = JSON.stringify({ type, ...safeData, ts: Date.now() });
    if (audience === 'public' && wss) {
        wss.clients.forEach((c: WebSocket) => { if (c.readyState === 1) c.send(msg); });
    }
    for (const fn of broadcastListeners) fn(type, safeData);
}
