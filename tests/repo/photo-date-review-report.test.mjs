import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { readPhotoDateReviewCases, renderPhotoDateReviewMarkdown } from '../../tooling/scripts/repo/photo-date-review-report-lib.mjs';

const require = createRequire(import.meta.url);
const { PHOTO_ANALYSIS_SCHEMA_SQL } = require('../../dist/core/src/data/schema/photoAnalysis.js');

function fixture(t) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, original_path TEXT, photo_created_at TEXT,
        exif_datetime TEXT, metadata_timestamp_source TEXT);
        INSERT INTO assets VALUES ('photo-1', 'archive/photo.jpg', '1976-12-25', '2025-01-01', 'scan');`);
    db.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    t.after(() => db.close());
    return db;
}

function addClaim(db, options) {
    const runId = `run:${options.id}`;
    db.prepare(`INSERT INTO analysis_runs VALUES (?, 'photo-1', ?, ?, ?, 'test', 'successful', '{}', '{}', '[]', ?)`)
        .run(runId, options.kind === 'user_confirmed' ? 'user' : 'scout',
            options.kind === 'user_confirmed' ? 'human' : 'gemini', options.kind === 'user_confirmed' ? null : 'actual-model-version', options.date);
    db.prepare(`INSERT INTO analysis_claims VALUES (?, 'photo-1', ?, 'date', NULL, ?, 'high', ?, ?, NULL, ?)`)
        .run(options.id, runId, JSON.stringify(options.value), options.kind, options.state ?? 'active', options.date);
    const sourceId = `source:${options.id}`;
    db.prepare(`INSERT INTO analysis_sources(id, asset_id, run_id, kind, ref_id, image_id, display_text)
        VALUES (?, 'photo-1', ?, ?, ?, NULL, ?)`)
        .run(sourceId, runId, options.kind === 'user_confirmed' ? 'user' : 'image', options.id, options.sourceText);
    db.prepare(`INSERT INTO analysis_claim_sources VALUES (?, 'photo-1', 'provenance', 0, 0, ?, NULL)`)
        .run(options.id, sourceId);
    if (options.evidence) {
        db.prepare(`INSERT INTO analysis_claim_sources VALUES (?, 'photo-1', 'evidence', 0, 0, ?, ?)`)
            .run(options.id, sourceId, options.evidence);
    }
}

test('date review uses authoritative new claims and preserves AI evidence/provenance without old tables', t => {
    const db = fixture(t);
    addClaim(db, { id: 'old-confirmation', kind: 'user_confirmed', state: 'superseded', date: '2026-01-01',
        value: { label: '1970', start: '1970-01-01', end: '1970-12-31' }, sourceText: 'Earlier family recollection' });
    addClaim(db, { id: 'ai-date', kind: 'hypothesis', state: 'superseded', date: '2026-01-02',
        value: { label: '1950s', start: '1950-01-01', end: '1959-12-31' }, sourceText: 'Overview photo', evidence: 'Clothing appears consistent with the 1950s' });
    addClaim(db, { id: 'confirmed-date', kind: 'user_confirmed', date: '2026-01-03',
        value: { label: 'Christmas 1976', start: '1976-12-25', end: '1976-12-25' }, sourceText: 'User verified original inscription', evidence: 'Date handwritten on reverse' });
    const before = db.prepare('SELECT total_changes() AS count').get().count;
    const cases = readPhotoDateReviewCases(db);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].confirmed.id, 'confirmed-date');
    assert.equal(cases[0].confirmed.kind, 'user_confirmed');
    assert.equal(cases[0].inferred.id, 'ai-date');
    assert.equal(cases[0].inferred.state, 'superseded');
    assert.equal(cases[0].inferred.modelVersion, 'actual-model-version');
    assert.equal(cases[0].hasContradiction, true);
    assert.equal(cases[0].inferred.references[0].sourceId, 'source:ai-date');
    assert.equal(db.prepare('SELECT total_changes() AS count').get().count, before);
    const markdown = renderPhotoDateReviewMarkdown(cases, { generatedAt: '2026-01-04', sourceLabel: 'Test archive' });
    assert.match(markdown, /User-confirmed date: Christmas 1976/);
    assert.match(markdown, /AI hypothesis: 1950s/);
    assert.match(markdown, /Clothing appears consistent with the 1950s/);
    assert.match(markdown, /actual-model-version/);
    assert.match(markdown, /Cases with contradictions: 1/);
});

test('date review does not treat unknown or overlapping broad dates as conflicts', t => {
    const db = fixture(t);
    addClaim(db, { id: 'ai-date', kind: 'hypothesis', date: '2026-01-01',
        value: { label: '1970s', start: '1970-01-01', end: '1979-12-31' }, sourceText: 'Overview photo' });
    addClaim(db, { id: 'confirmed-date', kind: 'user_confirmed', date: '2026-01-02',
        value: { label: '1976', start: '1976-01-01', end: '1976-12-31' }, sourceText: 'User confirmation' });
    assert.equal(readPhotoDateReviewCases(db)[0].hasContradiction, false);
    db.prepare("UPDATE analysis_claims SET value_json = 'null' WHERE id = 'ai-date'").run();
    assert.equal(readPhotoDateReviewCases(db)[0].hasContradiction, false);
});
