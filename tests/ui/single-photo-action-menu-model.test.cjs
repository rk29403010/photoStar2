const test = require('node:test');
const assert = require('node:assert/strict');

function presentation(overrides = {}) {
    return {
        presentationKey: 'variant:stack-1',
        representativeAssetId: 'asset-1',
        relationshipKind: 'variant',
        stackCount: 2,
        assetIds: ['asset-1', 'asset-2'],
        momentCount: 1,
        ...overrides,
    };
}

test('relationship action menu exposes semantic star and separate actions from presentation state', async () => {
    const {
        getRelationshipSeparateLabel,
        getRelationshipStarLabel,
        resolveRelationshipMenuState,
    } = await import('../../src/ui/components/single-photo/singlePhotoActionMenuModel.ts');

    const stack = presentation();
    assert.equal(getRelationshipStarLabel(true), 'Make Star');
    assert.equal(getRelationshipSeparateLabel(true), 'Show Separately');

    assert.deepEqual(resolveRelationshipMenuState({
        asset: { id: 'asset-2', original_path: 'two.jpg' },
        presentation: stack,
        canSetRepresentative: true,
        canSeparate: true,
    }), {
        relationshipId: 'variant:stack-1',
        isPresentation: true,
        showMakeStar: true,
        showSeparate: true,
    });

    assert.deepEqual(resolveRelationshipMenuState({
        asset: { id: 'asset-1', original_path: 'one.jpg' },
        presentation: stack,
        canSetRepresentative: true,
        canSeparate: true,
    }), {
        relationshipId: 'variant:stack-1',
        isPresentation: true,
        showMakeStar: false,
        showSeparate: true,
    });
});

test('relationship action menu hides presentation actions without a semantic stack or capability', async () => {
    const { resolveRelationshipMenuState } = await import('../../src/ui/components/single-photo/singlePhotoActionMenuModel.ts');

    assert.deepEqual(resolveRelationshipMenuState({
        asset: { id: 'asset-3', original_path: 'three.jpg' },
        presentation: null,
        canSetRepresentative: true,
        canSeparate: true,
    }), {
        relationshipId: null,
        isPresentation: false,
        showMakeStar: false,
        showSeparate: false,
    });

    const stack = presentation({ representativeAssetId: 'asset-9' });
    const disabled = resolveRelationshipMenuState({
        asset: { id: 'asset-3', original_path: 'three.jpg' },
        presentation: stack,
        canSetRepresentative: false,
        canSeparate: false,
    });
    assert.equal(disabled.showMakeStar, false);
    assert.equal(disabled.showSeparate, false);
});
