const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-asset-metadata-projection-'));
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

function seedAssetWithProjection(db, options = {}) {
    const machineBlob = options.machineBlob || '{"caption":"Legacy blob caption","description":"Legacy blob description"}';

    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES ('asset-1', 'C:/photos/one.jpg', '2026-03-23T09:00:00.000Z')
    `).run();

    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at)
        VALUES ('ai-legacy', 'asset-1', 'ai_metadata', 'google', 'gemini-legacy', ?, '2026-03-23T09:00:00.000Z')
    `).run(machineBlob);

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
            'asset-1',
            'portrait', 'manual_user', 'type-1',
            'Billy and Dad enjoying Christmas dinner', 'gemini_pro_refined', 'block-pro-1',
            'A warm family Christmas dinner at the table.', 'manual_user', 'assertion-desc-1',
            'Blackpool', 'manual_user', 'assertion-loc-1',
            '1968-12-25', '1968-12-01', '1968-12-31',
            'late 1968', 'Christmas dinner context and filename hints.', 'gemini_pro_refined', 'block-pro-1',
            '["family","christmas"]', 'gemini_flash_scout', 'block-scout-1',
            'warm', 'manual_user', 'assertion-impact-1',
            4, 3, 5, 4, 0,
            'gemini_pro_refined', 'block-pro-1',
            '["straighten","warmth boost"]', 'gemini_pro_refined', 'block-pro-1',
            0.95, '["filename matches family archive"]', 'manual_user', 'assertion-auth-1',
            '[{"kind":"person","label":"Billy","bounding_box":{"x":0.1,"y":0.2,"width":0.2,"height":0.2}}]', 'manual_user', 'assertion-subjects-1',
            '[{"kind":"face","label":"Face","significance":null,"bounding_box":{"x":0.1,"y":0.2,"width":0.2,"height":0.2}}]', 'gemini_flash_scout', 'block-scout-1'
        )
    `).run();
}

async function runHandler(command, payload, tempDir, dbManager, collector) {
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    handleSystemCommand({
        id: `cmd-${command}`,
        command,
        payload,
        dbManager,
        eventBus: { emit() {} },
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: collector.respond,
    });
    return collector.takeLast();
}

test('get_asset_detail prefers projection fields and skips parsing legacy machine blobs', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;
    let parseCount = 0;
    const originalJsonParse = JSON.parse;
    const sentinel = '{"caption":"Legacy blob caption","description":"Legacy blob description"}';

    try {
        JSON.parse = (value, ...rest) => {
            if (value === sentinel) {
                parseCount += 1;
            }
            return originalJsonParse.call(JSON, value, ...rest);
        };

        dbManager = new DatabaseManager(tempDir);
        seedAssetWithProjection(dbManager.getDb(), { machineBlob: sentinel });

        const response = await runHandler('get_asset_detail', { assetId: 'asset-1' }, tempDir, dbManager, collector);

        assert.equal(response.status, 'ok');
        assert.equal(parseCount, 0);
        assert.equal(response.data.asset.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.equal(response.data.asset.ai_metadata, undefined);
        assert.equal(response.data.asset.photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.equal(response.data.asset.photo_metadata.projection.description, 'A warm family Christmas dinner at the table.');
        assert.equal(response.data.asset.photo_metadata.projection.location, 'Blackpool');
        assert.equal(response.data.asset.photo_metadata.projection.estimatedDate.display_label, 'late 1968');
        assert.equal(response.data.asset.photo_metadata.projection.type, 'portrait');
        assert.deepEqual(response.data.asset.photo_metadata.projection.keywords, ['family', 'christmas']);
        assert.equal(response.data.asset.photo_metadata.projection.emotionalImpact, 'warm');
        assert.deepEqual(response.data.asset.photo_metadata.projection.quality, { technical: 4, lighting: 3, composition: 5, emotional: 4, discard: false });
        assert.deepEqual(response.data.asset.photo_metadata.projection.recommendedEnhancements, ['straighten', 'warmth boost']);
        assert.equal(response.data.asset.photo_metadata.projection.authenticity.score, 0.95);
        assert.deepEqual(response.data.asset.photo_metadata.projection.subjects, [{
            kind: 'person',
            label: 'Billy',
            bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        }]);
        assert.deepEqual(response.data.asset.photo_metadata.projection.regionsOfInterest, [{
            kind: 'face',
            label: 'Face',
            significance: null,
            bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        }]);
        assert.equal(response.data.asset.photo_metadata.provenance.caption.sourceKind, 'gemini_pro_refined');
        assert.equal(response.data.asset.photo_metadata.provenance.type.sourceKind, 'manual_user');
        assert.equal(response.data.asset.photo_metadata.provenance.keywords.sourceKind, 'gemini_flash_scout');
        assert.equal(response.data.asset.photo_metadata.provenance.quality.sourceId, 'block-pro-1');
        assert.equal(response.data.asset.photo_metadata.provenance.description.sourceKind, 'manual_user');
        assert.equal(response.data.asset.photo_metadata.provenance.location.sourceId, 'assertion-loc-1');
        assert.equal(response.data.asset.photo_metadata.provenance.estimatedDate.sourceKind, 'gemini_pro_refined');
        assert.equal(response.data.asset.photo_metadata.evidence, undefined);
    } finally {
        JSON.parse = originalJsonParse;
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets gallery results prefer projection fields and skip parsing legacy machine blobs', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;
    let parseCount = 0;
    const originalJsonParse = JSON.parse;
    const sentinel = '{"caption":"Legacy blob caption","description":"Legacy blob description"}';

    try {
        JSON.parse = (value, ...rest) => {
            if (value === sentinel) {
                parseCount += 1;
            }
            return originalJsonParse.call(JSON, value, ...rest);
        };

        dbManager = new DatabaseManager(tempDir);
        seedAssetWithProjection(dbManager.getDb(), { machineBlob: sentinel });

        const response = await runHandler('get_assets', {
            limit: 10,
            offset: 0,
            detailLevel: 'gallery',
            withGroupCounts: false,
        }, tempDir, dbManager, collector);

        assert.equal(response.status, 'ok');
        assert.equal(parseCount, 0);
        assert.equal(response.data.assets.length, 1);
        assert.equal(response.data.assets[0].caption, 'Billy and Dad enjoying Christmas dinner');
        assert.equal(response.data.assets[0].ai_metadata, undefined);
        assert.equal(response.data.assets[0].photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
        assert.equal(response.data.assets[0].photo_metadata.projection.description, 'A warm family Christmas dinner at the table.');
        assert.equal(response.data.assets[0].photo_metadata.projection.location, 'Blackpool');
        assert.equal(response.data.assets[0].photo_metadata.projection.estimatedDate.display_label, 'late 1968');
        assert.equal(response.data.assets[0].photo_metadata.projection.type, 'portrait');
        assert.deepEqual(response.data.assets[0].photo_metadata.projection.keywords, ['family', 'christmas']);
        assert.equal(response.data.assets[0].photo_metadata.projection.emotionalImpact, 'warm');
        assert.deepEqual(response.data.assets[0].photo_metadata.projection.quality, { technical: 4, lighting: 3, composition: 5, emotional: 4, discard: false });
        assert.deepEqual(response.data.assets[0].photo_metadata.projection.recommendedEnhancements, ['straighten', 'warmth boost']);
        assert.equal(response.data.assets[0].photo_metadata.projection.authenticity.score, 0.95);
        assert.deepEqual(response.data.assets[0].photo_metadata.projection.subjects, [{
            kind: 'person',
            label: 'Billy',
            bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        }]);
        assert.deepEqual(response.data.assets[0].photo_metadata.projection.regionsOfInterest, [{
            kind: 'face',
            label: 'Face',
            significance: null,
            bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        }]);
        assert.equal(response.data.assets[0].photo_metadata.provenance.caption.sourceKind, 'gemini_pro_refined');
        assert.equal(response.data.assets[0].photo_metadata.provenance.type.sourceKind, 'manual_user');
        assert.equal(response.data.assets[0].photo_metadata.provenance.keywords.sourceKind, 'gemini_flash_scout');
        assert.equal(response.data.assets[0].photo_metadata.provenance.quality.sourceId, 'block-pro-1');
        assert.equal(response.data.assets[0].photo_metadata.evidence, undefined);
    } finally {
        JSON.parse = originalJsonParse;
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
