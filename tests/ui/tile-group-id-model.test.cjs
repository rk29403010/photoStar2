const test = require('node:test');
const assert = require('node:assert/strict');

test('buildGroupIdPills formats the trailing four characters for every group membership', async () => {
    const { buildGroupIdPills } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPills([
        { group_id: 'group-burst-1234' },
        { group_id: 'group-variant-9abc' },
        { group_id: 'xy' },
    ]);

    assert.deepEqual(pills, ['1234', '9abc', 'xy']);
});

test('buildGroupIdPills de-duplicates repeated group ids and ignores empty entries', async () => {
    const { buildGroupIdPills } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPills([
        { group_id: 'group-1-ffff' },
        { group_id: 'group-1-ffff' },
        { group_id: '' },
        { group_id: null },
    ]);

    assert.deepEqual(pills, ['ffff']);
});

test('buildGroupIdPillModels assigns stable symbols and stable per-group colors', async () => {
    const { buildGroupIdPillModels } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPillModels([
        { group_id: 'group-burst-1234', group_type: 'burst' },
        { group_id: 'group-variant-9abc', group_type: 'variant_set' },
        { group_id: 'group-duplicate-ffff', group_type: 'duplicate' },
    ]);

    assert.deepEqual(
        pills.map((pill) => ({ label: pill.label, symbol: pill.symbol })),
        [
            { label: '1234', symbol: '*' },
            { label: '9abc', symbol: '~' },
            { label: 'ffff', symbol: '=' },
        ]
    );
    assert.match(pills[0].background, /^hsla\(/);
    assert.match(pills[1].background, /^hsla\(/);
    assert.notEqual(pills[0].background, pills[1].background);
    assert.notEqual(pills[1].background, pills[2].background);

    const repeated = buildGroupIdPillModels([
        { group_id: 'group-burst-1234', group_type: 'duplicate' },
    ]);
    assert.equal(repeated[0].background, pills[0].background);
});
