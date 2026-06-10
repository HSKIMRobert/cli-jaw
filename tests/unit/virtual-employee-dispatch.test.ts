import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildVirtualEmployeeRow,
    findVirtualRolePreset,
    isVirtualEmployeeId,
    VIRTUAL_EMPLOYEE_ID_PREFIX,
    VIRTUAL_ROLE_PRESETS,
} from '../../src/core/employees.ts';
import { ROLE_PRESETS } from '../../public/js/constants.ts';

test('virtual employee builder creates ephemeral synthetic rows from role presets', () => {
    const row = buildVirtualEmployeeRow(
        { name: 'security' },
        { cli: 'claude', model: 'claude-fable-5' },
    );

    assert.ok(isVirtualEmployeeId(row.id), 'virtual worker id should use virtual prefix');
    assert.ok(row.id.startsWith(`${VIRTUAL_EMPLOYEE_ID_PREFIX}security:`));
    assert.equal(row.name, 'Virtual:security');
    assert.equal(row.cli, 'claude');
    assert.equal(row.model, 'claude-fable-5');
    assert.equal(row.status, 'idle');
    assert.match(row.role, /Security reviewer/);
});

test('virtual employee builder accepts freeform role and explicit cli/model overrides', () => {
    const row = buildVirtualEmployeeRow(
        {
            name: 'release-checker',
            role: 'Review release notes and deployment risk.',
            cli: 'codex',
            model: 'gpt-5.5',
        },
        { cli: 'claude', model: 'claude-fable-5' },
    );

    assert.ok(isVirtualEmployeeId(row.id));
    assert.equal(row.name, 'Virtual:release-checker');
    assert.equal(row.cli, 'codex');
    assert.equal(row.model, 'gpt-5.5');
    assert.equal(row.role, 'Review release notes and deployment risk.');
});

test('virtual employee role presets stay aligned with frontend role presets', () => {
    const frontendValues = new Map(ROLE_PRESETS.map((preset) => [preset.value, preset]));
    for (const preset of VIRTUAL_ROLE_PRESETS) {
        const frontend = frontendValues.get(preset.value);
        assert.ok(frontend, `frontend ROLE_PRESETS should include ${preset.value}`);
        assert.equal(frontend?.skill, preset.skill);
        assert.equal(frontend?.prompt, preset.role);
    }
});

test('findVirtualRolePreset resolves values and labels case-insensitively', () => {
    assert.equal(findVirtualRolePreset('testing')?.value, 'testing');
    assert.equal(findVirtualRolePreset('Security')?.value, 'security');
    assert.equal(findVirtualRolePreset('unknown'), null);
});
