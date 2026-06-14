export type ToolStatus = 'running' | 'done' | 'error';

export type TuiEvent =
    | { kind: 'assistant-output'; text: string; agentId?: string | undefined; thinking: boolean }
    | { kind: 'agent-done'; text: string; agentId?: string | undefined; raw: Record<string, unknown> }
    | { kind: 'agent-status'; status: string; agentId?: string | undefined; agentName?: string | undefined }
    | { kind: 'agent-tool'; icon: string; label: string; detail: string; status: ToolStatus; stepRef?: string | undefined; agentId?: string | undefined; toolType?: string | undefined }
    | { kind: 'agent-fallback'; from: string; to: string }
    | { kind: 'bgtask-update'; raw: Record<string, unknown> }
    | { kind: 'queue-update'; pending: number; raw: Record<string, unknown> }
    | { kind: 'external-message'; source: string; content: string }
    | { kind: 'session-reset' }
    | { kind: 'worker-warning'; type: string; agentId?: string | undefined }
    | { kind: 'raw'; raw: Record<string, unknown> }
    | { kind: 'ignore'; raw: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function optString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function normalizeToolStatus(value: unknown): ToolStatus {
    if (value === 'done' || value === 'error') return value;
    return 'running';
}

function numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeTuiWsEvent(raw: unknown): TuiEvent {
    const msg = asRecord(raw) ?? {};
    const type = stringValue(msg['type']);
    switch (type) {
        case 'agent_chunk':
        case 'agent_output':
            return {
                kind: 'assistant-output',
                text: stringValue(msg['text']),
                thinking: msg['thinking'] === true,
                ...(optString(msg['agentId']) ? { agentId: optString(msg['agentId']) } : {}),
            };
        case 'agent_done':
            return {
                kind: 'agent-done',
                text: stringValue(msg['text']),
                raw: msg,
                ...(optString(msg['agentId']) ? { agentId: optString(msg['agentId']) } : {}),
            };
        case 'agent_status':
            return {
                kind: 'agent-status',
                status: stringValue(msg['status']),
                ...(optString(msg['agentId']) ? { agentId: optString(msg['agentId']) } : {}),
                ...(optString(msg['agentName']) ? { agentName: optString(msg['agentName']) } : {}),
            };
        case 'agent_tool': {
            const icon = optString(msg['icon']);
            const label = optString(msg['label']);
            if (!icon || !label) return { kind: 'ignore', raw: msg };
            return {
                kind: 'agent-tool',
                icon,
                label,
                detail: stringValue(msg['detail']),
                status: normalizeToolStatus(msg['status']),
                ...(optString(msg['stepRef']) ? { stepRef: optString(msg['stepRef']) } : {}),
                ...(optString(msg['agentId']) ? { agentId: optString(msg['agentId']) } : {}),
                ...(optString(msg['toolType']) ? { toolType: optString(msg['toolType']) } : {}),
            };
        }
        case 'agent_fallback':
            return {
                kind: 'agent-fallback',
                from: stringValue(msg['from']),
                to: stringValue(msg['to']),
            };
        case 'bgtask_update':
            return { kind: 'bgtask-update', raw: msg };
        case 'queue_update':
            return { kind: 'queue-update', pending: numberValue(msg['pending']), raw: msg };
        case 'new_message':
            return {
                kind: 'external-message',
                source: stringValue(msg['source']),
                content: stringValue(msg['content']),
            };
        case 'session_reset':
        case 'clear':
            return { kind: 'session-reset' };
        case 'worker_stalled':
        case 'worker_timeout':
        case 'worker_disconnected':
            return {
                kind: 'worker-warning',
                type,
                ...(optString(msg['agentId']) ? { agentId: optString(msg['agentId']) } : {}),
            };
        default:
            return type ? { kind: 'raw', raw: msg } : { kind: 'ignore', raw: msg };
    }
}
