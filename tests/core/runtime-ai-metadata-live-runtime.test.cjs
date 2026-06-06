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
    const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');

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

async function createLargeImage({ tempDir, filename }) {
    const sharp = (await import('sharp')).default;
    const imagePath = path.join(tempDir, filename);
    await sharp({
        create: {
            width: 2000,
            height: 1200,
            channels: 3,
            background: { r: 120, g: 90, b: 60 },
        },
    }).png().toFile(imagePath);
    return imagePath;
}

function buildPixelSpaceResponse() {
    return buildValidMetadataResponse({
        subjects: [{
            label: 'Subject1',
            bounding_box: { x: 1200, y: 120, width: 500, height: 360 },
            type: 'person',
            location_desc: 'left',
            gender: 'female',
            animal_type: null,
            age_range: 'adult',
            dob_range: null,
            emotion: 'neutral',
            gaze: null,
            features: null,
            uniform: null,
            suggested_names: [],
        }],
        regions_of_interest: [{
            label: 'Bookshelf and fireplace',
            kind: 'object',
            bounding_box: { x: 1000, y: 0, width: 1000, height: 1200 },
            significance: 'background context',
        }],
    });
}

function buildImpossibleSourceImageIndexResponse(sourceImageIndex) {
    return buildValidMetadataResponse({
        subjects: [{
            label: 'Subject1',
            bounding_box: { x: 120, y: 220, width: 140, height: 140 },
            source_image_index: sourceImageIndex,
            bounding_box_coordinate_space: 'full_photo',
            type: 'person',
            location_desc: 'left',
            gender: 'female',
            animal_type: null,
            age_range: 'adult',
            dob_range: null,
            emotion: 'neutral',
            gaze: null,
            features: null,
            uniform: null,
            suggested_names: [],
        }],
    });
}

function createSequencedGoogleGenerativeAI(responses, onAttempt) {
    return class SequencedGoogleGenerativeAI {
        getGenerativeModel() {
            return {
                async generateContent() {
                    const nextAttempt = onAttempt();
                    return {
                        response: {
                            text() {
                                const response = responses[Math.min(nextAttempt - 1, responses.length - 1)];
                                return JSON.stringify(response);
                            },
                        },
                    };
                },
            };
        }
    };
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
    const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
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
        assert.equal(captured.modelParams.generationConfig.candidateCount, 1);
        assert.equal(captured.modelParams.generationConfig.temperature, 0);
        assert.equal(captured.modelParams.generationConfig.topK, 1);

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

test('generateLiveAiMetadata repairs impossible source_image_index for overview-only without a second Gemini call', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
        const imagePath = await writeFallbackImage({ tempDir });

        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
        let attempts = 0;

        const result = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-contract-1',
                original_path: imagePath,
                width: 120,
                height: 120,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            GoogleGenerativeAIClass: createSequencedGoogleGenerativeAI(
                [
                    buildImpossibleSourceImageIndexResponse(2),
                    buildImpossibleSourceImageIndexResponse(1),
                ],
                () => {
                    attempts += 1;
                    return attempts;
                },
            ),
        });

        assert.equal(attempts, 1);
        assert.equal(result.data.subjects[0].source_image_index, 1);
        assert.deepEqual(result.metadataBlock.subjects[0].bounding_box, {
            x: 0.12,
            y: 0.22,
            width: 0.14,
            height: 0.14,
        });
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata rejects impossible source_image_index values after retry budget is exhausted', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
        const imagePath = await createLargeImage({ tempDir, filename: 'contract-tiled.png' });

        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
        let attempts = 0;

        await assert.rejects(
            liveRuntime.generateLiveAiMetadata({
                dbManager,
                row: {
                    id: 'asset-contract-2',
                    original_path: imagePath,
                    width: 2000,
                    height: 1200,
                    sensitivity_status: null,
                    sensitivity_score: null,
                },
                imageStrategy: 'overview_plus_tiles',
                GoogleGenerativeAIClass: createSequencedGoogleGenerativeAI(
                    [
                        buildImpossibleSourceImageIndexResponse(7),
                        buildImpossibleSourceImageIndexResponse(7),
                    ],
                    () => {
                        attempts += 1;
                        return attempts;
                    },
                ),
            }),
            /Gemini response violated the requested image-part contract/i,
        );
        assert.equal(attempts, 2);
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
        assert.match(captured.request[0], /Image 2 covers the full-photo pixel region/i);
        assert.match(captured.request[0], /return every bounding box in full-photo normalized 0 to 1000 coordinates/i);
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

test('generateLiveAiMetadata normalizes obvious pixel-space Gemini boxes using the original image dimensions', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
        const imagePath = await createLargeImage({ tempDir, filename: 'pixel-boxes.png' });

        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');

        class FakeGoogleGenerativeAI {
            getGenerativeModel() {
                return {
                    async generateContent() {
                        return {
                            response: {
                                text() {
                                    return JSON.stringify(buildPixelSpaceResponse());
                                },
                            },
                        };
                    },
                };
            }
        }

        const result = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-pixel-1',
                original_path: imagePath,
                width: 2000,
                height: 1200,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            GoogleGenerativeAIClass: FakeGoogleGenerativeAI,
        });

        assert.deepEqual(result.metadataBlock.subjects[0].bounding_box, {
            x: 0.6,
            y: 0.1,
            width: 0.25,
            height: 0.3,
        });
        assert.deepEqual(result.metadataBlock.regions_of_interest[0].bounding_box, {
            x: 0.5,
            y: 0,
            width: 0.5,
            height: 1,
        });
        assert.deepEqual(result.data.subjects[0].bounding_box, {
            x: 0.6,
            y: 0.1,
            width: 0.25,
            height: 0.3,
        });
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata remaps crop-local Gemini boxes into full-photo coordinates when the response declares crop space', async () => {
    const tempDir = createTempDir();
    let dbManager = null;

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
        const imagePath = await createLargeImage({ tempDir, filename: 'crop-local-boxes.png' });

        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');

        class FakeGoogleGenerativeAI {
            getGenerativeModel() {
                return {
                    async generateContent() {
                        return {
                            response: {
                                text() {
                                    return JSON.stringify(buildValidMetadataResponse({
                                        subjects: [],
                                        regions_of_interest: [{
                                            label: 'Front door',
                                            kind: 'architecture',
                                            bounding_box: { x: 290, y: 0, width: 440, height: 990 },
                                            source_image_index: 3,
                                            bounding_box_coordinate_space: 'crop_local',
                                            significance: 'Characteristic architectural detail of the residence.',
                                        }],
                                    }));
                                },
                            },
                        };
                    },
                };
            }
        }

        const result = await liveRuntime.generateLiveAiMetadata({
            dbManager,
            row: {
                id: 'asset-crop-1',
                original_path: imagePath,
                width: 3020,
                height: 4896,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_plus_tiles',
            GoogleGenerativeAIClass: FakeGoogleGenerativeAI,
        });

        assert.deepEqual(result.metadataBlock.regions_of_interest[0].bounding_box, {
            x: 0.287,
            y: 0,
            width: 0.132,
            height: 0.99,
        });
        assert.equal(result.data.regions_of_interest[0].bounding_box_coordinate_space, 'full_photo');
    } finally {
        try {
            dbManager?.close();
        } catch {
            // ignore cleanup failures during test teardown
        }
        await removeDirWithRetry(tempDir);
    }
});

test('generateLiveAiMetadata logs Gemini call timings', async () => {
    const tempDir = createTempDir();
    let dbManager = null;
    const originalConsoleLog = console.log;
    const capturedLogs = [];

    try {
        const { DatabaseManager } = require('../../dist/core/src/data/db.js');
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
        const imagePath = await writeFallbackImage({ tempDir });
        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
        console.log = (...args) => {
            capturedLogs.push(args.join(' '));
        };

        class TimedGoogleGenerativeAI {
            getGenerativeModel() {
                return {
                    async generateContent() {
                        await new Promise((resolve) => setTimeout(resolve, 20));
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
                id: 'asset-log-1',
                original_path: imagePath,
                width: 120,
                height: 120,
                sensitivity_status: null,
                sensitivity_score: null,
            },
            imageStrategy: 'overview_only',
            GoogleGenerativeAIClass: TimedGoogleGenerativeAI,
        });

        assert.ok(capturedLogs.some((line) => /\[AI Metadata\] Gemini call gemini-2\.5-flash completed in \d+ms for asset asset-log-1/i.test(line)));
    } finally {
        console.log = originalConsoleLog;
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
        const liveRuntime = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');
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
