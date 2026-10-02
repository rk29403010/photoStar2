const test = require('node:test');
const assert = require('node:assert/strict');

function presentation(key, representativeAssetId, assetIds) {
    return {
        presentationKey: key,
        representativeAssetId,
        relationshipKind: 'exact_copy',
        stackCount: assetIds.length,
        assetIds,
        momentCount: 1,
    };
}

test('findSinglePhotoPresentation resolves both representative and non-visible member assets', async () => {
    const { findSinglePhotoPresentation } = await import('../../src/ui/components/app/singlePhotoPresentationModel.ts');
    const stack = presentation('exact:stack-a', 'representative', ['representative', 'member-not-on-gallery-page']);
    const items = [stack, presentation('exact:stack-b', 'other', ['other', 'other-member'])];

    assert.equal(findSinglePhotoPresentation(items, 'representative'), stack);
    assert.equal(findSinglePhotoPresentation(items, 'member-not-on-gallery-page'), stack);
    assert.equal(findSinglePhotoPresentation(items, 'missing'), null);
    assert.equal(findSinglePhotoPresentation(items, null), null);
});
