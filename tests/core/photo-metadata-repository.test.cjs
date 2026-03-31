const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-photo-metadata-repo-'));
}

function createDatabaseManager(storagePath) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    return new DatabaseManager(storagePath);
}

function seedAsset(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES ('asset-1', 'C:/photos/family-1968.jpg', '2026-03-27T09:00:00.000Z')
    `).run();
}

function buildMetadataBlock() {
    return {
        type: 'Family portrait',
        caption: 'Billy and Dad at Christmas',
        description: 'A warm family Christmas dinner with Billy and Dad at the table.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: '1968-12-25T00:00:00Z',
            min_date: '1968-01-01T00:00:00Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late 1968',
            rationale: 'Filename and clothing suggest late 1968.',
        },
        subjects: [],
        regions_of_interest: [],
        keywords: ['Christmas', 'family'],
        emotional_impact: 'Warm and celebratory',
        quality: { technical: 4, lighting: 4, composition: 3, emotional: 5, discard: false },
        recommended_enhancements: ['Crop tighter'],
        authenticity: { score: 0.88, reasons: ['family context'] },
    };
}

function buildProjection(blockId, assertionId) {
    return {
        assetId: 'asset-1',
        type: 'Family portrait',
        caption: 'Billy and Dad enjoying Christmas dinner',
        description: 'A family Christmas dinner scene with Billy and Dad.',
        location: 'Unknown',
        estimatedDate: {
            most_likely_date: '1968-12-25T00:00:00Z',
            min_date: '1968-01-01T00:00:00Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late 1968',
            rationale: 'Manual and machine evidence agree.',
        },
        keywords: ['Christmas', 'family'],
        emotionalImpact: 'Warm and celebratory',
        quality: { technical: 4, lighting: 4, composition: 3, emotional: 5, discard: false },
        recommendedEnhancements: ['Crop tighter'],
        authenticity: { score: 0.88, reasons: ['family context'] },
        provenance: {
            type: { sourceKind: 'gemini_flash_scout', sourceId: blockId },
            caption: { sourceKind: 'manual', sourceId: assertionId },
            description: { sourceKind: 'gemini_flash_scout', sourceId: blockId },
            location: { sourceKind: 'gemini_flash_scout', sourceId: blockId },
            estimatedDate: { sourceKind: 'gemini_flash_scout', sourceId: blockId },
        },
    };
}

function buildUpdatedProjection(blockId, assertionId) {
    return {
        assetId: 'asset-1',
        type: 'Group portrait',
        caption: 'Billy and Dad at the Christmas table',
        description: 'A revised description after manual confirmation.',
        location: 'Liverpool',
        estimatedDate: {
            most_likely_date: '1968-12-24T00:00:00Z',
            min_date: '1968-12-01T00:00:00Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late December 1968',
            rationale: 'Manual follow-up narrowed the date.',
        },
        keywords: ['Christmas', 'family', 'table'],
        emotionalImpact: 'Warm and reflective',
        quality: { technical: 5, lighting: 4, composition: 4, emotional: 5, discard: false },
        recommendedEnhancements: ['Keep full frame'],
        authenticity: { score: 0.93, reasons: ['manual confirmation'] },
        provenance: {
            type: { sourceKind: 'manual', sourceId: assertionId },
            caption: { sourceKind: 'manual', sourceId: assertionId },
            description: { sourceKind: 'manual', sourceId: assertionId },
            location: { sourceKind: 'manual', sourceId: assertionId },
            estimatedDate: { sourceKind: 'manual', sourceId: assertionId },
        },
    };
}

function assertBlockRows(checks, blocks, blockId) {
    checks.equal(blocks.length, 1);
    checks.equal(blocks[0].id, blockId);
    checks.equal(blocks[0].source_kind, 'gemini_flash_scout');
    checks.equal(blocks[0].provider, 'google');
    checks.equal(blocks[0].model_version, 'gemini-2.5-flash-preview');
    checks.equal(blocks[0].schema_version, 1);
    checks.equal(blocks[0].data.caption, 'Billy and Dad at Christmas');
}

function assertAssertionRows(checks, assertions, assertionId) {
    checks.equal(assertions.length, 1);
    checks.equal(assertions[0].id, assertionId);
    checks.equal(assertions[0].field_path, 'caption');
    checks.equal(assertions[0].value, 'Billy and Dad enjoying Christmas dinner');
    checks.equal(assertions[0].user_id, 'user-7');
    checks.equal(assertions[0].note, 'Dad confirmed this at the scan table.');
}

function assertUpdatedProjectionRow(checks, projection, assertionId) {
    checks.ok(projection);
    checks.equal(projection.caption, 'Billy and Dad at the Christmas table');
    checks.equal(projection.type, 'Group portrait');
    checks.equal(projection.location, 'Liverpool');
    checks.equal(projection.caption_source_kind, 'manual');
    checks.equal(projection.caption_source_id, assertionId);
    checks.equal(projection.estimated_date_display_label, 'late December 1968');
    checks.equal(projection.estimated_date_source_kind, 'manual');
    checks.equal(projection.estimated_date_source_id, assertionId);
    checks.equal(projection.authenticity_score, 0.93);
}

test('photo metadata repository persists blocks, assertions, and projection rows', async () => {
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const tempDir = createTempDir();
    const dbManager = createDatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);

        const repository = createPhotoMetadataRepository({ dbManager });

        const blockId = repository.insertMetadataBlock({
            assetId: 'asset-1',
            sourceKind: 'gemini_flash_scout',
            provider: 'google',
            modelVersion: 'gemini-2.5-flash-preview',
            schemaVersion: 1,
            block: buildMetadataBlock(),
        });

        const assertionId = repository.insertManualAssertion({
            assetId: 'asset-1',
            fieldPath: 'caption',
            value: 'Billy and Dad enjoying Christmas dinner',
            userId: 'user-7',
            note: 'Dad confirmed this at the scan table.',
        });

        repository.saveProjection(buildProjection(blockId, assertionId));
        repository.saveProjection(buildUpdatedProjection(blockId, assertionId));

        const blocks = repository.listBlocksForAsset('asset-1');
        const assertions = repository.listAssertionsForAsset('asset-1');
        const projection = repository.loadProjection('asset-1');
        const projectionCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM photo_metadata_projection
            WHERE asset_id = 'asset-1'
        `).get();

        assertBlockRows(assert, blocks, blockId);
        assertAssertionRows(assert, assertions, assertionId);
        assert.equal(projectionCount.count, 1);
        assertUpdatedProjectionRow(assert, projection, assertionId);

        repository.saveProjection({
            ...buildProjection(blockId, assertionId),
            estimatedDate: {
                ...buildProjection(blockId, assertionId).estimatedDate,
                min_date: 'not-a-date',
            },
        });

        const normalizedProjection = repository.loadProjection('asset-1');
        assert.ok(normalizedProjection);
        assert.equal(normalizedProjection.estimated_date_min, null);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('photo metadata repository stores coarse projection date hints without failing persistence', async () => {
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const tempDir = createTempDir();
    const dbManager = createDatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);
        const repository = createPhotoMetadataRepository({ dbManager });

        repository.saveProjection({
            assetId: 'asset-1',
            type: 'Birthday party',
            caption: 'A child celebrates a birthday',
            description: 'A family gathers around a birthday cake.',
            location: 'Unknown',
            estimatedDate: {
                most_likely_date: '1970s',
                min_date: '1974',
                max_date: null,
                display_label: 'mid 1970s',
                rationale: 'Decorations and clothing suggest the middle of the decade.',
            },
            keywords: ['birthday', 'family'],
            emotionalImpact: 'Joyful',
            quality: { technical: 6, lighting: 6, composition: 6, emotional: 8, discard: false },
            recommendedEnhancements: [],
            authenticity: { score: 0.75, reasons: ['consistent scene details'] },
            provenance: {},
        });

        const projection = repository.loadProjection('asset-1');
        assert.ok(projection);
        assert.equal(projection.estimated_date_most_likely, null);
        assert.equal(projection.estimated_date_min, null);
        assert.equal(projection.estimated_date_max, null);
        assert.equal(projection.estimated_date_display_label, 'mid 1970s');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('photo metadata repository accepts coarse manual date assertions', async () => {
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const tempDir = createTempDir();
    const dbManager = createDatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);
        const repository = createPhotoMetadataRepository({ dbManager });

        const assertionId = repository.insertManualAssertion({
            assetId: 'asset-1',
            fieldPath: 'estimated_date.most_likely_date',
            value: 'late 1970s',
            userId: 'user-9',
        });

        const assertions = repository.listAssertionsForAsset('asset-1');
        assert.equal(assertionId.length > 0, true);
        assert.equal(assertions.length, 1);
        assert.equal(assertions[0].field_path, 'estimated_date.most_likely_date');
        assert.equal(assertions[0].value, 'late 1970s');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('database startup backfills legacy stored coordinate payloads into canonical normalized boxes', async () => {
    const tempDir = createTempDir();
    const dbManager = createDatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('face-detect-1', 'asset-1', 'face_detection', 'onnx_retina_10g', '1.0', ?)
        `).run(JSON.stringify({
            faces: [{
                id: 'face-1',
                box: [0.1, 0.2, 0.5, 0.7],
                score: 0.91,
                landmarks: [],
            }],
        }));
        db.prepare(`
            INSERT INTO photo_metadata_blocks (id, asset_id, source_kind, provider, model_version, schema_version, data)
            VALUES ('block-1', 'asset-1', 'gemini_flash_scout', 'google', 'gemini-2.5-flash-preview', 1, ?)
        `).run(JSON.stringify({
            ...buildMetadataBlock(),
            subjects: [{
                label: 'Subject1',
                bounding_box: { x: 700, y: 140, width: 180, height: 320 },
                type: 'person',
                location_desc: 'centre',
                gender: null,
                animal_type: null,
                age_range: null,
                dob_range: null,
                emotion: null,
                gaze: null,
                features: null,
                uniform: null,
                suggested_names: [],
            }],
            regions_of_interest: [{
                label: 'Badge',
                kind: 'clothing',
                bounding_box: { x: 250, y: 500, width: 120, height: 110 },
                significance: null,
            }],
        }));
        db.prepare(`
            INSERT INTO photo_metadata_projection (
                asset_id, subjects_json, regions_of_interest_json, created_at, updated_at
            ) VALUES (
                'asset-1', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        `).run(
            JSON.stringify([{ label: 'Subject1', bounding_box: { x: 700, y: 140, width: 180, height: 320 } }]),
            JSON.stringify([{ label: 'Badge', kind: 'clothing', bounding_box: { x: 250, y: 500, width: 120, height: 110 } }]),
        );

        dbManager.close();

        const reopened = createDatabaseManager(tempDir);
        try {
            const reopenedDb = reopened.getDb();
            const detectionRow = reopenedDb.prepare(`
                SELECT data FROM derived_results WHERE id = 'face-detect-1'
            `).get();
            const migratedBlockRow = reopenedDb.prepare(`
                SELECT data FROM photo_metadata_blocks WHERE id = 'block-1'
            `).get();
            const migratedProjectionRow = reopenedDb.prepare(`
                SELECT subjects_json, regions_of_interest_json
                FROM photo_metadata_projection
                WHERE asset_id = 'asset-1'
            `).get();

            assert.deepEqual(JSON.parse(detectionRow.data).faces[0].box, { x: 0.1, y: 0.2, width: 0.4, height: 0.5 });
            assert.deepEqual(JSON.parse(migratedBlockRow.data).subjects[0].bounding_box, { x: 0.7, y: 0.14, width: 0.18, height: 0.32 });
            assert.deepEqual(JSON.parse(migratedBlockRow.data).regions_of_interest[0].bounding_box, { x: 0.25, y: 0.5, width: 0.12, height: 0.11 });
            assert.deepEqual(JSON.parse(migratedProjectionRow.subjects_json)[0].bounding_box, { x: 0.7, y: 0.14, width: 0.18, height: 0.32 });
            assert.deepEqual(JSON.parse(migratedProjectionRow.regions_of_interest_json)[0].bounding_box, { x: 0.25, y: 0.5, width: 0.12, height: 0.11 });
        } finally {
            reopened.close();
        }
    } finally {
        try {
            dbManager.close();
        } catch {
            // already closed
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
