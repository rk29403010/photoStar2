const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const { PHOTO_ANALYSIS_SCHEMA_SQL } = require('../../dist/core/src/data/schema/photoAnalysis.js');

test('full debug dry-run exports the production request and leaves the source database byte-identical', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-debug-runtime-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const imagePath = path.join(directory, 'photograph.jpg');
    const dbPath = path.join(directory, 'library.db');
    const outDir = path.join(directory, 'request');
    await sharp({ create: { width: 400, height: 200, channels: 3, background: '#888888' } }).jpeg().toFile(imagePath);
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE assets (id TEXT PRIMARY KEY, asset_identity_guid TEXT, original_path TEXT, width INTEGER, height INTEGER,
            sensitivity_score REAL, created_at TEXT);
        CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE assets_manual (identity_guid TEXT, sensitivity_status TEXT);
        CREATE TABLE asset_identities (guid TEXT PRIMARY KEY, original_path TEXT);
        CREATE TABLE faces (id TEXT, visual_region_id TEXT);
        CREATE TABLE visual_regions (id TEXT, asset_identity_guid TEXT);
        CREATE TABLE visual_region_geometry_generations (visual_region_id TEXT, x REAL, y REAL, width REAL,
            height REAL, status TEXT, created_at TEXT);
        CREATE TABLE derived_results (asset_id TEXT, task TEXT, data TEXT, created_at TEXT);
    `);
    db.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    db.prepare('INSERT INTO assets VALUES (?, NULL, ?, 400, 200, NULL, ?)').run('photo-1', imagePath, '2026-01-01');
    db.close();
    const before = fs.readFileSync(dbPath);
    const result = JSON.parse(execFileSync(process.execPath, [
        'tooling/scripts/repo/ai-metadata-debug.mjs', '--asset=photo-1', `--db=${dbPath}`,
        '--dryRun=true', '--model=arbitrary-evaluation-model', `--outDir=${outDir}`,
    ], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } }));
    assert.equal(result.databaseReadOnly, true);
    assert.equal(result.request.model, 'arbitrary-evaluation-model');
    assert.deepEqual(result.captures, []);
    assert.deepEqual(fs.readFileSync(dbPath), before);
    assert.equal(result.request.imageManifest[0].width, 400);
    assert.equal(result.request.imageManifest[0].height, 200);
    assert.equal(result.request.imageManifest[0].kind, 'overview');
    assert.equal(result.request.sourceReferences[0].imageId, 'photo-1:overview');
    assert.ok(fs.existsSync(path.join(outDir, 'input-1.jpg')));
    assert.ok(fs.existsSync(path.join(outDir, 'response-schema.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'source-references.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'independent-observations.json')));
});
