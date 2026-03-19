const test = require('node:test');
const assert = require('node:assert/strict');

test('thumbnail selection switches the active asset and opens child groups when needed', async () => {
    const { buildVariantMemberActions } = await import('../../src/ui/components/single-photo/variantFilmstripModel.ts');
    const calls = [];
    const groupItem = {
        kind: 'group',
        group_id: 'group-2',
        group_type: 'variant_set',
        stack_count: 3,
        asset: { id: 'asset-2', original_path: 'two.jpg' },
    };
    const assetItem = {
        kind: 'asset',
        group_id: 'group-1',
        group_type: 'duplicate',
        stack_count: 2,
        asset: { id: 'asset-3', original_path: 'three.jpg' },
    };

    const groupActions = buildVariantMemberActions({
        item: groupItem,
        onSelectAsset: (assetId) => {
            calls.push(['select', assetId]);
        },
        onOpenGroup: (groupId) => {
            calls.push(['open', groupId]);
        },
    });
    const assetActions = buildVariantMemberActions({
        item: assetItem,
        onSelectAsset: (assetId) => {
            calls.push(['select', assetId]);
        },
        onOpenGroup: (groupId) => {
            calls.push(['open', groupId]);
        },
    });

    groupActions.openGroup();
    assetActions.selectMember();

    assert.deepEqual(calls, [
        ['select', 'asset-2'],
        ['open', 'group-2'],
        ['select', 'asset-3'],
    ]);
});

test('variant filmstrip model exposes hierarchy-aware selection helpers', async () => {
    const {
        FILLED_STAR_SYMBOL,
        getVariantStarDisplayState,
        getVariantTileTitle,
        getStarActionTitle,
        isOrbitItemSelected,
        isVariantStarred,
        shouldShowVariantFilmstrip,
    } = await import('../../src/ui/components/single-photo/variantFilmstripModel.ts');

    assert.equal(getVariantTileTitle(true), 'Current star image');
    assert.equal(getVariantTileTitle(false), 'View this similar photo');
    assert.equal(getStarActionTitle(), 'Make this the star image');
    assert.equal(FILLED_STAR_SYMBOL, '⭐');
    assert.equal(getVariantStarDisplayState({ isStarred: true, isHovered: false }), 'filled');
    assert.equal(getVariantStarDisplayState({ isStarred: false, isHovered: true }), 'hidden');
    assert.equal(isVariantStarred({ id: 'asset-1', original_path: 'one.jpg', group_role: 'canonical' }), true);
    assert.equal(isVariantStarred({ id: 'asset-2', original_path: 'two.jpg', role: 'canonical' }), true);
    assert.equal(shouldShowVariantFilmstrip({ groupId: 'group-1', hasOrbitLoader: true }), true);
    assert.equal(shouldShowVariantFilmstrip({ groupId: null, hasOrbitLoader: true }), false);

    const selectedAsset = {
        id: 'asset-2',
        original_path: 'two.jpg',
        group_id: 'group-burst',
        group_memberships: [
            { group_id: 'group-burst', group_role: 'member', stack_count: 3, role: 'member', rank: null, match_evidence: null, group_type: 'burst' },
            { group_id: 'group-variant', group_role: 'canonical', stack_count: 2, role: 'canonical', rank: -1, match_evidence: null, group_type: 'variant_set' },
        ],
    };

    assert.equal(isOrbitItemSelected({
        kind: 'group',
        group_id: 'group-variant',
        group_type: 'variant_set',
        stack_count: 2,
        asset: { id: 'asset-2', original_path: 'two.jpg' },
    }, selectedAsset), true);
    assert.equal(isOrbitItemSelected({
        kind: 'asset',
        group_id: 'group-variant',
        group_type: 'variant_set',
        stack_count: 1,
        asset: { id: 'asset-2', original_path: 'two.jpg' },
    }, selectedAsset), true);
});
