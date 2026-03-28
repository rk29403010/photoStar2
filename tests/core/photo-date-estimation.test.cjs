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

test('estimatePhotoDate keeps born-digital metadata as the leading signal but lowers confidence on major disagreement', async () => {
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

    assert.equal(result.photoCreatedAt, '2024-08-10T10:12:13.000Z');
    assert.equal(result.range.start, '2024-08-10T10:12:13.000Z');
    assert.equal(result.range.end, '2024-08-10T10:12:13.000Z');
    assert.ok(result.confidence.score < 0.8);
    assert.ok(result.confidence.reasons.some((reason) => reason.includes('disagrees')));
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
