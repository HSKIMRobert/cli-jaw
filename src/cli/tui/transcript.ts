export type TranscriptItem =
    | { type: 'user'; displayText: string; submitText: string; timestamp: number; agentId?: string }
    | { type: 'assistant'; text: string; streaming: boolean; timestamp: number; agentId?: string }
    | { type: 'thinking'; text: string; streaming: boolean; timestamp: number; agentId?: string; collapsed?: boolean }
    | { type: 'tool'; text: string; timestamp: number; agentId?: string; collapsed?: boolean; detail?: string; stepRef?: string; status?: 'running' | 'done' | 'error' }
    | { type: 'status'; text: string; ephemeral: true; timestamp: number; agentId?: string };

export interface TranscriptState {
    items: TranscriptItem[];
    liveTools: LiveToolItem[];
    liveToolsExpanded: boolean;
    committedToolRefs: Set<string>;
}

export interface LiveToolItem {
    key: string;
    icon: string;
    label: string;
    detail: string;
    status: 'running';
    timestamp: number;
    updatedAt: number;
    agentId?: string;
    stepRef?: string;
}

export interface ToolEventInput {
    icon: string;
    label: string;
    detail: string;
    status: 'running' | 'done' | 'error';
    agentId?: string | undefined;
    stepRef?: string | undefined;
}

export function createTranscriptState(): TranscriptState {
    return { items: [], liveTools: [], liveToolsExpanded: false, committedToolRefs: new Set() };
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

function appendToActiveThinking(state: TranscriptState, chunk: string): boolean {
    const last = state.items[state.items.length - 1];
    if (!last || last.type !== 'thinking' || !last.streaming) return false;
    last.text += chunk;
    return true;
}

export function appendThinkingTurnText(state: TranscriptState, chunk: string, agentId?: string): boolean {
    if (!chunk) return false;
    if (appendToActiveThinking(state, chunk)) return true;
    const item: TranscriptItem = {
        type: 'thinking',
        text: chunk,
        streaming: true,
        timestamp: Date.now(),
        collapsed: true,
    };
    if (agentId) item.agentId = agentId;
    state.items.push(item);
    return true;
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
        if ((item.type === 'assistant' || item.type === 'thinking') && item.streaming) {
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

export function makeToolEventKey(input: { label: string; agentId?: string | undefined; stepRef?: string | undefined }): string {
    if (input.stepRef) return `ref:${input.stepRef}`;
    return `fallback:${input.agentId ?? 'main'}:${input.label}`;
}

export function upsertLiveToolItem(state: TranscriptState, input: ToolEventInput): LiveToolItem {
    const key = makeToolEventKey(input);
    const now = Date.now();
    const existing = state.liveTools.find(item => item.key === key);
    if (existing) {
        existing.icon = input.icon;
        existing.label = input.label;
        existing.detail = input.detail || existing.detail;
        existing.updatedAt = now;
        if (input.agentId) existing.agentId = input.agentId;
        if (input.stepRef) existing.stepRef = input.stepRef;
        return existing;
    }
    const item: LiveToolItem = {
        key,
        icon: input.icon,
        label: input.label,
        detail: input.detail,
        status: 'running',
        timestamp: now,
        updatedAt: now,
    };
    if (input.agentId) item.agentId = input.agentId;
    if (input.stepRef) item.stepRef = input.stepRef;
    state.liveTools.push(item);
    return item;
}

export function commitToolItemOnce(state: TranscriptState, input: ToolEventInput, commitOpts?: { updateCommitted?: boolean }): boolean {
    const key = makeToolEventKey(input);
    const liveIndex = state.liveTools.findIndex(item => item.key === key);
    const live = liveIndex >= 0 ? state.liveTools[liveIndex] : null;
    if (liveIndex >= 0) state.liveTools.splice(liveIndex, 1);
    if (input.stepRef && state.committedToolRefs.has(input.stepRef)) {
        if (commitOpts?.updateCommitted && input.detail) {
            appendToolItem(state, input.label, {
                ...(input.agentId ? { agentId: input.agentId } : {}),
                detail: input.detail,
                stepRef: input.stepRef,
                status: input.status,
            });
        }
        return false;
    }
    if (input.stepRef) state.committedToolRefs.add(input.stepRef);

    const detail = input.detail || live?.detail || '';
    const opts: Parameters<typeof appendToolItem>[2] = { detail, status: input.status };
    if (input.agentId) opts.agentId = input.agentId;
    if (input.stepRef) opts.stepRef = input.stepRef;
    appendToolItem(state, input.label, opts);
    return true;
}

export function commitRemainingLiveToolItems(state: TranscriptState, status: ToolEventInput['status'] = 'done'): number {
    const pending = [...state.liveTools];
    let committed = 0;
    for (const item of pending) {
        if (commitToolItemOnce(state, {
            icon: item.icon,
            label: item.label,
            detail: item.detail,
            status,
            ...(item.agentId ? { agentId: item.agentId } : {}),
            ...(item.stepRef ? { stepRef: item.stepRef } : {}),
        })) {
            committed += 1;
        }
    }
    state.liveTools.length = 0;
    state.liveToolsExpanded = false;
    return committed;
}

export function clearLiveToolItems(state: TranscriptState): LiveToolItem[] {
    const items = [...state.liveTools];
    state.liveTools.length = 0;
    state.liveToolsExpanded = false;
    return items;
}

export function listLiveToolItems(state: TranscriptState): LiveToolItem[] {
    return [...state.liveTools];
}

export function collapsePreviousTools(state: TranscriptState): void {
    for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i]!;
        if (item.type === 'tool' && !item.collapsed) item.collapsed = true;
        else if (item.type !== 'status') break;
    }
}

export function toggleToolExpansion(state: TranscriptState): boolean {
    const expandableItems = state.items.filter(i => i.type === 'tool' || i.type === 'thinking');
    const hasLiveTools = state.liveTools.length > 0;
    if (expandableItems.length === 0 && !hasLiveTools) return false;
    const shouldExpand = expandableItems.some(i => i.collapsed !== false) || (hasLiveTools && !state.liveToolsExpanded);
    for (const item of expandableItems) item.collapsed = !shouldExpand;
    state.liveToolsExpanded = hasLiveTools ? shouldExpand : false;
    return true;
}

export function toggleLatestToolExpansion(state: TranscriptState): boolean {
    for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i]!;
        if (item.type !== 'tool') continue;
        item.collapsed = !item.collapsed;
        return true;
    }
    return false;
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
