const test = require('node:test');
const assert = require('node:assert/strict');

function presentationItem(presentationKey, relationshipKind) {
    return {
        presentationKey,
        representativeAssetId: `asset-${presentationKey}`,
        relationshipKind,
        stackCount: 2,
        assetIds: ['a', 'b'],
        originalPath: 'C:/photos/a.jpg',
        photoCreatedAt: null,
        createdAt: '2026-09-07T00:00:00.000Z',
        previewPath: null,
    };
}

test('buildGroupIdPillModels uses semantic relationship symbols', async () => {
    const { buildGroupIdPillModels } = await import('../../src/ui/components/layout/tileGroupIdModel.ts');

    const pills = buildGroupIdPillModels([
        presentationItem('exact:duplicate', 'exact_copy'),
        presentationItem('near:family', 'near_duplicate'),
        presentationItem('variant:family', 'variant'),
        presentationItem('sequence:burst', 'capture_sequence'),
        presentationItem('edit:lineage', 'edit_lineage'),
    ]);

    assert.deepEqual(
        pills.map((pill) => ({ key: pill.key, symbol: pill.symbol })),
        [
            { key: 'exact:duplicate', symbol: '≡' },
            { key: 'near:family', symbol: '≈' },
            { key: 'variant:family', symbol: '~' },
            { key: 'sequence:burst', symbol: '*' },
            { key: 'edit:lineage', symbol: '↗' },
        ],
    );
});
