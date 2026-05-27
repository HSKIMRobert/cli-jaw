import { Router } from 'express';
import {
    getActiveGoal, getGoalHistory,
    setGoal, updateGoal, completeGoal, cancelGoal,
    pauseGoal, resumeGoal, clearGoal, resetGoalStore,
} from '../goal/store.js';
import type { GoalStatus } from '../goal/types.js';

export function registerGoalRoutes(app: Router): void {
    app.get('/api/goal', (_req, res) => {
        const goal = getActiveGoal();
        res.json({ ok: true, goal });
    });

    app.get('/api/goal/history', (req, res) => {
        const limit = Math.min(Number(req.query['limit']) || 10, 50);
        const history = getGoalHistory();
        res.json({ ok: true, goals: history.goals.slice(0, limit) });
    });

    app.post('/api/goal', (req, res) => {
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
                    const goal = updateGoal(summary, String(body?.['nextAction'] || ''));
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'done': {
                    const goal = completeGoal(body?.['note'] as string | undefined);
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'cancel': {
                    const goal = cancelGoal(body?.['reason'] as string | undefined);
                    if (!goal) { res.status(404).json({ ok: false, error: 'No active goal' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'pause': {
                    const goal = pauseGoal();
                    if (!goal) { res.status(400).json({ ok: false, error: 'No active goal to pause' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'resume': {
                    const goal = resumeGoal();
                    if (!goal) { res.status(400).json({ ok: false, error: 'No paused goal to resume' }); return; }
                    res.json({ ok: true, goal });
                    return;
                }
                case 'clear': {
                    if (!body?.['confirm']) { res.status(400).json({ ok: false, error: 'Pass confirm: true to clear active goal' }); return; }
                    const ok = clearGoal();
                    res.json({ ok, cleared: ok });
                    return;
                }
                case 'reset': {
                    if (!body?.['confirm']) { res.status(400).json({ ok: false, error: 'Pass confirm: true to reset goal store' }); return; }
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
