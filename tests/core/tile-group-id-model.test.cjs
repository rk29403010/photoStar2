const test = require('node:test');
const assert = require('node:assert/strict');

test('buildGroupIdPillModels uses the configured symbols per group type', async () => {
    const { buildGroupIdPillModels } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPillModels([
        { group_id: 'group-duplicate', group_type: 'duplicate' },
        { group_id: 'group-near', group_type: 'near_duplicate' },
        { group_id: 'group-variant', group_type: 'variant_set' },
        { group_id: 'group-burst', group_type: 'burst' },
        { group_id: 'group-people', group_type: 'people' },
    ]);

    assert.deepEqual(
        pills.map((pill) => ({ key: pill.key, symbol: pill.symbol })),
        [
            { key: 'group-duplicate', symbol: '≡' },
            { key: 'group-near', symbol: '≈' },
            { key: 'group-variant', symbol: '~' },
            { key: 'group-burst', symbol: '*' },
            { key: 'group-people', symbol: 'P' },
        ],
    );
});
