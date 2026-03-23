const test = require('node:test');
const assert = require('node:assert/strict');

test('buildGroupDiagnosticsReport includes representative preview thumbnails for groups and memberships', async () => {
    const { buildGroupDiagnosticsReport } = await import('../../src/shared/utils/groupDiagnosticsModel.ts');

    const report = buildGroupDiagnosticsReport({
        assets: [
            {
                assetId: 'asset-1',
                originalPath: 'C:/photos/one-a.jpg',
                previewPath: 'C:/previews/one-a.jpg',
                groupIds: ['group-burst', 'group-duplicate'],
            },
            {
                assetId: 'asset-2',
                originalPath: 'C:/photos/one-b.jpg',
                previewPath: 'C:/previews/one-b.jpg',
                groupIds: ['group-duplicate'],
            },
        ],
        groups: [
            {
                groupId: 'group-burst',
                groupType: 'burst',
                representativeAssetId: 'asset-1',
                assetIds: [],
                childGroupIds: ['group-duplicate'],
            },
            {
                groupId: 'group-duplicate',
                groupType: 'duplicate',
                representativeAssetId: 'asset-1',
                assetIds: ['asset-1', 'asset-2'],
                childGroupIds: [],
            },
        ],
    });

    const burstGroup = report.groups.find((group) => group.groupId === 'group-burst');
    assert.ok(burstGroup);
    assert.equal(burstGroup.representativePreviewPath, 'C:/previews/one-a.jpg');
    assert.equal(burstGroup.children[0]?.representativePreviewPath, 'C:/previews/one-a.jpg');

    const duplicateGroup = report.groups.find((group) => group.groupId === 'group-duplicate');
    assert.ok(duplicateGroup);
    assert.equal(duplicateGroup.representativePreviewPath, 'C:/previews/one-a.jpg');
    assert.equal(duplicateGroup.assets[0]?.previewPath, 'C:/previews/one-a.jpg');
    assert.deepEqual(
        duplicateGroup.assets[0]?.groups.map((group) => ({
            groupId: group.groupId,
            representativePreviewPath: group.representativePreviewPath,
        })),
        [
            { groupId: 'group-burst', representativePreviewPath: 'C:/previews/one-a.jpg' },
            { groupId: 'group-duplicate', representativePreviewPath: 'C:/previews/one-a.jpg' },
        ],
    );
});
