const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-metadata-commands-'));
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

function seedAsset(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES (?, ?, ?)
    `).run('asset-1', 'family/billy-1968.jpg', '2026-03-27T10:00:00.000Z');
}

test('get_photo_metadata returns projection plus raw evidence for one asset', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);
        db.prepare(`
            INSERT INTO photo_metadata_blocks (
                id, asset_id, source_kind, provider, model_version, schema_version, data, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'block-1',
            'asset-1',
            'gemini_flash_scout',
            'google',
            'gemini-2.5-flash',
            1,
            JSON.stringify({
                type: 'portrait',
                caption: 'Billy at Christmas dinner',
                description: 'Billy and Dad at the table.',
                location: 'Blackpool',
                estimated_date: {
                    most_likely_date: '1968-12-25T00:00:00Z',
                    min_date: '1968-01-01T00:00:00Z',
                    max_date: '1968-12-31T23:59:59.999Z',
                    display_label: 'late 1968',
                    rationale: 'Holiday decorations and filename suggest late 1968.',
                },
                subjects: [],
                regions_of_interest: [],
                keywords: ['family', 'christmas'],
                emotional_impact: 'warm',
                quality: {
                    technical: 4,
                    lighting: 4,
                    composition: 3,
                    emotional: 5,
                    discard: false,
                },
                recommended_enhancements: ['crop tighter'],
                authenticity: {
                    score: 0.88,
                    reasons: ['family archive context'],
                },
            }),
            '2026-03-27T10:05:00.000Z',
        );
        db.prepare(`
            INSERT INTO photo_metadata_projection (
                asset_id, type, type_source_kind, type_source_id, caption, caption_source_kind, caption_source_id,
                description, description_source_kind, description_source_id, location, location_source_kind, location_source_id,
                estimated_date_display_label, estimated_date_source_kind, estimated_date_source_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'asset-1',
            'portrait', 'gemini_flash_scout', 'block-1',
            'Billy at Christmas dinner', 'gemini_flash_scout', 'block-1',
            'Billy and Dad at the table.', 'gemini_flash_scout', 'block-1',
            'Blackpool', 'gemini_flash_scout', 'block-1',
            'late 1968', 'gemini_flash_scout', 'block-1',
        );

        handleSystemCommand({
            id: 'cmd-photo-metadata',
            command: 'get_photo_metadata',
            payload: { assetId: 'asset-1', includeEvidence: true },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.photo_metadata.projection.caption, 'Billy at Christmas dinner');
        assert.equal(response.data.photo_metadata.evidence.machineBlocks.length, 1);
        assert.deepEqual(response.data.photo_metadata.evidence.manualAssertions, []);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('photo metadata boundary actions fetch evidence, submit manual assertions, and start selected-photo refinement', async () => {
    const requests = [];
    const { createPhotoMetadataActions } = await import('../../src/boundary/runtime/photoMetadataActions.ts');

    const actions = createPhotoMetadataActions({
        request: async (args) => {
            requests.push(args);

            if (args.command === 'get_photo_metadata') {
                return args.select({
                    photo_metadata: {
                        projection: { assetId: 'asset-1', caption: 'Billy and Dad enjoying Christmas dinner' },
                        evidence: { machineBlocks: [], manualAssertions: [] },
                    },
                });
            }

            if (args.command === 'start_selected_subject_metadata_workflow') {
                return args.select({ runId: 'run-refine-1' });
            }

            if (args.command === 'start_library_photo_date_workflow') {
                return args.select({ runId: 'run-photo-date-1' });
            }

            return args.select({
                manualAssertion: { id: 'assertion-1', user_id: 'user-father-in-law' },
                photo_metadata: {
                    projection: { assetId: 'asset-1', caption: 'Billy and Dad enjoying Christmas dinner' },
                },
            });
        },
    });

    const photoMetadata = await actions.getPhotoMetadata('asset-1');
    const assertionResult = await actions.recordPhotoMetadataAssertion({
        assetId: 'asset-1',
        fieldPath: 'caption',
        value: 'Billy and Dad enjoying Christmas dinner',
        userId: 'user-father-in-law',
        note: 'Confirmed from family memory.',
    });
    const runId = await actions.refinePhotoMetadata('asset-1');
    const photoDateRunId = await actions.recalculatePhotoDate('asset-1');

    assert.equal(photoMetadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(assertionResult.manualAssertion.user_id, 'user-father-in-law');
    assert.equal(requests[1].command, 'record_photo_metadata_assertion');
    assert.equal(requests[1].payload.userId, 'user-father-in-law');
    assert.equal(requests.at(-2).command, 'start_selected_subject_metadata_workflow');
    assert.deepEqual(requests.at(-2).payload.selectedSubjects, [{ subjectType: 'asset', subjectId: 'asset-1' }]);
    assert.equal(requests.at(-1).command, 'start_library_photo_date_workflow');
    assert.deepEqual(requests.at(-1).payload, { mediaId: 'asset-1' });
    assert.equal(runId, 'run-refine-1');
    assert.equal(photoDateRunId, 'run-photo-date-1');
});
