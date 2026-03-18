const test = require('node:test');
const assert = require('node:assert/strict');

test('filterDiagnosticsGroups keeps only suspicious groups in suspicious mode', async () => {
    const { filterDiagnosticsGroups } = await import('../../src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts');

    const groups = [
        { groupId: 'group-safe', flags: [] },
        { groupId: 'group-flagged', flags: ['overcount_on_collapse'] },
    ];

    const filtered = filterDiagnosticsGroups(groups, 'suspicious');

    assert.deepEqual(filtered.map((group) => group.groupId), ['group-flagged']);
});

test('filterDiagnosticsGroups returns all groups in all mode', async () => {
    const { filterDiagnosticsGroups } = await import('../../src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts');

    const groups = [
        { groupId: 'group-safe', flags: [] },
        { groupId: 'group-flagged', flags: ['overcount_on_collapse'] },
    ];

    const filtered = filterDiagnosticsGroups(groups, 'all');

    assert.deepEqual(filtered.map((group) => group.groupId), ['group-safe', 'group-flagged']);
});
