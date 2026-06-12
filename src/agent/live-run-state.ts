import {
    sanitizeToolLogEntry,
    sanitizeToolLogForDurableStorage,
    type SanitizableToolLogEntry,
    type SanitizedToolLogEntry,
} from '../shared/tool-log-sanitize.js';

export type LiveRunEntry = {
    running: boolean;
    cli?: string;
    text: string;
    toolLog: SanitizedToolLogEntry[];
    startedAt?: number;
    /** Trace run id of the spawn that owns this live run. Rides on
     *  agent_output/agent_done broadcasts and the orchestrate snapshot so the
     *  web UI can scope SSE replays to the run they belong to (devlog 260612
     *  manager_stream_hidden_state_audit 06-08). */
    traceRunId?: string;
};

const EMPTY_LIVE_RUN: LiveRunEntry = {
    running: false,
    text: '',
    toolLog: [],
};

const liveRuns = new Map<string, LiveRunEntry>();

function cloneEntry(entry: LiveRunEntry): LiveRunEntry {
    return {
        ...entry,
        toolLog: sanitizeToolLogForDurableStorage(entry.toolLog),
    };
}

export function beginLiveRun(scope: string, cli: string): void {
    liveRuns.set(scope, {
        running: true,
        cli,
        text: '',
        toolLog: [],
        startedAt: Date.now(),
    });
}

/** Append a streamed segment. Returns the cumulative text length after the
 *  append (the replay-dedup cursor broadcast as `textLen`), or null when no
 *  live run is active for the scope. */
export function appendLiveRunText(scope: string, text: string): number | null {
    const current = liveRuns.get(scope);
    if (!current?.running) return null;
    if (text) current.text += text;
    return current.text.length;
}

/** Bind the trace run id once startTraceRun has produced it (beginLiveRun
 *  runs earlier in every spawn path, so the id arrives via this setter). */
export function setLiveRunTraceId(scope: string, traceRunId: string): void {
    const current = liveRuns.get(scope);
    if (!current?.running || !traceRunId) return;
    current.traceRunId = traceRunId;
}

export function replaceLiveRunTools(scope: string, toolLog: unknown[]): void {
    const current = liveRuns.get(scope);
    if (!current?.running) return;
    const sanitized = sanitizeToolLogForDurableStorage(toolLog);
    toolLog.splice(0, toolLog.length, ...sanitized);
    current.toolLog = sanitized;
}

export function appendLiveRunTool(scope: string, tool: SanitizableToolLogEntry): void {
    const current = liveRuns.get(scope);
    if (!current?.running) return;
    current.toolLog.push(sanitizeToolLogEntry(tool));
    current.toolLog = sanitizeToolLogForDurableStorage(current.toolLog);
}

export function clearLiveRun(scope: string): void {
    liveRuns.delete(scope);
}

export function getLiveRun(scope: string): LiveRunEntry {
    return cloneEntry(liveRuns.get(scope) || EMPTY_LIVE_RUN);
}
