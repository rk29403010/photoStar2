import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-date-review-report-'));
}

function createDb() {
    const tempDir = createTempDir();
    const dbPath = path.join(tempDir, 'library.db');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE assets (
            id TEXT PRIMARY KEY,
            original_path TEXT NOT NULL,
            photo_created_at TEXT,
            photo_created_at_confidence REAL,
            exif_datetime TEXT,
            metadata_timestamp_source TEXT,
            created_at TEXT
        );

        CREATE TABLE photo_metadata_assertions (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            value_json TEXT NOT NULL,
            user_id TEXT NOT NULL,
            note TEXT,
            created_at TEXT
        );

        CREATE TABLE photo_metadata_projection (
            asset_id TEXT PRIMARY KEY,
            estimated_date_most_likely TEXT,
            estimated_date_display_label TEXT,
            estimated_date_rationale TEXT
        );

        CREATE TABLE derived_results (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            task TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT
        );
    `);
    return { db, tempDir };
}

function seedAssets(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, photo_created_at, photo_created_at_confidence, exif_datetime, metadata_timestamp_source, created_at)
        VALUES
        ('asset-1', 'C:/photos/bill-1945.jpg', '2021-07-01T00:00:00.000Z', 0.66, '2021-07-01T00:00:00.000Z', 'exif.ModifyDate', '2026-03-30T09:00:00.000Z'),
        ('asset-2', 'C:/photos/family-memory.jpg', '1968-05-01T00:00:00.000Z', 0.91, NULL, NULL, '2026-03-30T09:00:00.000Z')
    `).run();
}

function seedProjection(db) {
    db.prepare(`
        INSERT INTO photo_metadata_projection (asset_id, estimated_date_most_likely, estimated_date_display_label, estimated_date_rationale)
        VALUES
        ('asset-1', '1945-05-08', '1945', 'AI identified VE Day context.'),
        ('asset-2', '1968-05-01', 'spring 1968', 'Family context only.')
    `).run();
}

function seedEstimateArtifacts(db) {
    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, data, created_at)
        VALUES
        ('estimate-1', 'asset-1', 'photo_date_estimate', ?, '2026-04-01T09:12:00.000Z'),
        ('estimate-2', 'asset-2', 'photo_date_estimate', ?, '2026-04-01T09:13:00.000Z')
    `).run(
        JSON.stringify({
            schema_version: 1,
            photoCreatedAt: '2021-07-01T00:00:00.000Z',
            range: { start: '2021-07-01T00:00:00.000Z', end: '2021-07-01T00:00:00.000Z' },
            confidence: { score: 0.66, reasons: ['high-value signals disagreed materially with the winning date'] },
            signals: [
                {
                    source: 'embedded.exif.ModifyDate',
                    origin: 'embedded',
                    label: 'Embedded timestamp exif.ModifyDate',
                    precision: 'exact',
                    start: '2021-07-01T00:00:00.000Z',
                    end: '2021-07-01T00:00:00.000Z',
                    representativeAt: '2021-07-01T00:00:00.000Z',
                    weight: 0.41,
                },
                {
                    source: 'ai.estimated_date.year',
                    origin: 'ai',
                    label: 'AI year 1945',
                    precision: 'year',
                    start: '1945-01-01T00:00:00.000Z',
                    end: '1945-12-31T23:59:59.999Z',
                    representativeAt: '1945-07-02T11:59:59.999Z',
                    weight: 0.64,
                },
            ],
        }),
        JSON.stringify({
            schema_version: 1,
            photoCreatedAt: '1968-05-01T00:00:00.000Z',
            range: { start: '1968-01-01T00:00:00.000Z', end: '1968-12-31T23:59:59.999Z' },
            confidence: { score: 0.91, reasons: ['manual family knowledge'] },
            signals: [],
        }),
    );
}

function seedReviewAssertions(db) {
    db.prepare(`
        INSERT INTO photo_metadata_assertions (id, asset_id, field_path, value_json, user_id, note, created_at)
        VALUES
        ('assertion-1-old', 'asset-1', 'estimated_date.most_likely_date', ?, 'photo-date-review', 'photo_date_review_reason=ai_right_metadata_wrong\nOlder note', '2026-04-01T08:00:00.000Z'),
        ('assertion-1-new', 'asset-1', 'estimated_date.most_likely_date', ?, 'photo-date-review', 'photo_date_review_reason=scanned_or_edited\nLooks like a scan export date', '2026-04-01T10:00:00.000Z'),
        ('assertion-2', 'asset-2', 'estimated_date.most_likely_date', ?, 'photo-date-review', 'photo_date_review_reason=manual_family_knowledge\nOnly known from family memory', '2026-04-01T09:00:00.000Z'),
        ('assertion-ignored', 'asset-1', 'estimated_date.display_label', ?, 'photo-date-review', 'photo_date_review_reason=scanned_or_edited', '2026-04-01T10:00:01.000Z')
    `).run(
        JSON.stringify('1950'),
        JSON.stringify('1945-05-08'),
        JSON.stringify('1968-05-01'),
        JSON.stringify('1945'),
    );
}

function assertCaseSummaries(cases) {
    assert.equal(cases.length, 2);
    assert.equal(cases[0].assetId, 'asset-1');
    assert.equal(cases[0].correctedDate, '1945-05-08');
    assert.equal(cases[0].reasonCode, 'scanned_or_edited');
    assert.equal(cases[0].isAlgorithmicCandidate, true);
    assert.equal(cases[0].suggestedAction, 'Downweight scanner/editor-style timestamps and add a regression case.');
    assert.equal(cases[0].storedPhotoCreatedAt, '2021-07-01T00:00:00.000Z');
    assert.equal(cases[0].storedTimestampSource, 'exif.ModifyDate');
    assert.equal(cases[0].aiMostLikelyDate, '1945-05-08');
    assert.equal(cases[0].topSignals[0].label, 'AI year 1945');
    assert.equal(cases[0].likelyWinningSignal?.label, 'Embedded timestamp exif.ModifyDate');
    assert.equal(cases[0].reviewNote, 'Looks like a scan export date');

    assert.equal(cases[1].assetId, 'asset-2');
    assert.equal(cases[1].reasonCode, 'manual_family_knowledge');
    assert.equal(cases[1].isAlgorithmicCandidate, false);
    assert.equal(cases[1].suggestedAction, 'Keep as a manual override and exclude it from algorithm tuning.');
}

function assertRenderedMarkdown(markdown) {
    assert.match(markdown, /# Photo Date Review Report/);
    assert.match(markdown, /Algorithmic candidates: 1/);
    assert.match(markdown, /Manual-only cases: 1/);
    assert.match(markdown, /asset-1/);
    assert.match(markdown, /Downweight scanner\/editor-style timestamps and add a regression case\./);
    assert.match(markdown, /Keep as a manual override and exclude it from algorithm tuning\./);
}

test('photo date review report groups latest flagged cases into tuning-ready summaries', async () => {
    const { readPhotoDateReviewCases, renderPhotoDateReviewMarkdown } = await import('../../tooling/scripts/repo/photo-date-review-report-lib.mjs');
    const { db, tempDir } = createDb();

    try {
        seedAssets(db);
        seedProjection(db);
        seedEstimateArtifacts(db);
        seedReviewAssertions(db);

        const cases = readPhotoDateReviewCases(db);
        assertCaseSummaries(cases);

        const markdown = renderPhotoDateReviewMarkdown(cases, {
            generatedAt: '2026-04-01T12:00:00.000Z',
            sourceLabel: 'test library',
        });
        assertRenderedMarkdown(markdown);
    } finally {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
