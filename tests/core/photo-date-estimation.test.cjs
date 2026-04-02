const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-date-estimate-'));
}

function createFixtureImage(rootDir, fileName = 'one.png') {
    const imagePath = path.join(rootDir, fileName);
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(imagePath, pngBytes);
    return imagePath;
}

test('estimatePhotoDate prefers historical AI ranges over scanner-style metadata timestamps', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/b3s9_04.jpg',
        fileBirthtime: '2026-03-17T11:23:05.359Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    ProcessingSoftware: 'Windows Photo Editor 10.0.10011.16384',
                    Software: 'Windows Photo Editor 10.0.10011.16384',
                },
                xmp: {
                    'rdf:Description.@xmp:CreatorTool': 'Windows Photo Editor 10.0.10011.16384',
                },
            },
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2018-10-13T09:53:47.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: '1940s-1950s',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1949);
    assert.equal(result.range.start, '1940-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1959-12-31T23:59:59.999Z');
    assert.ok(result.confidence.score > 0.3);
    assert.ok(result.confidence.score < 0.75);
    assert.ok(result.confidence.reasons.some((reason) => reason.includes('scanner')));
});

test('estimatePhotoDate keeps born-digital metadata as the leading signal when AI is nearby', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/IMG_2048.JPG',
        fileBirthtime: '2024-08-10T10:12:13.000Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    Make: 'Apple',
                    Model: 'iPhone 15 Pro',
                    Software: '17.5',
                },
            },
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2024-08-10T10:12:13.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: '2023',
        },
    });

    assert.equal(result.photoCreatedAt, '2024-08-10T10:12:13.000Z');
    assert.equal(result.range.start, '2024-08-10T10:12:13.000Z');
    assert.equal(result.range.end, '2024-08-10T10:12:13.000Z');
    assert.ok(result.confidence.score > 0.7);
});

test('estimatePhotoDate lets AI override born-digital metadata when the divergence is decades wide', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/IMG_2048.JPG',
        fileBirthtime: '2024-08-10T10:12:13.000Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    Make: 'Apple',
                    Model: 'iPhone 15 Pro',
                    Software: '17.5',
                },
            },
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2024-08-10T10:12:13.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: '1970s',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1974);
    assert.equal(result.range.start, '1970-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1979-12-31T23:59:59.999Z');
    assert.ok(result.confidence.score < 0.6);
});

test('estimatePhotoDate ignores WhatsApp export filename dates when historical AI evidence disagrees', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/Users/robin/Pictures/Family History/WhatsApp Image 2025-02-12 at 20.04.41_2d3c19d9.jpg',
        fileBirthtime: '2025-02-13T07:58:13.571Z',
        embeddedMetadata: {
            embedded: {},
            derived: {
                capture_datetime: null,
                timestamp_source: null,
                timestamp_candidates: [],
            },
        },
        aiMetadata: {
            estimated_date: 'circa 1990',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1990);
    assert.equal(result.range.start, '1990-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1990-12-31T23:59:59.999Z');
    assert.ok(result.signals.every((signal) => signal.source !== 'filename.full_date'));
    assert.ok(result.signals.every((signal) => signal.label.includes('WhatsApp') === false));
});

test('estimatePhotoDate prefers structured AI most_likely_date over broad min/max range text', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/family-scan.jpg',
        fileBirthtime: '2025-02-13T07:58:13.571Z',
        embeddedMetadata: {
            embedded: {},
            derived: {
                capture_datetime: null,
                timestamp_source: null,
                timestamp_candidates: [],
            },
        },
        aiMetadata: {
            estimated_date: {
                most_likely_date: '1990',
                min_date: '1985-01-01',
                max_date: '1995-12-31',
                display_label: 'circa 1990',
                rationale: 'Period styling strongly suggests around 1990.',
            },
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1990);
    assert.ok(result.signals.some((signal) => signal.source === 'ai.estimated_date.year'));
});

test('estimatePhotoDate treats edit-time metadata as weaker than historical AI decade hints', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/family-scan.jpg',
        fileBirthtime: '2026-03-17T11:23:05.359Z',
        embeddedMetadata: {
            embedded: {},
            derived: {
                timestamp_candidates: [
                    { source: 'exif.ModifyDate', value: '2021-07-01T00:00:00.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: {
                most_likely_date: null,
                min_date: null,
                max_date: null,
                display_label: 'Early 1990s',
                rationale: 'Clothing and photo quality suggest an early 1990s print scan.',
            },
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1994);
    assert.equal(result.range.start, '1990-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1999-12-31T23:59:59.999Z');
    assert.ok(result.signals.some((signal) => signal.source === 'exif.ModifyDate'));
    assert.ok(result.signals.some((signal) => signal.source === 'ai.estimated_date.decade'));
});

test('estimatePhotoDate prefers AI over unknown-source embedded timestamps', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/family-archive.jpg',
        fileBirthtime: '2026-03-17T11:23:05.359Z',
        embeddedMetadata: {
            embedded: {},
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2021-07-01T00:00:00.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: 'Early 1990s',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1994);
    assert.equal(result.range.start, '1990-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1999-12-31T23:59:59.999Z');
});

test('estimatePhotoDate ignores scanner-style two-digit archive filename years when AI provides a historical year', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/family-archive/b1s18_04.jpg',
        fileBirthtime: '2026-03-17T11:23:05.359Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    ProcessingSoftware: 'Windows Photo Editor 10.0.10011.16384',
                    Software: 'Windows Photo Editor 10.0.10011.16384',
                },
            },
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2018-10-21T03:04:29.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: '1954',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1954);
    assert.ok(result.signals.every((signal) => signal.source !== 'filename.two_digit_year'));
    assert.ok(result.signals.some((signal) => signal.source === 'ai.estimated_date.year'));
});

test('estimatePhotoDate ignores opaque numeric filename two-digit years when AI provides a historical year', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/485609-082918_09.jpg',
        fileBirthtime: '2026-03-17T11:23:05.359Z',
        embeddedMetadata: {
            embedded: {},
            derived: {
                timestamp_candidates: [],
            },
        },
        aiMetadata: {
            estimated_date: '1964',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1964);
    assert.ok(result.signals.every((signal) => signal.source !== 'filename.two_digit_year'));
    assert.ok(result.signals.some((signal) => signal.source === 'ai.estimated_date.year'));
});

test('estimatePhotoDate keeps meaningful two-digit filename years for human-readable names', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/Dad, Doncaster 89.jpg',
        fileBirthtime: null,
        embeddedMetadata: {
            embedded: {},
            derived: {
                timestamp_candidates: [],
            },
        },
        aiMetadata: null,
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1989);
    assert.ok(result.signals.some((signal) => signal.source === 'filename.two_digit_year'));
});

test('estimatePhotoDate lets historical AI override born-digital export timestamps on decades-wide disagreement', async () => {
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const result = estimatePhotoDate({
        originalPath: 'C:/photos/PB153551.JPG',
        fileBirthtime: '2025-12-26T02:47:04.000Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    Make: 'Apple',
                    Model: 'iPhone 15 Pro',
                    Software: '17.5',
                },
            },
            derived: {
                timestamp_candidates: [
                    { source: 'exif.DateTimeOriginal', value: '2018-11-15T16:12:00.000Z' },
                    { source: 'exif.ModifyDate', value: '2018-11-15T16:12:00.000Z' },
                    { source: 'exif.CreateDate', value: '2018-11-15T16:12:00.000Z' },
                ],
            },
        },
        aiMetadata: {
            estimated_date: '1945',
        },
    });

    assert.equal(new Date(result.photoCreatedAt).getUTCFullYear(), 1945);
    assert.equal(result.range.start, '1945-01-01T00:00:00.000Z');
    assert.equal(result.range.end, '1945-12-31T23:59:59.999Z');
    const aiSignal = result.signals.find((signal) => signal.source === 'ai.estimated_date.year');
    const modifySignal = result.signals.find((signal) => signal.source === 'exif.ModifyDate');
    assert.ok(aiSignal);
    assert.ok(modifySignal);
    assert.ok(aiSignal.weight > modifySignal.weight);
});

test('runtime.estimate_photo_date preserves import time and stores photo_created_at plus confidence', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir, 'family-1967-scan.png');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createEstimatePhotoDateModule } = await import('../../dist/core/src/services/workflowRuntime/modules/estimatePhotoDateModule.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at, photo_created_at, photo_created_at_confidence)
            VALUES ('asset-1', ?, NULL, 67, 1, 1, NULL, NULL, '2026-03-20T00:00:00.000Z', NULL, NULL)
        `).run(imagePath);
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES ('ai-1', 'asset-1', 'ai_metadata', 'runtime_stub', '1.0', ?)
        `).run(JSON.stringify({ estimated_date: '1960s' }));

        const moduleDefinition = createEstimatePhotoDateModule({ dbManager });
        const result = await moduleDefinition.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }]);

        const assetRow = db.prepare(`
            SELECT created_at, photo_created_at, photo_created_at_confidence
            FROM assets
            WHERE id = 'asset-1'
        `).get();
        assert.equal(assetRow.created_at, '2026-03-20T00:00:00.000Z');
        assert.equal(new Date(assetRow.photo_created_at).getUTCFullYear(), 1967);
        assert.ok(assetRow.photo_created_at_confidence > 0);

        const estimateRow = db.prepare(`
            SELECT data
            FROM derived_results
            WHERE asset_id = 'asset-1' AND task = 'photo_date_estimate'
        `).get();
        assert.ok(estimateRow);
        const stored = JSON.parse(estimateRow.data);
        assert.equal(new Date(stored.photoCreatedAt).getUTCFullYear(), 1967);
        assert.equal(stored.range.start, '1967-01-01T00:00:00.000Z');
        assert.equal(stored.range.end, '1967-12-31T23:59:59.999Z');
        assert.ok(stored.confidence.score > 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
