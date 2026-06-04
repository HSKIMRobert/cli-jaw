import test from 'node:test';
import assert from 'node:assert/strict';
import {
    firstDirectory,
    firstFile,
    isPreviewDropTarget,
    shouldConsumeManagerDrop,
} from '../../public/manager/src/hooks/useElectronDroppedPaths.js';

test('manager drop routing prefers directory entries for folder panel root', () => {
    const entries = [
        { name: 'a.md', path: '/Users/jun/a.md', kind: 'file' as const },
        { name: 'Octopus', path: '/Users/jun/Octopus', kind: 'directory' as const },
    ];
    assert.equal(firstDirectory(entries)?.path, '/Users/jun/Octopus');
    assert.equal(firstFile(entries)?.path, '/Users/jun/a.md');
});

test('drop routing does not consume preview frame drops', () => {
    const preview = {
        closest: (selector: string) => selector.includes('.preview-panel') ? preview : null,
    } as unknown as EventTarget;

    assert.equal(isPreviewDropTarget(preview), true);
    assert.equal(shouldConsumeManagerDrop(preview), false);
});

test('drop routing consumes manager surface drops', () => {
    const surface = {
        closest: () => null,
    } as unknown as EventTarget;

    assert.equal(shouldConsumeManagerDrop(surface), true);
});
