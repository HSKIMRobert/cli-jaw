import { Router, type RequestHandler } from 'express';
import {
    getActiveGoal, getGoalHistory,
    setGoal, updateGoal, completeGoal, cancelGoal,
    pauseGoal, resumeGoal, clearGoal, resetGoalStore,
    goalHasCompletionEvidence,
} from '../goal/store.js';
import { clearGoalTimers, kickGoalContinuation } from '../agent/lifecycle-handler.js';

export function registerGoalRoutes(app: Router, requireAuth: RequestHandler): void {
    app.get('/api/goal', requireAuth, (_req, res) => {
        const goal = getActiveGoal();
        res.json({ ok: true, goal });
    });

    app.get('/api/goal/history', requireAuth, (req, res) => {
        const limit = Math.min(Number(req.query['limit']) || 10, 50);
        const history = getGoalHistory();
        res.json({ ok: true, goals: history.goals.slice(0, limit) });
    });

    app.post('/api/goal', requireAuth, (req, res) => {
        const body = req.body as Record<string, unknown> | undefined;
        const action = String(body?.['action'] || 'set');
        try {
            switch (action) {
                case 'set': {
                    const objective = String(body?.['objective'] || '').trim();
                    if (!objective) {
                        res.status(400).json({ ok: false, error: 'objective is required' });
                        return;
                    }
                    const existing = getActiveGoal();
                    if (existing && (existing.status === 'active' || existing.status === 'paused')) {
                        res.status(409).json({ ok: false, error: `Active goal already exists: "${existing.objective}". Cancel or complete it first.` });
                        return;
                    }
                    clearGoalTimers();
                    const repoRoot = body?.['repoRoot'] as string | undefined;
                    const budget = body?.['budget'] as Record<string, number> | undefined;
                    const goal = setGoal(objective, {
                        ...(repoRoot ? { repoRoot } : {}),
                        ...(budget ? { budget } : {}),
                    });
                    res.json({ ok: true, goal });
                    return;
                }
                case 'update': {
                    const summary = String(body?.['summary'] || '').trim();
                    if (!summary) {
                        res.status(400).json({ ok: false, error: 'summary is required' });
                        return;
                    }
                    const ev = body?.['evidence'];
                    const evidence = Array.isArray(ev) ? ev.map(String) : (typeof ev === 'string' && ev ? [ev] : []);
                    const goal = updateGoal(summary, String(body?.['nextAction'] || ''), evidence);
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'done': {
                    const force = body?.['force'] === true;
                    if (!force && !goalHasCompletionEvidence(getActiveGoal())) {
                        res.status(409).json({ ok: false, error: 'Goal completion requires verification evidence on the latest checkpoint. Log it via `cli-jaw goal update "<summary>" --evidence "<test result / changed file>"`, then retry — or pass --force for an explicit manual override.' });
                        return;
                    }
                    const goal = completeGoal(body?.['note'] as string | undefined);
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    clearGoalTimers();
                    res.json({ ok: true, goal });
                    return;
                }
                case 'cancel': {
                    const goal = cancelGoal(body?.['reason'] as string | undefined);
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    clearGoalTimers();
                    res.json({ ok: true, goal });
                    return;
                }
                case 'pause': {
                    const goal = pauseGoal();
                    if (!goal) { res.status(400).json({ ok: false, error: 'No active goal to pause' }); return; }
                    clearGoalTimers();
                    res.json({ ok: true, goal });
                    return;
                }
                case 'resume': {
                    const existing = getActiveGoal();
                    if (existing && existing.status === 'active') {
                        res.json({ ok: true, goal: existing, alreadyActive: true });
                        return;
                    }
                    const goal = resumeGoal();
                    if (!goal) { res.status(400).json({ ok: false, error: 'No active or paused goal to resume' }); return; }
                    kickGoalContinuation();
                    res.json({ ok: true, goal });
                    return;
                }
                case 'clear': {
                    clearGoalTimers();
                    const ok = clearGoal();
                    res.json({ ok, cleared: ok });
                    return;
                }
                case 'reset': {
                    clearGoalTimers();
                    resetGoalStore();
                    res.json({ ok: true, reset: true });
                    return;
                }
                default:
                    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
            }
        } catch (err) {
            res.status(500).json({ ok: false, error: (err as Error).message });
        }
    });
}
