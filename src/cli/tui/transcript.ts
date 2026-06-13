export type TranscriptItem =
    | { type: 'user'; displayText: string; submitText: string; timestamp: number; agentId?: string }
    | { type: 'assistant'; text: string; streaming: boolean; timestamp: number; agentId?: string }
    | { type: 'tool'; text: string; timestamp: number; agentId?: string; collapsed?: boolean; detail?: string; stepRef?: string; status?: 'running' | 'done' | 'error' }
    | { type: 'status'; text: string; ephemeral: true; timestamp: number; agentId?: string };

export interface TranscriptState {
    items: TranscriptItem[];
}

export function createTranscriptState(): TranscriptState {
    return { items: [] };
}

export function appendUserItem(state: TranscriptState, displayText: string, submitText: string): void {
    state.items.push({ type: 'user', displayText, submitText, timestamp: Date.now() });
}

export function startAssistantItem(state: TranscriptState, agentId?: string): void {
    const item: TranscriptItem = { type: 'assistant', text: '', streaming: true, timestamp: Date.now() };
    if (agentId) item.agentId = agentId;
    state.items.push(item);
}

export function appendToActiveAssistant(state: TranscriptState, chunk: string): boolean {
    const last = state.items[state.items.length - 1];
    if (!last || last.type !== 'assistant' || !last.streaming) return false;
    last.text += chunk;
    return true;
}

export function appendAssistantTurnText(state: TranscriptState, chunk: string, agentId?: string): boolean {
    if (!chunk) return false;
    if (appendToActiveAssistant(state, chunk)) return true;
    startAssistantItem(state, agentId);
    return appendToActiveAssistant(state, chunk);
}

export function finalizeAssistant(state: TranscriptState, fallbackText?: string): boolean {
    const last = state.items[state.items.length - 1];
    if (!last || last.type !== 'assistant') return false;
    if (last.streaming) {
        last.streaming = false;
    } else if (fallbackText) {
        // agent_done with text but no prior chunks
        last.text = fallbackText;
        last.streaming = false;
    }
    return true;
}

export function finalizeStreamingAssistants(state: TranscriptState): boolean {
    let changed = false;
    for (const item of state.items) {
        if (item.type === 'assistant' && item.streaming) {
            item.streaming = false;
            changed = true;
        }
    }
    return changed;
}

export function hasAssistantTextSinceLastUser(state: TranscriptState): boolean {
    return assistantTextSinceLastUser(state).trim().length > 0;
}

export function assistantTextSinceLastUser(state: TranscriptState): string {
    const chunks: string[] = [];
    for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i]!;
        if (item.type === 'user') break;
        if (item.type === 'assistant' && item.text.length > 0) chunks.unshift(item.text);
    }
    return chunks.join('');
}

export function appendToolItem(state: TranscriptState, text: string, opts?: { agentId?: string; detail?: string; stepRef?: string; status?: 'running' | 'done' | 'error' }): void {
    if (opts?.stepRef) {
        const existing = state.items.find((item) => item.type === 'tool' && item.stepRef === opts.stepRef);
        if (existing?.type === 'tool') {
            existing.text = opts.detail ? text : existing.text;
            existing.timestamp = Date.now();
            if (opts.status) {
                existing.status = opts.status;
                existing.collapsed = opts.status !== 'running';
            }
            if (opts.agentId) existing.agentId = opts.agentId;
            if (opts.detail) existing.detail = opts.detail;
            return;
        }
    }
    collapsePreviousTools(state);
    const item: TranscriptItem = {
        type: 'tool',
        text,
        timestamp: Date.now(),
        collapsed: opts?.status ? opts.status !== 'running' : false,
    };
    if (opts?.agentId) item.agentId = opts.agentId;
    if (opts?.detail) item.detail = opts.detail;
    if (opts?.stepRef) item.stepRef = opts.stepRef;
    if (opts?.status) item.status = opts.status;
    state.items.push(item);
}

export function collapsePreviousTools(state: TranscriptState): void {
    for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i]!;
        if (item.type === 'tool' && !item.collapsed) item.collapsed = true;
        else if (item.type !== 'status') break;
    }
}

export function toggleToolExpansion(state: TranscriptState): void {
    const hasCollapsed = state.items.some(i => i.type === 'tool' && i.collapsed);
    for (const item of state.items) {
        if (item.type === 'tool') item.collapsed = !hasCollapsed;
    }
}

export function appendStatusItem(state: TranscriptState, text: string): void {
    // Ephemeral — replace previous status if it exists
    const last = state.items[state.items.length - 1];
    if (last?.type === 'status') {
        last.text = text;
        last.timestamp = Date.now();
        return;
    }
    state.items.push({ type: 'status', text, ephemeral: true, timestamp: Date.now() });
}

export function clearEphemeralStatus(state: TranscriptState): void {
    if (state.items.length > 0 && state.items[state.items.length - 1]?.type === 'status') {
        state.items.pop();
    }
}
