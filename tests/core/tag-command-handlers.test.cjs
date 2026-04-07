const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-tag-command-handlers-'));
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

function createResponseCollector() {
    const responses = [];
    return {
        respond(id, status, data, error) {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a response');
            }
            return response;
        },
    };
}

function seedAsset(db, assetId) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES (?, ?, '2026-04-04T10:00:00.000Z')
    `).run(assetId, `C:/photos/${assetId}.jpg`);
}

function createHarness() {
    const tempDir = createTempDir();
    const harnessRoot = prepareCommonJsDistHarness(tempDir);
    const collector = createResponseCollector();
    const { DatabaseManager } = require(path.join(harnessRoot, 'data/db.js'));
    const { handleSystemCommand } = require(path.join(harnessRoot, 'services/handlers.js'));
    const { createTagRepository } = require(path.join(harnessRoot, 'services/tags/tagRepository.js'));
    const dbManager = new DatabaseManager(tempDir);

    return {
        tempDir,
        dbManager,
        repository: createTagRepository({ dbManager }),
        runCommand(command, payload, id = command) {
            handleSystemCommand({
                id,
                command,
                payload,
                dbManager,
                eventBus: { emit() {} },
                activeJobs: new Map(),
                LIB_DIR: tempDir,
                respond: collector.respond,
            });
            return collector.takeLast();
        },
        cleanup() {
            dbManager.close();
            fs.rmSync(tempDir, { recursive: true, force: true });
        },
    };
}

function seedStandardTags(repository) {
    const familyTagId = repository.createTagDefinition({
        id: 'tag-family',
        canonicalLabel: 'Family',
        description: 'Family scenes',
        status: 'active',
        category: 'people',
    });
    const retiredTagId = repository.createTagDefinition({
        id: 'tag-retired',
        canonicalLabel: 'Obsolete',
        status: 'retired',
    });
    return { familyTagId, retiredTagId };
}

function assertListAvailableTagsResponse(response, familyTagId, retiredTagId) {
    assert.equal(response.status, 'ok');
    assert.equal(response.data.tags.length, 1);
    assert.equal(response.data.tags[0].id, familyTagId);
    assert.equal(response.data.tags[0].canonicalLabel, 'Family');
    assert.equal(response.data.tags[0].assignmentCount, 0);
    assert.equal(response.data.tags.some((tag) => tag.id === retiredTagId), false);
}

function assertAssignResponse(response, assetId, userId) {
    assert.equal(response.status, 'ok');
    assert.equal(response.data.assetId, assetId);
    assert.equal(response.data.tags.length, 1);
    assert.equal(response.data.tags[0].sourceKind, 'manual');
    assert.equal(response.data.tags[0].sourceRecordId, userId);
}

function assertVocabularyDetailResponse(response, tagDefinitionId, expectedAliases) {
    assert.equal(response.status, 'ok');
    assert.equal(response.data.tag.id, tagDefinitionId);
    assert.deepEqual(response.data.aliases.map((alias) => alias.aliasLabel), expectedAliases);
}

test('tag commands list active vocabulary, assign and remove manual tags, and list pending review items', async () => {
    const harness = createHarness();

    try {
        const db = harness.dbManager.getDb();
        seedAsset(db, 'asset-1');
        seedAsset(db, 'asset-2');
        const { familyTagId, retiredTagId } = seedStandardTags(harness.repository);
        harness.repository.createReviewItem({
            id: 'review-1',
            reviewItemType: 'tag_proposal',
            subjectType: 'asset',
            subjectId: 'asset-1',
            payloadJson: JSON.stringify({ proposedLabel: 'kite flying' }),
            status: 'pending',
        });

        assertListAvailableTagsResponse(harness.runCommand('list_available_tags', {}, 'cmd-list-tags'), familyTagId, retiredTagId);
        assertAssignResponse(harness.runCommand('assign_asset_tag', { assetId: 'asset-1', tagDefinitionId: familyTagId, userId: 'user-1' }, 'cmd-assign-tag'), 'asset-1', 'user-1');

        const bulkAssignResponse = harness.runCommand('bulk_assign_asset_tag', { assetIds: ['asset-1', 'asset-2'], tagDefinitionId: familyTagId, userId: 'user-2' }, 'cmd-bulk-assign-tag');
        assert.equal(bulkAssignResponse.status, 'ok');
        assert.equal(bulkAssignResponse.data.updatedAssetIds.length, 2);

        const reviewResponse = harness.runCommand('list_review_items', { reviewItemType: 'tag_proposal', status: 'pending' }, 'cmd-list-reviews');
        assert.equal(reviewResponse.status, 'ok');
        assert.equal(reviewResponse.data.reviewItems.length, 1);
        assert.equal(reviewResponse.data.reviewItems[0].id, 'review-1');

        const removeResponse = harness.runCommand('remove_asset_tag', { assetId: 'asset-1', tagDefinitionId: familyTagId }, 'cmd-remove-tag');
        assert.equal(removeResponse.status, 'ok');
        assert.deepEqual(removeResponse.data.tags, []);
    } finally {
        harness.cleanup();
    }
});

test('set_review_item_status approves tag proposals into canonical tags and assigns them to the asset', async () => {
    const harness = createHarness();

    try {
        seedAsset(harness.dbManager.getDb(), 'asset-1');
        harness.repository.createReviewItem({
            id: 'review-tag-1',
            reviewItemType: 'tag_proposal',
            subjectType: 'asset',
            subjectId: 'asset-1',
            payloadJson: JSON.stringify({ proposedLabel: 'Kite Flying', sourceKind: 'ai' }),
            status: 'pending',
        });

        const approvalResponse = harness.runCommand('set_review_item_status', {
            reviewItemId: 'review-tag-1',
            status: 'approved',
            reviewerId: 'user-reviewer',
        }, 'cmd-approve-review');

        assert.equal(approvalResponse.status, 'ok');
        assert.equal(approvalResponse.data.reviewItem.status, 'approved');
        assert.ok(harness.repository.findTagDefinitionByLabel('kite flying'));

        const assignedTags = harness.repository.listTagsForAsset('asset-1');
        assert.equal(assignedTags.length, 1);
        assert.equal(assignedTags[0].canonicalLabel, 'Kite Flying');
        assert.equal(assignedTags[0].sourceKind, 'manual');
        assert.equal(assignedTags[0].sourceRecordId, 'user-reviewer');
    } finally {
        harness.cleanup();
    }
});

test('tag commands manage vocabulary details, aliases, renames, and merges', async () => {
    const harness = createHarness();

    try {
        const db = harness.dbManager.getDb();
        seedAsset(db, 'asset-1');
        seedAsset(db, 'asset-2');
        const familyTagId = harness.repository.createTagDefinition({
            id: 'tag-family',
            canonicalLabel: 'Family',
            status: 'active',
            category: 'people',
        });
        const affectionTagId = harness.repository.createTagDefinition({
            id: 'tag-affection',
            canonicalLabel: 'Affection',
            status: 'active',
            category: 'mood',
        });
        harness.repository.assignTagToAsset({ assetId: 'asset-1', tagDefinitionId: familyTagId, sourceKind: 'manual', sourceRecordId: 'user-1', confidence: null });
        harness.repository.assignTagToAsset({ assetId: 'asset-2', tagDefinitionId: affectionTagId, sourceKind: 'manual', sourceRecordId: 'user-2', confidence: null });

        const aliasResponse = harness.runCommand('create_tag_alias', { tagDefinitionId: familyTagId, aliasLabel: 'Household' }, 'cmd-create-alias');
        assertVocabularyDetailResponse(aliasResponse, familyTagId, ['Household']);
        const aliasId = aliasResponse.data.aliases[0].id;

        const detailResponse = harness.runCommand('get_tag_definition_detail', { tagDefinitionId: familyTagId }, 'cmd-get-tag-detail');
        assertVocabularyDetailResponse(detailResponse, familyTagId, ['Household']);
        assert.equal(detailResponse.data.tag.assignmentCount, 1);

        const renameResponse = harness.runCommand('rename_tag_definition', { tagDefinitionId: familyTagId, canonicalLabel: 'Family Life' }, 'cmd-rename-tag');
        assert.equal(renameResponse.status, 'ok');
        assert.equal(renameResponse.data.tag.canonicalLabel, 'Family Life');
        assert.equal(harness.repository.findTagDefinitionByLabel('family')?.id, familyTagId);

        const deleteAliasResponse = harness.runCommand('delete_tag_alias', { tagAliasId: aliasId }, 'cmd-delete-alias');
        assert.equal(deleteAliasResponse.status, 'ok');
        assert.equal(deleteAliasResponse.data.aliases.some((alias) => alias.id === aliasId), false);

        const mergeResponse = harness.runCommand('merge_tag_definitions', {
            sourceTagDefinitionId: familyTagId,
            targetTagDefinitionId: affectionTagId,
        }, 'cmd-merge-tags');

        assert.equal(mergeResponse.status, 'ok');
        assert.equal(mergeResponse.data.tag.id, affectionTagId);
        assert.equal(harness.repository.getTagDefinition(familyTagId), null);
        assert.equal(harness.repository.findTagDefinitionByLabel('family life')?.id, affectionTagId);
        assert.deepEqual(harness.repository.listAssetsForTag(affectionTagId).map((record) => record.assetId).sort(), ['asset-1', 'asset-2']);
    } finally {
        harness.cleanup();
    }
});
