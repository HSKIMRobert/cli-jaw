import test from 'node:test';
import assert from 'node:assert/strict';
import {
    claimWorker,
    clearAllWorkers,
    finishWorker,
    getWorkerSlot,
    listPendingWorkerResults,
    updateWorkerTools,
} from '../../src/orchestrator/worker-registry.ts';

test.afterEach(() => {
    clearAllWorkers();
});

test('worker registry stores readable employee tool progress while running', () => {
    claimWorker({ id: 'backend', name: 'Backend' }, 'verify build');
    updateWorkerTools('backend', [{
        icon: '🔧',
        label: "/bin/zsh -lc 'npm run typecheck'",
        toolType: 'tool',
        status: 'running',
    }]);

    const slot = getWorkerSlot('backend');
    assert.equal(slot?.tools.length, 1);
    assert.equal(slot?.tools[0]?.label, "/bin/zsh -lc 'npm run typecheck'");
    assert.equal(slot?.progressUpdatedAt && slot.progressUpdatedAt > 0, true);
});

test('pending worker replay includes final employee tool process', () => {
    claimWorker({ id: 'backend', name: 'Backend' }, 'verify build');
    finishWorker('backend', 'done', [{
        icon: '⚡',
        label: "/bin/zsh -lc 'npm run build'",
        toolType: 'tool',
        status: 'done',
    }]);

    const pending = listPendingWorkerResults();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.text, 'done');
    assert.equal(pending[0]?.tools?.[0]?.label, "/bin/zsh -lc 'npm run build'");
});
