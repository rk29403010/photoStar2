const test = require('node:test');
const assert = require('node:assert/strict');

test('group action menu only exposes star selection for grouped non-canonical assets', async () => {
    const {
        canExplodeGroup,
        canSelectAsStar,
        getExplodeGroupLabel,
        getSelectAsStarLabel,
        isCanonicalGroupMember,
    } = await import('../../src/ui/components/single-photo/singlePhotoActionMenuModel.ts');

    assert.equal(getSelectAsStarLabel(), 'Select as ⭐');
    assert.equal(getExplodeGroupLabel(), 'Explode Group');
    assert.equal(isCanonicalGroupMember({ id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'canonical' }), true);
    assert.equal(canSelectAsStar({ id: 'asset-2', original_path: 'two.jpg', group_id: 'group-1', group_role: 'member' }), true);
    assert.equal(canSelectAsStar({ id: 'asset-3', original_path: 'three.jpg', group_id: 'group-1', group_role: 'canonical' }), false);
    assert.equal(canSelectAsStar({ id: 'asset-4', original_path: 'four.jpg' }), false);
    assert.equal(canExplodeGroup({ id: 'asset-5', original_path: 'five.jpg', group_id: 'group-1' }), true);
    assert.equal(canExplodeGroup({ id: 'asset-6', original_path: 'six.jpg' }), false);
});
