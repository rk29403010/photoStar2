const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { v4: uuidv4 } = require('uuid');
const {
    createTempDir,
    seedAsset,
    seedSimilarityGroup,
} = require('./workflow-runtime-grouping.helpers.cjs');

function createCollector() {
    const responses = [];
    return {
        responses,
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
    };
}

function seedOrbitAssets(dbManager, assetIds) {
    seedAsset(dbManager, {
        id: assetIds.variantCanonicalAssetId,
        originalPath: 'C:/photos/variant-a.jpg',
        fileHash: 'variant-a',
        fileSize: 3000,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:00.000Z',
    });
    seedAsset(dbManager, {
        id: assetIds.variantMemberAssetId,
        originalPath: 'C:/photos/variant-b.jpg',
        fileHash: 'variant-b',
        fileSize: 2800,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:01.000Z',
    });
    seedAsset(dbManager, {
        id: assetIds.passthroughAssetId,
        originalPath: 'C:/photos/burst-c.jpg',
        fileHash: 'burst-c',
        fileSize: 2600,
        width: 1200,
        height: 900,
        exifDate: '2026-01-01T12:00:02.000Z',
    });
}

function seedOrbitGroups(dbManager, groupIds, assetIds) {
    const db = dbManager.getDb();

    seedSimilarityGroup(dbManager, {
        groupId: groupIds.variantGroupId,
        type: 'variant_set',
        status: 'confirmed',
        canonicalAssetId: assetIds.variantCanonicalAssetId,
        assetIds: [assetIds.variantCanonicalAssetId, assetIds.variantMemberAssetId],
        paramsJson: { threshold: 10 },
    });
    seedSimilarityGroup(dbManager, {
        groupId: groupIds.burstGroupId,
        type: 'burst',
        status: 'confirmed',
        canonicalAssetId: assetIds.variantCanonicalAssetId,
        assetIds: [assetIds.passthroughAssetId],
        paramsJson: { maxSeconds: 5 },
    });
    db.prepare(`
        INSERT INTO asset_group_children (parent_group_id, child_group_id, rank)
        VALUES (?, ?, 0)
    `).run(groupIds.burstGroupId, groupIds.variantGroupId);
}

function seedOrbitProjection(dbManager, assetId) {
    const db = dbManager.getDb();
    db.prepare(`
        INSERT INTO photo_metadata_projection (
            asset_id,
            type, type_source_kind, type_source_id,
            caption, caption_source_kind, caption_source_id,
            description, description_source_kind, description_source_id,
            location, location_source_kind, location_source_id,
            estimated_date_most_likely, estimated_date_min, estimated_date_max,
            estimated_date_display_label, estimated_date_rationale,
            estimated_date_source_kind, estimated_date_source_id,
            keywords_json, keywords_source_kind, keywords_source_id,
            emotional_impact, emotional_impact_source_kind, emotional_impact_source_id,
            quality_technical, quality_lighting, quality_composition, quality_emotional, quality_discard,
            quality_source_kind, quality_source_id,
            recommended_enhancements_json, recommended_enhancements_source_kind, recommended_enhancements_source_id,
            authenticity_score, authenticity_reasons_json, authenticity_source_kind, authenticity_source_id,
            subjects_json, subjects_source_kind, subjects_source_id,
            regions_of_interest_json, regions_of_interest_source_kind, regions_of_interest_source_id
        ) VALUES (
            ?, 'portrait', 'manual_user', 'type-1',
            'Variant caption', 'gemini_pro_refined', 'caption-1',
            'Variant description', 'gemini_pro_refined', 'desc-1',
            'Blackpool', 'manual_user', 'loc-1',
            '1970-01-01', '1969-01-01', '1971-01-01',
            'circa 1970', 'Archive context', 'gemini_pro_refined', 'date-1',
            '["family","dog"]', 'gemini_flash_scout', 'keywords-1',
            'warm', 'manual_user', 'impact-1',
            4, 3, 5, 4, 0,
            'gemini_pro_refined', 'quality-1',
            '["straighten"]', 'gemini_pro_refined', 'enhancement-1',
            0.9, '["album context"]', 'manual_user', 'auth-1',
            '[{"kind":"person","label":"Kathleen","bounding_box":{"x":0.1,"y":0.2,"width":0.3,"height":0.4}}]', 'manual_user', 'subject-1',
            '[{"kind":"object","label":"Dog","bounding_box":{"x":0.4,"y":0.3,"width":0.2,"height":0.2},"significance":"Foreground subject"}]', 'gemini_flash_scout', 'roi-1'
        )
    `).run(assetId);
}

function seedOrbitHierarchy(dbManager) {
    const groupIds = {
        burstGroupId: uuidv4(),
        variantGroupId: uuidv4(),
    };
    const assetIds = {
        variantCanonicalAssetId: uuidv4(),
        variantMemberAssetId: uuidv4(),
        passthroughAssetId: uuidv4(),
    };

    seedOrbitAssets(dbManager, assetIds);
    seedOrbitGroups(dbManager, groupIds, assetIds);
    seedOrbitProjection(dbManager, assetIds.variantCanonicalAssetId);

    return {
        ...groupIds,
        ...assetIds,
    };
}

test('get_group_orbit returns direct child groups and passthrough assets for hierarchy-aware filmstrips', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { collectionCommandHandlers } = await import('../../dist/core/src/services/handlers/collectionCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createCollector();
    try {
        const {
            burstGroupId,
            variantGroupId,
            variantCanonicalAssetId,
            passthroughAssetId,
        } = seedOrbitHierarchy(dbManager);

        collectionCommandHandlers.get_group_orbit({
            id: 'orbit-1',
            payload: { groupId: burstGroupId },
            originWs: null,
            dbManager,
            respond: collector.respond,
        });

        const [{ status, data }] = collector.responses;
        assert.equal(status, 'ok');
        assert.equal(data.orbit.group_id, burstGroupId);
        assert.equal(data.orbit.group_type, 'burst');
        assert.equal(data.orbit.parent_group_id, null);
        assert.equal(data.orbit.items.length, 2);
        assert.deepEqual(
            data.orbit.items.map((item) => [item.kind, item.group_id, item.asset.id]),
            [
                ['group', variantGroupId, variantCanonicalAssetId],
                ['asset', burstGroupId, passthroughAssetId],
            ],
        );
        assert.equal(data.orbit.items[0].stack_count, 2);
        assert.equal(data.orbit.items[1].stack_count, 3);
        assert.deepEqual(
            data.orbit.items[0].asset.group_memberships.map((membership) => membership.group_id).sort(),
            [variantGroupId, burstGroupId].sort(),
        );
        assert.equal(data.orbit.items[0].asset.photo_metadata.projection.caption, 'Variant caption');
        assert.equal(data.orbit.items[0].asset.photo_metadata.projection.type, 'portrait');
        assert.equal(data.orbit.items[0].asset.photo_metadata.projection.location, 'Blackpool');
        assert.equal(data.orbit.items[0].asset.photo_metadata.projection.estimatedDate.display_label, 'circa 1970');
        assert.deepEqual(data.orbit.items[0].asset.photo_metadata.projection.keywords, ['family', 'dog']);
        assert.equal(data.orbit.items[0].asset.photo_metadata.provenance.caption.sourceKind, 'gemini_pro_refined');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
