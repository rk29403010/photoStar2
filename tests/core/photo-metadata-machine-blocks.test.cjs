const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Mock keytar for test execution
require.cache[require.resolve('keytar')] = {
    id: require.resolve('keytar'),
    filename: require.resolve('keytar'),
    loaded: true,
    exports: {
        getPassword: async () => 'AIzaSyDUMMYKEY12345678901234567890',
        setPassword: async () => {},
        deletePassword: async () => true,
    }
};

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-machine-blocks-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 4) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
    }
}

async function createImage(tempDir) {
    const sharp = (await import('sharp')).default;
    const imagePath = path.join(tempDir, 'photo.png');
    await sharp({
        create: {
            width: 160,
            height: 120,
            channels: 3,
            background: { r: 80, g: 110, b: 140 },
        },
    }).png().toFile(imagePath);
    return imagePath;
}

async function createLargeImage(tempDir) {
    const sharp = (await import('sharp')).default;
    const imagePath = path.join(tempDir, 'large-photo.png');
    await sharp({
        create: {
            width: 2000,
            height: 1200,
            channels: 3,
            background: { r: 80, g: 110, b: 140 },
        },
    }).png().toFile(imagePath);
    return imagePath;
}

function seedAsset(db, imagePath, dimensions = { width: null, height: null }) {
    db.prepare(`
        INSERT INTO assets (id, original_path, width, height, created_at)
        VALUES ('asset-1', ?, ?, ?, '2026-03-27T09:00:00.000Z')
    `).run(imagePath, dimensions.width, dimensions.height);
}

function buildGeminiResponse(overrides = {}) {
    return {
        type: 'Family portrait',
        caption: 'Billy and Dad at Christmas',
        description: 'Billy and Dad are seated together at a Christmas dinner table.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: '1968-12-25T00:00:00Z',
            min_date: '1968-01-01T00:00:00Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late 1968',
            rationale: 'Filename and clothing suggest late 1968.',
        },
        subjects: [
            {
                label: 'Subject1',
                bounding_box: { x: 10, y: 20, width: 100, height: 120 },
                type: 'person',
                location_desc: 'centre',
                gender: 'male',
                animal_type: null,
                age_range: 'adult',
                dob_range: '1930s',
                emotion: 'neutral',
                gaze: 'towards camera',
                features: 'dark jacket',
                uniform: null,
                suggested_names: ['Billy'],
            },
        ],
        regions_of_interest: [
            {
                label: 'Dinner table',
                kind: 'scene_context',
                bounding_box: { x: 30, y: 40, width: 60, height: 40 },
                significance: 'family meal evidence',
            },
        ],
        keywords: ['family', 'Christmas'],
        emotional_impact: 'Warm and celebratory',
        quality: {
            technical: 7,
            lighting: 7,
            composition: 6,
            emotional: 8,
            discard: false,
        },
        recommended_enhancements: ['Crop tighter'],
        authenticity: {
            score: 0.88,
            reasons: ['family context'],
        },
        ...overrides,
    };
}

function buildPixelSpaceGeminiResponse() {
    return buildGeminiResponse({
        subjects: [{
            label: 'Subject1',
            bounding_box: { x: 1200, y: 120, width: 500, height: 360 },
            type: 'person',
            location_desc: 'centre',
            gender: 'male',
            animal_type: null,
            age_range: 'adult',
            dob_range: '1930s',
            emotion: 'neutral',
            gaze: 'towards camera',
            features: 'dark jacket',
            uniform: null,
            suggested_names: ['Billy'],
        }],
        regions_of_interest: [{
            label: 'Dinner table',
            kind: 'scene_context',
            bounding_box: { x: 1000, y: 0, width: 1000, height: 1200 },
            significance: 'family meal evidence',
        }],
    });
}

function buildFakeGoogleGenerativeAI(response) {
    return class FakeGoogleGenerativeAI {
        getGenerativeModel() {
            return {
                async generateContent() {
                    return {
                        response: {
                            text() {
                                return JSON.stringify(response);
                            },
                        },
                    };
                },
            };
        }
    };
}

function buildLiveMetadataEvidence(params) {
    return {
        provider: 'google',
        modelVersion: params.metadataSourceKind === 'gemini_pro_refined'
            ? 'gemini-3.1-pro-preview'
            : 'gemini-2.5-flash',
        data: {
            ...params.metadataBlock,
            _analysis_tier: params.analysisTier,
            _pending_pro: params.pendingPro ? true : undefined,
        },
        metadataSourceKind: params.metadataSourceKind,
        metadataBlock: params.metadataBlock,
    };
}

function buildBlockPersistedAssertion(checks, row, expectedSourceKind) {
    checks.ok(row);
    checks.equal(row.source_kind, expectedSourceKind);
    checks.equal(row.provider, 'google');
    checks.equal(row.model_version, 'gemini-3.1-pro-preview');
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    checks.equal(parsed.caption, 'Billy and Dad at Christmas');
    checks.equal(parsed.regions_of_interest[0].kind, 'scene_context');
}

async function createHarness(tempDir, options = {}) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/index.js');

    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('ai_metadata_v2_api_key', options.apiKey || 'AIzaSyDUMMYKEY12345678901234567890');
    return {
        dbManager,
        module: createGenerateAiMetadataModule({
            dbManager,
            aiRuntime: options.aiRuntime,
        }),
    };
}

test('generateLiveAiMetadata returns tagged machine evidence blocks for flash and pro modes', async () => {
    const tempDir = createTempDir();
    const imagePath = await createImage(tempDir);
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
    seedAsset(dbManager.getDb(), imagePath);

    try {
        const flashResult = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-1',
                original_path: imagePath,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            metadataPass: 'scout',
            GoogleGenerativeAIClass: buildFakeGoogleGenerativeAI(buildGeminiResponse()),
        });

        assert.equal(flashResult.metadataSourceKind, 'gemini_flash_scout');
        assert.equal(flashResult.metadataBlock.caption, 'Billy and Dad at Christmas');
        assert.equal(flashResult.metadataBlock.subjects[0].suggested_names[0], 'Billy');
        assert.equal(flashResult.metadataBlock.regions_of_interest[0].kind, 'scene_context');
        assert.equal(flashResult.data._analysis_tier, 'flash');

        dbManager.setSetting('job_ai_model_refine', 'gemini-3.1-pro-preview');
        const proResult = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-1',
                original_path: imagePath,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            metadataPass: 'refine',
            GoogleGenerativeAIClass: buildFakeGoogleGenerativeAI(buildGeminiResponse({
                caption: 'Billy and Dad at Christmas dinner',
            })),
        });

        assert.equal(proResult.metadataSourceKind, 'gemini_pro_refined');
        assert.equal(proResult.metadataBlock.caption, 'Billy and Dad at Christmas dinner');
        assert.equal(proResult.data._analysis_tier, 'pro');
    } finally {
        dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('generate ai metadata uses a longer default timeout for refine passes', async () => {
    const { resolveLiveMetadataTimeoutMs } = require('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/index.js');

    assert.equal(resolveLiveMetadataTimeoutMs({ metadataPass: 'scout' }), 120_000);
    assert.equal(resolveLiveMetadataTimeoutMs({ metadataPass: 'refine' }), 300_000);
    assert.equal(resolveLiveMetadataTimeoutMs({ metadataPass: 'refine', configuredTimeoutMs: 45_000 }), 45_000);
});

test('generateLiveAiMetadata preserves pending pro status on flash fallback compatibility rows', async () => {
    const tempDir = createTempDir();
    const imagePath = await createImage(tempDir);
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
    dbManager.setSetting('job_ai_model_refine', 'gemini-3.1-pro-preview');
    seedAsset(dbManager.getDb(), imagePath);

    class FakeGoogleGenerativeAI {
        getGenerativeModel({ model }) {
            return {
                async generateContent() {
                    if (model === 'gemini-3.1-pro-preview') {
                        throw new Error('daily quota exceeded');
                    }
                    return {
                        response: {
                            text() {
                                return JSON.stringify(buildGeminiResponse());
                            },
                        },
                    };
                },
            };
        }
    }

    try {
        const result = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-1',
                original_path: imagePath,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            metadataPass: 'refine',
            GoogleGenerativeAIClass: FakeGoogleGenerativeAI,
        });

        assert.equal(result.metadataSourceKind, 'gemini_flash_scout');
        assert.equal(result.data._analysis_tier, 'flash');
        assert.equal(result.data._pending_pro, true);
    } finally {
        dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('generateAiMetadataModule persists machine blocks and projection rows from returned machine evidence', async () => {
    const tempDir = createTempDir();
    const imagePath = await createImage(tempDir);
    const harness = await createHarness(tempDir, {
        aiRuntime: {
            async generateLiveMetadata() {
                return {
                    provider: 'google',
                    modelVersion: 'gemini-3.1-pro-preview',
                    data: buildGeminiResponse(),
                    metadataSourceKind: 'gemini_pro_refined',
                    metadataBlock: buildGeminiResponse(),
                };
            },
        },
    });

    try {
        seedAsset(harness.dbManager.getDb(), imagePath);

        await harness.module.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            parameters: { aiMode: 'live', imageStrategy: 'overview_only' },
        });

        const blockRow = harness.dbManager.getDb().prepare(`
            SELECT source_kind, provider, model_version, schema_version, data
            FROM photo_metadata_blocks
            WHERE asset_id = 'asset-1'
            LIMIT 1
        `).get();
        const projectionRow = harness.dbManager.getDb().prepare(`
            SELECT caption, caption_source_kind, caption_source_id, estimated_date_display_label, estimated_date_source_kind
            FROM photo_metadata_projection
            WHERE asset_id = 'asset-1'
            LIMIT 1
        `).get();

        buildBlockPersistedAssertion(assert, blockRow, 'gemini_pro_refined');
        assert.ok(projectionRow);
        assert.equal(projectionRow.caption, 'Billy and Dad at Christmas');
        assert.equal(projectionRow.caption_source_kind, 'gemini_pro_refined');
        assert.equal(projectionRow.estimated_date_display_label, 'late 1968');
        assert.equal(projectionRow.estimated_date_source_kind, 'gemini_pro_refined');
        const parsedBlock = JSON.parse(blockRow.data);
        assert.deepEqual(parsedBlock.subjects[0].bounding_box, { x: 0.01, y: 0.02, width: 0.1, height: 0.12 });
        assert.deepEqual(parsedBlock.regions_of_interest[0].bounding_box, { x: 0.03, y: 0.04, width: 0.06, height: 0.04 });
    } finally {
        harness.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('generateAiMetadataModule persists obvious pixel-space Gemini boxes in canonical normalized coordinates', async () => {
    const tempDir = createTempDir();
    const imagePath = await createLargeImage(tempDir);
    const harness = await createHarness(tempDir, {
        aiRuntime: {
            async generateLiveMetadata() {
                return {
                    provider: 'google',
                    modelVersion: 'gemini-2.5-flash',
                    data: buildPixelSpaceGeminiResponse(),
                    metadataSourceKind: 'gemini_flash_scout',
                    metadataBlock: buildPixelSpaceGeminiResponse(),
                };
            },
        },
    });

    try {
        seedAsset(harness.dbManager.getDb(), imagePath, { width: 2000, height: 1200 });

        await harness.module.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            parameters: { aiMode: 'live', imageStrategy: 'overview_only' },
        });

        const blockRow = harness.dbManager.getDb().prepare(`
            SELECT data
            FROM photo_metadata_blocks
            WHERE asset_id = 'asset-1'
            LIMIT 1
        `).get();

        const parsedBlock = JSON.parse(blockRow.data);
        assert.deepEqual(parsedBlock.subjects[0].bounding_box, { x: 0.6, y: 0.1, width: 0.25, height: 0.3 });
        assert.deepEqual(parsedBlock.regions_of_interest[0].bounding_box, { x: 0.5, y: 0, width: 0.5, height: 1 });
    } finally {
        harness.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('generateAiMetadataModule keeps refined projection when scout evidence arrives later', async () => {
    const tempDir = createTempDir();
    const imagePath = await createImage(tempDir);
    const evidenceQueue = [
        buildLiveMetadataEvidence({
            analysisTier: 'pro',
            metadataSourceKind: 'gemini_pro_refined',
            metadataBlock: buildGeminiResponse({
                caption: 'Refined caption',
                description: 'Refined description',
            }),
        }),
        buildLiveMetadataEvidence({
            analysisTier: 'flash',
            metadataSourceKind: 'gemini_flash_scout',
            metadataBlock: buildGeminiResponse({
                caption: 'Scout caption',
                description: 'Scout description',
            }),
            pendingPro: false,
        }),
    ];
    const harness = await createHarness(tempDir, {
        aiRuntime: {
            async generateLiveMetadata() {
                return evidenceQueue.shift();
            },
        },
    });

    try {
        seedAsset(harness.dbManager.getDb(), imagePath);

        await harness.module.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            parameters: { aiMode: 'live', imageStrategy: 'overview_only' },
        });

        await harness.module.run({
            runId: 'run-2',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            parameters: { aiMode: 'live', imageStrategy: 'overview_only' },
        });

        const projectionRow = harness.dbManager.getDb().prepare(`
            SELECT caption, caption_source_kind
            FROM photo_metadata_projection
            WHERE asset_id = 'asset-1'
            LIMIT 1
        `).get();

        assert.ok(projectionRow);
        assert.equal(projectionRow.caption, 'Refined caption');
        assert.equal(projectionRow.caption_source_kind, 'gemini_pro_refined');
    } finally {
        harness.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});
