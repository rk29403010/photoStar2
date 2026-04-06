const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-tag-repository-'));
}

function prepareCommonJsDistHarness(tempDir) {
    const sourceRoot = path.resolve(__dirname, '../../dist/core/src');
    const harnessRoot = path.join(tempDir, 'dist-core-cjs');
    fs.mkdirSync(harnessRoot, { recursive: true });
    fs.cpSync(sourceRoot, harnessRoot, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
    const repoNodeModules = path.resolve(__dirname, '../../node_modules');
    process.env.NODE_PATH = process.env.NODE_PATH
        ? `${repoNodeModules}${path.delimiter}${process.env.NODE_PATH}`
        : repoNodeModules;
    Module._initPaths();
    return harnessRoot;
}

function createHarness() {
    const tempDir = createTempDir();
    const harnessRoot = prepareCommonJsDistHarness(tempDir);
    const { DatabaseManager } = require(path.join(harnessRoot, 'data/db.js'));
    const { createTagRepository } = require(path.join(harnessRoot, 'services/tags/tagRepository.js'));
    const dbManager = new DatabaseManager(tempDir);
    return {
        dbManager,
        repository: createTagRepository({ dbManager }),
        cleanup() {
            dbManager.close();
            fs.rmSync(tempDir, { recursive: true, force: true });
        },
    };
}

function seedAsset(db, assetId = 'asset-1') {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES (?, ?, '2026-04-03T10:00:00.000Z')
    `).run(assetId, `C:/photos/${assetId}.jpg`);
}

test('tag repository creates tags, aliases, assignments, and review items', () => {
    const harness = createHarness();

    try {
        seedAsset(harness.dbManager.getDb());

        const tagDefinitionId = harness.repository.createTagDefinition({
            id: 'tag-family',
            canonicalLabel: 'Family',
            description: 'Family scenes and relationships',
            status: 'active',
        });
        const tagAliasId = harness.repository.createTagAlias({
            id: 'alias-family',
            tagDefinitionId,
            aliasLabel: 'family time',
        });
        harness.repository.assignTagToAsset({
            assetId: 'asset-1',
            tagDefinitionId,
            sourceKind: 'manual',
            sourceRecordId: 'user-1',
            confidence: null,
        });
        const reviewItemId = harness.repository.createReviewItem({
            id: 'review-1',
            reviewItemType: 'tag_proposal',
            subjectType: 'asset',
            subjectId: 'asset-1',
            payloadJson: JSON.stringify({ proposedLabel: 'celebration' }),
            status: 'pending',
        });

        const assetTags = harness.repository.listTagsForAsset('asset-1');
        const taggedAssets = harness.repository.listAssetsForTag(tagDefinitionId);
        const reviewItems = harness.repository.listReviewItems({ status: 'pending' });

        assert.equal(tagDefinitionId, 'tag-family');
        assert.equal(tagAliasId, 'alias-family');
        assert.equal(reviewItemId, 'review-1');
        assert.equal(assetTags.length, 1);
        assert.equal(assetTags[0].canonicalLabel, 'Family');
        assert.equal(assetTags[0].sourceKind, 'manual');
        assert.equal(taggedAssets.length, 1);
        assert.equal(taggedAssets[0].assetId, 'asset-1');
        assert.equal(reviewItems.length, 1);
        assert.equal(reviewItems[0].reviewItemType, 'tag_proposal');
    } finally {
        harness.cleanup();
    }
});

test('tag repository renames tags, manages aliases, and merges duplicate tags into a canonical target', () => {
    const harness = createHarness();

    try {
        const db = harness.dbManager.getDb();
        seedAsset(db, 'asset-1');
        seedAsset(db, 'asset-2');

        const familyTagId = harness.repository.createTagDefinition({
            id: 'tag-family',
            canonicalLabel: 'Family',
            status: 'active',
        });
        const groupPhotoTagId = harness.repository.createTagDefinition({
            id: 'tag-group-photo',
            canonicalLabel: 'Group Photo',
            status: 'active',
        });

        harness.repository.assignTagToAsset({ assetId: 'asset-1', tagDefinitionId: familyTagId, sourceKind: 'manual', sourceRecordId: 'user-1', confidence: null });
        harness.repository.assignTagToAsset({ assetId: 'asset-2', tagDefinitionId: groupPhotoTagId, sourceKind: 'manual', sourceRecordId: 'user-2', confidence: null });
        harness.repository.createTagAlias({ id: 'alias-group-shot', tagDefinitionId: groupPhotoTagId, aliasLabel: 'Group Shot' });

        harness.repository.renameTagDefinition({ tagDefinitionId: familyTagId, canonicalLabel: 'Family Life' });

        assert.equal(harness.repository.getTagDefinition(familyTagId)?.canonicalLabel, 'Family Life');
        assert.equal(harness.repository.findTagDefinitionByLabel('family')?.id, familyTagId);
        assert.deepEqual(harness.repository.listTagAliases(familyTagId).map((alias) => alias.aliasLabel), ['Family']);

        const manualAliasId = harness.repository.createTagAlias({
            id: 'alias-household',
            tagDefinitionId: familyTagId,
            aliasLabel: 'Household',
        });

        assert.equal(harness.repository.findTagDefinitionByLabel('household')?.id, familyTagId);
        harness.repository.deleteTagAlias(manualAliasId);
        assert.equal(harness.repository.findTagDefinitionByLabel('household'), null);

        harness.repository.mergeTagDefinitions({
            sourceTagDefinitionId: familyTagId,
            targetTagDefinitionId: groupPhotoTagId,
        });

        assert.equal(harness.repository.getTagDefinition(familyTagId), null);
        assert.equal(harness.repository.findTagDefinitionByLabel('family life')?.id, groupPhotoTagId);
        assert.equal(harness.repository.findTagDefinitionByLabel('family')?.id, groupPhotoTagId);
        assert.deepEqual(harness.repository.listTagAliases(groupPhotoTagId).map((alias) => alias.aliasLabel).sort((left, right) => left.localeCompare(right)), ['Family', 'Family Life', 'Group Shot']);
        assert.deepEqual(harness.repository.listAssetsForTag(groupPhotoTagId).map((record) => record.assetId).sort(), ['asset-1', 'asset-2']);
    } finally {
        harness.cleanup();
    }
});
