const Database = require('better-sqlite3');
const { PHOTO_ANALYSIS_SCHEMA_SQL } = require('../../dist/core/src/data/schema/photoAnalysis.js');
const { PHOTO_ANALYSIS_DISPLAY_SQL } = require('../../dist/core/src/data/schema/photoAnalysisDisplay.js');
const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
let sequence = 0;

function setup(t) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE assets(id TEXT PRIMARY KEY, caption TEXT, asset_identity_guid TEXT);
        INSERT INTO assets VALUES('asset-1', 'unused old caption', 'identity-1'),('asset-2',NULL,'identity-2');
        CREATE TABLE visual_regions(id TEXT PRIMARY KEY, asset_identity_guid TEXT NOT NULL);
        CREATE TABLE faces(id TEXT PRIMARY KEY, visual_region_id TEXT NOT NULL REFERENCES visual_regions(id));
        CREATE TABLE people(id TEXT PRIMARY KEY);
        INSERT INTO visual_regions VALUES('face-region-1','identity-1'),('face-region-2','identity-2');
        INSERT INTO faces VALUES('canonical-face-id','face-region-1'),('other-photo-face','face-region-2');
        INSERT INTO people VALUES('known-person');`);
    db.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    db.exec(PHOTO_ANALYSIS_DISPLAY_SQL);
    t.after(() => db.close());
    return { db, manager: { getDb: () => db } };
}

function add(manager, input) {
    const { field, value, stage = 'scout', kind = 'hypothesis', subjectId = null, confidence = 'medium',
        supersedesId = null, assetId = 'asset-1', evidence = [], contradictions = [], targets = [], telemetry = {} } = input;
    const sourceId = `source-${++sequence}`;
    const runId = persistAnalysisRun(manager, { assetId, stage, provider: stage === 'user' ? 'user' : 'test',
        modelVersion: null, promptVersion: 'test-1', targets, telemetry,
        sources: [{ id: sourceId, assetId, kind: stage === 'user' ? 'user' : 'image', refId: sourceId, text: 'Test evidence source' }],
        result: { claims: [{ field, value, stage, subjectId, confidence, kind, supersedesId,
            evidence, contradictions, sourceIds: [sourceId] }].map(({ stage: _ignored, ...claim }) => claim),
            regions: [], refinementOpportunities: [] } });
    return loadAnalysis(manager, assetId).claims.find(claim => claim.runId === runId);
}

module.exports = { setup, add, loadAnalysis };
