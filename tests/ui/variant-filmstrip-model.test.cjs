const test = require('node:test');
const assert = require('node:assert/strict');

test('thumbnail selection switches the active asset without changing the group canonical image', async () => {
    const { buildVariantMemberActions } = await import('../../src/ui/components/single-photo/variantFilmstripModel.ts');
    const calls = [];
    const actions = buildVariantMemberActions({
        memberId: 'asset-2',
        onSelectAsset: (assetId) => {
            calls.push(['select', assetId]);
        }
    });

    actions.selectMember();

    assert.deepEqual(calls, [['select', 'asset-2']]);
});

test('variant filmstrip copy uses star language instead of canonical jargon', async () => {
    const {
        FILLED_STAR_SYMBOL,
        getVariantStarDisplayState,
        getVariantTileTitle,
        getStarActionTitle,
        isVariantStarred,
        normalizeOrbitMembers,
        shouldShowVariantFilmstrip,
    } = await import('../../src/ui/components/single-photo/variantFilmstripModel.ts');

    assert.equal(getVariantTileTitle(true), 'Current star image');
    assert.equal(getVariantTileTitle(false), 'View this similar photo');
    assert.equal(getStarActionTitle(), 'Make this the star image');
    assert.equal(FILLED_STAR_SYMBOL, '⭐');
    assert.equal(getVariantStarDisplayState({ isStarred: true, isHovered: false }), 'filled');
    assert.equal(getVariantStarDisplayState({ isStarred: true, isHovered: true }), 'filled');
    assert.equal(getVariantStarDisplayState({ isStarred: false, isHovered: false }), 'hidden');
    assert.equal(getVariantStarDisplayState({ isStarred: false, isHovered: true }), 'hidden');
    assert.equal(isVariantStarred({ id: 'asset-1', original_path: 'one.jpg', group_role: 'canonical' }), true);
    assert.equal(isVariantStarred({ id: 'asset-2', original_path: 'two.jpg', role: 'canonical' }), true);
    assert.equal(isVariantStarred({ id: 'asset-3', original_path: 'three.jpg', group_role: 'member' }), false);
    assert.equal(shouldShowVariantFilmstrip({ groupId: 'group-1', hasOrbitLoader: true }), true);
    assert.equal(shouldShowVariantFilmstrip({ groupId: null, hasOrbitLoader: true }), false);

    assert.deepEqual(
        normalizeOrbitMembers('group-1', [
            { id: 'asset-1', original_path: 'one.jpg', role: 'canonical' },
            { id: 'asset-2', original_path: 'two.jpg', group_role: 'member' },
        ]),
        [
            { id: 'asset-1', original_path: 'one.jpg', role: 'canonical', group_id: 'group-1', group_role: 'canonical' },
            { id: 'asset-2', original_path: 'two.jpg', group_role: 'member', group_id: 'group-1' },
        ]
    );
});
