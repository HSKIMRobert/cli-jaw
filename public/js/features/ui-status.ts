import { state } from '../state.js';
import { api } from '../api.js';
import { ICONS } from '../icons.js';
import { t } from './i18n.js';
import { showSkeleton, removeSkeleton } from './chat-messages.js';
import type { MessageItem } from './process-log-adapter.js';

let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;

function clearElapsedTimer(): void {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

export function setStatus(s: string, cli?: string): void {
    const badge = document.getElementById('statusBadge');
    const btn = document.getElementById('btnSend');
    const label = document.getElementById('typingIndicator')?.querySelector('.label') as HTMLElement | null;
    const elapsed = document.getElementById('typingElapsed');
    state.agentBusy = s === 'running';
    document.getElementById('typingIndicator')?.classList.toggle('active', state.agentBusy);
    if (s === 'running') {
        if (badge) { badge.className = 'status-badge status-running'; badge.textContent = 'running'; }
        if (btn) { btn.innerHTML = ICONS.stop; btn.title = t('btn.stop'); btn.classList.add('stop-mode'); }
        clearElapsedTimer();
        if (cli === 'agy') {
            if (label) label.textContent = 'Antigravity working...';
            startedAt = Date.now();
            if (elapsed) { elapsed.textContent = '0:00'; elapsed.style.display = 'inline'; }
            elapsedTimer = setInterval(() => {
                const sec = Math.floor((Date.now() - startedAt) / 1000);
                const m = Math.floor(sec / 60);
                const s2 = sec % 60;
                if (elapsed) elapsed.textContent = `${m}:${String(s2).padStart(2, '0')}`;
            }, 1000);
        } else {
            if (label) label.textContent = t('status.responding');
            if (elapsed) elapsed.style.display = 'none';
        }
        showSkeleton();
    } else {
        if (badge) { badge.className = 'status-badge status-idle'; badge.textContent = 'idle'; }
        if (btn) { btn.innerHTML = ICONS.send; btn.title = 'Send'; btn.classList.remove('stop-mode'); }
        clearElapsedTimer();
        if (elapsed) elapsed.style.display = 'none';
        if (label) label.textContent = t('status.responding');
        removeSkeleton();
    }
}

export function updateQueueBadge(count: number): void {
    let el = document.getElementById('queueBadge');
    if (!el) {
        el = document.createElement('span');
        el.id = 'queueBadge';
        el.className = 'queue-badge';
        const sendBtn = document.getElementById('btnSend');
        if (sendBtn?.parentElement) sendBtn.parentElement.style.position = 'relative';
        if (sendBtn) { sendBtn.style.position = 'relative'; sendBtn.appendChild(el); }
    }
    el.textContent = count > 0 ? String(count) : '';
    el.style.display = count > 0 ? 'flex' : 'none';
}

export function updateStatMsgs(count: number): void {
    const el = document.getElementById('statMsgs');
    if (el) el.textContent = t('stat.messages', { count });
}

export async function loadStats(): Promise<void> {
    const msgs = await api<MessageItem[]>('/api/messages');
    if (!msgs) return;
    updateStatMsgs(msgs.length);
}
