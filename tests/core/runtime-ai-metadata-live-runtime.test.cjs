const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-ai-live-runtime-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 14 && error && error.code === 'EBUSY') {
                return;
            }
            if (attempt === 14) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
    }
}

function buildValidMetadataResponse(overrides = {}) {
    return {
        type: 'Family portrait',
        caption: 'A family portrait.',
        description: 'A family portrait used for live runtime metadata tests.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: '1930s',
            min_date: null,
            max_date: null,
            display_label: '1930s',
            rationale: 'Fixture date for runtime test.',
        },
        subjects: [
            {
                label: 'Subject1',
                bounding_box: { x: 10, y: 20, width: 100, height: 120 },
                type: 'person',
                location_desc: 'centre',
                gender: 'female',
                animal_type: null,
                age_range: 'adult',
                dob_range: null,
                emotion: 'neutral',
                gaze: null,
                features: null,
                uniform: null,
                suggested_names: [],
            },
        ],
        regions_of_interest: [],
        keywords: ['family'],
        emotional_impact: 'Warm',
        quality: {
            technical: 7,
            lighting: 7,
            composition: 7,
            emotional: 8,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 8,
            reasons: ['Looks original'],
        },
        ...overrides,
    };
}

async function runLiveMetadataCapture({ tempDir, imageStrategy }) {
    const sharp = (await import('sharp')).default;
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const liveRuntime = await import('../../dist/core/src/services/aiMetadata/liveRuntime.js');

    const imagePath = path.join(tempDir, `oversized-${imageStrategy}.png`);
    await sharp({
        create: {
            width: 2000,
            height: 1200,
            channels: 3,
            background: { r: 120, g: 90, b: 60 },
        },
    }).png().toFile(imagePath);

    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');

    const captured = {
        modelParams: null,
        request: null,
    };

    class FakeGoogleGenerativeAI {
        getGenerativeModel(modelParams) {
            captured.modelParams = modelParams;
            return {
                async generateContent(request) {
                    captured.request = request;
                    return {
                        response: {
                            text() {
                                return JSON.stringify(buildValidMetadataResponse());
                            },
                        },
                    };
                },
            };
        }
    }

    await liveRuntime.generateLiveAiMetadata({
        dbManager,
        row: {
            id: 'asset-1',
            original_path: imagePath,
            sensitivity_status: null,
            sensitivity_score: null,
        },
        imageStrategy,
        GoogleGenerativeAIClass: FakeGoogleGenerativeAI,
    });

    return { captured, dbManager, sharp };
}

async function writeFallbackImage({ tempDir }) {
    const imagePath = path.join(tempDir, 'env-fallback.png');
    const sharp = (await import('sharp')).default;

    await sharp({
        create: {
            width: 120,
            height: 120,
            channels: 3,
            background: { r: 80, g: 110, b: 140 },
        },
    }).png().toFile(imagePath);

    return imagePath;
}

function createEnvFallbackGoogleGenerativeAI(captureApiKey) {
    return class FakeGoogleGenerativeAI {
        constructor(apiKey) {
            captureApiKey(apiKey);
        }

        getGenerativeModel() {
            return {
                async generateContent() {
                    return {
                        response: {
                            text() {
                                return JSON.stringify(buildValidMetadataResponse({
                                    type: 'Portrait',
                                    caption: 'Fallback env key works.',
                                    description: 'Fallback env key runtime test response.',
                                    estimated_date: {
                                        most_likely_date: '1940s',
                                        min_date: null,
                                        max_date: null,
                                        display_label: '1940s',
                                        rationale: 'Fixture date for fallback test.',
                                    },
                                    subjects: [],
                                    keywords: ['portrait'],
                                    emotional_impact: 'Calm',
                                    quality: {
                                        technical: 7,
                                        lighting: 7,
                                        composition: 7,
                                        emotional: 7,
                                        discard: false,
                                    },
                                    authenticity: {
                                        score: 8,
                                        reasons: ['Consistent scan'],
                                    },
                                }));
                            },
                        },
                    };
                },
            };
        }
    };
}

async function runEnvFallbackCapture({ tempDir }) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const liveRuntime = await import('../../dist/core/src/services/aiMetadata/liveRuntime.js');
    const imagePath = await writeFallbackImage({ tempDir });
    const dbManager = new DatabaseManager(tempDir);
    let capturedApiKey = null;

    await liveRuntime.generateLiveAiMetadata({
        dbManager,
        row: {
            id: 'asset-env-1',
            original_path: imagePath,
            sensitivity_status: null,
            sensitivity_score: null,
        },
        imageStrategy: 'overview_only',
        GoogleGenerativeAIClass: createEnvFallbackGoogleGenerativeAI((apiKey) => {
            capturedApiKey = apiKey;
        }),
    });

    return { capturedApiKey, dbManager };
}

test('generateLiveAiMetadata falls back to GEMINI_API_KEY when DB settings are blank', async () => {
    const tempDir = createTempDir();
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    let dbManager = null;

    try {
        process.env.GEMINI_API_KEY = 'AIzaSyENVKEY1234567890123456789012';
        const result = await runEnvFallbackCapture({ tempDir });
        dbManager = result.dbManager;

        assert.equal(result.capturedApiKey, 'AIzaSyENVKEY1234567890123456789012');
    } finally {
        if (originalGeminiApiKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = originalGeminiApiKey;
        }
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata configures structured output and overview-only image preparation', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const result = await runLiveMetadataCapture({ tempDir, imageStrategy: 'overview_only' });
        dbManager = result.dbManager;
        const { captured, sharp } = result;

        assert.ok(captured.modelParams);
        assert.equal(captured.modelParams.model, 'gemini-2.5-flash');
        assert.equal(captured.modelParams.generationConfig.responseMimeType, 'application/json');
        assert.equal(captured.modelParams.generationConfig.responseSchema.type, 'object');
        assert.equal(captured.modelParams.generationConfig.responseSchema.properties.subjects.type, 'array');

        assert.ok(Array.isArray(captured.request));
        assert.equal(captured.request.length, 2);
        const imagePart = captured.request[1];
        assert.ok(imagePart.inlineData);
        assert.equal(imagePart.inlineData.mimeType, 'image/jpeg');

        const resizedMetadata = await sharp(Buffer.from(imagePart.inlineData.data, 'base64')).metadata();
        assert.equal(Math.max(resizedMetadata.width ?? 0, resizedMetadata.height ?? 0), 768);
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata sends overview plus numbered tile crops in tiled mode', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const result = await runLiveMetadataCapture({ tempDir, imageStrategy: 'overview_plus_tiles' });
        dbManager = result.dbManager;
        const { captured, sharp } = result;

        assert.ok(Array.isArray(captured.request));
        assert.match(captured.request[0], /Image 1 is the full overview/i);
        assert.match(captured.request[0], /Images 2 through 5 are detail crops/i);
        assert.equal(captured.request.length, 6);

        for (const imagePart of captured.request.slice(1)) {
            assert.ok(imagePart.inlineData);
            const resizedMetadata = await sharp(Buffer.from(imagePart.inlineData.data, 'base64')).metadata();
            assert.equal(Math.max(resizedMetadata.width ?? 0, resizedMetadata.height ?? 0), 768);
        }
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata sanitizes expected Gemini network fetch failures', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/aiMetadata/liveRuntime.js');
        const imagePath = await writeFallbackImage({ tempDir });
        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');

        class FailingGoogleGenerativeAI {
            getGenerativeModel() {
                return {
                    async generateContent() {
                        throw new Error('[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: fetch failed');
                    },
                };
            }
        }

        await assert.rejects(
            liveRuntime.generateLiveAiMetadata({
                dbManager,
                row: {
                    id: 'asset-network-1',
                    original_path: imagePath,
                    sensitivity_status: null,
                    sensitivity_score: null,
                },
                imageStrategy: 'overview_only',
                GoogleGenerativeAIClass: FailingGoogleGenerativeAI,
            }),
            /Unable to reach Gemini right now\. Check your internet connection and try again\./,
        );
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});
