const test = require('node:test');
const assert = require('node:assert/strict');

function presentation(presentationKey, relationshipKind) {
    return {
        presentationKey,
        representativeAssetId: 'asset-representative',
        relationshipKind,
        stackCount: 2,
        assetIds: ['asset-representative', 'asset-member'],
        momentCount: 1,
    };
}

test('buildGroupIdPills formats the trailing four characters for presentation keys', async () => {
    const { buildGroupIdPills } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPills([
        presentation('sequence:1234', 'capture_sequence'),
        presentation('variant:9abc', 'variant'),
        presentation('xy', null),
    ]);

    assert.deepEqual(pills, ['1234', '9abc', 'xy']);
});

test('buildGroupIdPills de-duplicates repeated presentation keys and ignores empty entries', async () => {
    const { buildGroupIdPills } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPills([
        presentation('variant:ffff', 'variant'),
        presentation('variant:ffff', 'near_duplicate'),
        null,
        undefined,
    ]);

    assert.deepEqual(pills, ['ffff']);
});

test('buildGroupIdPillModels assigns stable relationship symbols and per-presentation colors', async () => {
    const { buildGroupIdPillModels } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPillModels([
        presentation('sequence:1234', 'capture_sequence'),
        presentation('variant:9abc', 'variant'),
        presentation('exact:ffff', 'exact_copy'),
    ]);

    assert.deepEqual(
        pills.map((pill) => ({ label: pill.label, symbol: pill.symbol })),
        [
            { label: '1234', symbol: '*' },
            { label: '9abc', symbol: '~' },
            { label: 'ffff', symbol: '≡' },
        ],
    );
    assert.match(pills[0].background, /^hsla\(/);
    assert.match(pills[1].background, /^hsla\(/);
    assert.notEqual(pills[0].background, pills[1].background);
    assert.notEqual(pills[1].background, pills[2].background);

    const repeated = buildGroupIdPillModels([
        presentation('sequence:1234', 'exact_copy'),
    ]);
    assert.equal(repeated[0].background, pills[0].background);
});
