const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { createPhotoMetadataRepository } = require('../../dist/core/src/services/photoMetadata/repository.js');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-date-module-'));
}

function createFixtureImage(rootDir, fileName = 'one.png') {
    const imagePath = path.join(rootDir, fileName);
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4jwQYcHIAu4cj3WS55GoAAAAASUVORK5CYII=',
        'base64',
    );
    fs.writeFileSync(imagePath, pngBytes);
    return imagePath;
}

function loadModuleWithStubs(stubs) {
    const modulePath = require.resolve('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/implementation.js');
    delete require.cache[modulePath];

    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (Object.hasOwn(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
    }
}

function createResolvedEstimate() {
    return {
        photoCreatedAt: '2001-01-02T03:04:05.000Z',
        range: {
            start: '2001-01-02T03:04:05.000Z',
            end: '2001-01-02T03:04:05.000Z',
        },
        confidence: {
            score: 0.42,
            reasons: ['stubbed'],
        },
    };
}

function createDateResolverStubs(dateResolverCalls, estimatePhotoDateCalls) {
    return {
        '../../../../photoMetadata/dateResolver': {
            resolvePhotoDateEvidence: (params) => {
                dateResolverCalls.push(params);
                return {
                    originalPath: 'C:/resolved/path.jpg',
                    fileBirthtime: '2001-01-01T00:00:00.000Z',
                    embeddedMetadata: {
                        derived: {
                            timestamp_candidates: [
                                { source: 'resolver', value: '2001-01-01T00:00:00.000Z' },
                            ],
                        },
                    },
                    aiMetadata: {
                        estimated_date: {
                            most_likely_date: '2001-01-01T00:00:00.000Z',
                            min_date: '2001-01-01T00:00:00.000Z',
                            max_date: '2001-01-01T00:00:00.000Z',
                            display_label: 'resolved date',
                            rationale: 'from resolver',
                        },
                    },
                };
            },
        },
        '../../../../photoDateEstimate': {
            estimatePhotoDate: (params) => {
                estimatePhotoDateCalls.push(params);
                return createResolvedEstimate();
            },
        },
    };
}

function seedDelegationFixture(dbManager, imagePath) {
    const db = dbManager.getDb();
    const repo = createPhotoMetadataRepository({ dbManager });
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at, photo_created_at, photo_created_at_confidence)
        VALUES ('asset-1', ?, NULL, 67, 1, 1, NULL, NULL, '2026-03-20T00:00:00.000Z', NULL, NULL)
    `).run(imagePath);
    repo.insertMetadataBlock({
        assetId: 'asset-1',
        sourceKind: 'gemini_flash_scout',
        provider: 'runtime_stub',
        modelVersion: '1.0',
        schemaVersion: 1,
        block: {
            type: 'photo',
            caption: 'Scout caption',
            description: 'Scout description',
            location: 'Unknown',
            estimated_date: {
                most_likely_date: '1967-01-01T00:00:00.000Z',
                min_date: '1967-01-01T00:00:00.000Z',
                max_date: '1967-12-31T23:59:59.999Z',
                display_label: '1967',
                rationale: 'scout evidence',
            },
            subjects: [],
            regions_of_interest: [],
            keywords: [],
            emotional_impact: '',
            quality: {
                technical: 0,
                lighting: 0,
                composition: 0,
                emotional: 0,
                discard: false,
            },
            recommended_enhancements: [],
            authenticity: {
                score: 0,
                reasons: [],
            },
        },
    });
    repo.insertManualAssertion({
        assetId: 'asset-1',
        fieldPath: 'estimated_date.most_likely_date',
        value: '1968-01-01T00:00:00.000Z',
        userId: 'user-1',
        note: 'family note',
    });
}

async function runDelegationScenario() {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir, 'family-1967-scan.png');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dateResolverCalls = [];
    const estimatePhotoDateCalls = [];
    const { createEstimatePhotoDateModule } = loadModuleWithStubs(createDateResolverStubs(dateResolverCalls, estimatePhotoDateCalls));

    let dbManager;
    try {
        dbManager = new DatabaseManager(tempDir);
        seedDelegationFixture(dbManager, imagePath);

        const moduleDefinition = createEstimatePhotoDateModule({ dbManager });
        const result = await moduleDefinition.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        return {
            result,
            imagePath,
            dateResolverCalls,
            estimatePhotoDateCalls,
            dbManager,
            tempDir,
        };
    } catch (error) {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw error;
    }
}

test('runtime.estimate_photo_date delegates evidence loading to the core date resolver', async () => {
    const scenario = await runDelegationScenario();

    try {
        assert.deepEqual(scenario.result.outputs, [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }]);
        assert.equal(scenario.dateResolverCalls.length, 1);
        assert.equal(scenario.estimatePhotoDateCalls.length, 1);
        assert.equal(scenario.dateResolverCalls[0].originalPath, scenario.imagePath);
        assert.equal(scenario.dateResolverCalls[0].metadataEvidence.machineBlocks.length, 1);
        assert.equal(scenario.dateResolverCalls[0].metadataEvidence.manualAssertions.length, 1);
        assert.equal(scenario.estimatePhotoDateCalls[0].originalPath, 'C:/resolved/path.jpg');
        assert.equal(scenario.estimatePhotoDateCalls[0].fileBirthtime, '2001-01-01T00:00:00.000Z');
        assert.deepEqual(scenario.estimatePhotoDateCalls[0].embeddedMetadata, {
            derived: {
                timestamp_candidates: [
                    { source: 'resolver', value: '2001-01-01T00:00:00.000Z' },
                ],
            },
        });
        assert.equal(scenario.estimatePhotoDateCalls[0].aiMetadata.estimated_date.display_label, 'resolved date');
    } finally {
        scenario.dbManager?.close();
        fs.rmSync(scenario.tempDir, { recursive: true, force: true });
    }
});

test('runtime.estimate_photo_date persists the resolved date back onto the asset', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir, 'family-1972-scan.png');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createEstimatePhotoDateModule } = loadModuleWithStubs({
        '../../../../photoMetadata/dateResolver': {
            resolvePhotoDateEvidence: (params) => ({
                originalPath: params.originalPath,
                fileBirthtime: '2002-02-03T04:05:06.000Z',
                embeddedMetadata: null,
                aiMetadata: {
                    estimated_date: {
                        most_likely_date: '2002-02-03T04:05:06.000Z',
                        min_date: '2002-02-03T04:05:06.000Z',
                        max_date: '2002-02-03T04:05:06.000Z',
                        display_label: 'resolved date',
                        rationale: null,
                    },
                },
            }),
        },
        '../../../../photoDateEstimate': {
            estimatePhotoDate: () => createResolvedEstimate(),
        },
    });
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at, photo_created_at, photo_created_at_confidence)
            VALUES ('asset-2', ?, NULL, 67, 1, 1, NULL, NULL, '2026-03-21T00:00:00.000Z', NULL, NULL)
        `).run(imagePath);

        const moduleDefinition = createEstimatePhotoDateModule({ dbManager });
        const result = await moduleDefinition.run({
            runId: 'run-2',
            subject: { subjectType: 'asset', subjectId: 'asset-2' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-2' }],
            parameters: {},
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }]);

        const assetRow = db.prepare(`
            SELECT created_at, photo_created_at, photo_created_at_confidence
            FROM assets
            WHERE id = 'asset-2'
        `).get();
        assert.equal(assetRow.created_at, '2026-03-21T00:00:00.000Z');
        assert.equal(assetRow.photo_created_at, '2001-01-02T03:04:05.000Z');
        assert.equal(assetRow.photo_created_at_confidence, 0.42);

        const estimateRow = db.prepare(`
            SELECT data
            FROM derived_results
            WHERE asset_id = 'asset-2' AND task = 'photo_date_estimate'
        `).get();
        assert.ok(estimateRow);
        const stored = JSON.parse(estimateRow.data);
        assert.equal(stored.photoCreatedAt, '2001-01-02T03:04:05.000Z');
        assert.equal(stored.confidence.score, 0.42);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime.estimate_photo_date only emits AssetUpdated when the resolved created date changes', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir, 'family-1972-scan.png');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const emittedEvents = [];
    const { createEstimatePhotoDateModule } = loadModuleWithStubs({
        '../../../../photoMetadata/dateResolver': {
            resolvePhotoDateEvidence: (params) => ({
                originalPath: params.originalPath,
                fileBirthtime: '2002-02-03T04:05:06.000Z',
                embeddedMetadata: null,
                aiMetadata: {
                    estimated_date: {
                        most_likely_date: '2002-02-03T04:05:06.000Z',
                        min_date: '2002-02-03T04:05:06.000Z',
                        max_date: '2002-02-03T04:05:06.000Z',
                        display_label: 'resolved date',
                        rationale: null,
                    },
                },
            }),
        },
        '../../../../photoDateEstimate': {
            estimatePhotoDate: () => createResolvedEstimate(),
        },
    });
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at, photo_created_at, photo_created_at_confidence)
            VALUES ('asset-3', ?, NULL, 67, 1, 1, NULL, NULL, '2026-03-21T00:00:00.000Z', '2001-01-02T03:04:05.000Z', 0.12)
        `).run(imagePath);

        const moduleDefinition = createEstimatePhotoDateModule({
            dbManager,
            eventBus: { emit(event) { emittedEvents.push(event); } },
        });

        await moduleDefinition.run({
            runId: 'run-3',
            subject: { subjectType: 'asset', subjectId: 'asset-3' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-3' }],
            parameters: {},
        });

        assert.deepEqual(emittedEvents, []);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
