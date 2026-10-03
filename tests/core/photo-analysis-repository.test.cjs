const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { PHOTO_ANALYSIS_SCHEMA_SQL } = require('../../dist/core/src/data/schema/photoAnalysis.js');
const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { snapshotDurablePhotoAnalysisState, restoreDurablePhotoAnalysisState } = require('../../dist/core/src/data/photoAnalysisResetState.js');

function fixture(t) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec("CREATE TABLE assets (id TEXT PRIMARY KEY); INSERT INTO assets VALUES ('asset-1'), ('asset-2');");
    db.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    t.after(() => db.close());
    return { db, manager: { getDb: () => db } };
}

function source(id = 'visual-1', assetId = 'asset-1') {
    return { id, assetId, kind: 'image', refId: 'photo', text: 'Visible clothing' };
}

function claim(overrides = {}) {
    return { field: 'date', subjectId: null, value: { start: '1920-01-01', end: '1929-12-31', label: '1920s' },
        kind: 'hypothesis', confidence: 'medium', evidence: [{ text: 'Clothing consistent with late 1920s', sourceIds: ['visual-1'] }],
        contradictions: [], sourceIds: ['visual-1'], supersedesId: null, ...overrides };
}

function run(manager, overrides = {}) {
    const { claims = [claim()], regions = [], opportunities = [], ...input } = overrides;
    return persistAnalysisRun(manager, { assetId: 'asset-1', stage: 'scout', provider: 'google',
        modelVersion: 'configurable-model', promptVersion: 'scout-v1', sources: [source()],
        result: { claims, regions, refinementOpportunities: opportunities }, ...input });
}

test('persists field evidence, contradictions, provenance and actual telemetry', t => {
    const { manager } = fixture(t);
    const telemetry = { inputTokens: 431, outputTokens: 80, latencyMs: 321, retries: 1 };
    run(manager, { telemetry, sources: [source(), source('filename-1')], claims: [claim({
        evidence: [{ text: 'Clothing consistent with late 1920s', sourceIds: ['visual-1', 'filename-1'] }],
        contradictions: [{ text: 'Filename says 1936', sourceIds: ['filename-1'] }],
    })] });
    const analysis = loadAnalysis(manager, 'asset-1');
    assert.deepEqual(analysis.winners[0].evidence[0].sourceIds, ['visual-1', 'filename-1']);
    assert.equal(analysis.winners[0].contradictions[0].text, 'Filename says 1936');
    assert.equal(analysis.winners[0].provider, 'google');
    assert.deepEqual(analysis.runs[0].telemetry, telemetry);
});

test('refine supersedes only a targeted exact field and retains unrelated fields', t => {
    const { manager } = fixture(t);
    run(manager, { claims: [claim(), claim({ field: 'caption', value: 'Family outside a house' })] });
    const previous = loadAnalysis(manager, 'asset-1').claims.find(item => item.field === 'date');
    run(manager, { stage: 'refine', sources: [], targets: [{ field: 'date', subjectId: null, question: 'Which decade?', concern: 'date' }],
        claims: [claim({ value: { start: '1927-01-01', end: '1929-12-31', label: 'Late 1920s' },
            kind: 'inferred_conclusion', supersedesId: previous.id })] });
    const analysis = loadAnalysis(manager, 'asset-1');
    assert.equal(analysis.claims.find(item => item.id === previous.id).state, 'superseded');
    assert.equal(analysis.winners.find(item => item.field === 'date').value.label, 'Late 1920s');
    assert.equal(analysis.winners.find(item => item.field === 'caption').value, 'Family outside a house');
    assert.throws(() => run(manager, { stage: 'refine', sources: [], targets: [], claims: [claim()] }), /targeted/);
});

test('a later Scout hypothesis cannot displace a targeted Refine conclusion', t => {
    const { manager } = fixture(t);
    run(manager, { stage: 'refine', targets: [{ field: 'date', subjectId: null, question: 'Which decade?', concern: 'date' }],
        claims: [claim({ value: { start: '1930-01-01', end: '1939-12-31', label: '1930s' } })] });
    run(manager, { sources: [source('visual-2')], claims: [claim({ sourceIds: ['visual-2'], evidence: [] })] });
    assert.equal(loadAnalysis(manager, 'asset-1').winners[0].value.label, '1930s');
});

test('unrelated refinement opportunities survive targeted updates and user confirmation', t => {
    const { manager } = fixture(t);
    const location = { field: 'location', subjectId: null, question: 'Which town?', concern: 'location', expectedValue: 'high', reason: 'Distinctive buildings' };
    const date = { field: 'date', subjectId: null, question: 'Which decade?', concern: 'date', expectedValue: 'high', reason: 'Date unclear' };
    run(manager, { opportunities: [location, date] });
    run(manager, { stage: 'context', sources: [], claims: [], targets: [{ field: 'date', subjectId: null, question: 'Which decade?', concern: 'date' }] });
    assert.equal(loadAnalysis(manager, 'asset-1').refinementOpportunities.length, 2);
    run(manager, { stage: 'refine', sources: [], targets: [{ field: 'date', subjectId: null, question: 'Which decade?', concern: 'date' }] });
    assert.deepEqual(loadAnalysis(manager, 'asset-1').refinementOpportunities, [location]);
});

test('user corrections outrank future Scout and Refine without deleting evidence', t => {
    const { manager, db } = fixture(t);
    run(manager);
    run(manager, { stage: 'user', sources: [source('user-1')], claims: [claim({ kind: 'user_confirmed', confidence: 'high',
        value: { start: '1931-01-01', end: '1931-12-31', label: '1931' }, sourceIds: ['user-1'], evidence: [] })] });
    const truth = loadAnalysis(manager, 'asset-1').winners[0];
    run(manager, { sources: [source('visual-2')], claims: [claim({ sourceIds: ['visual-2'], evidence: [] })] });
    assert.equal(loadAnalysis(manager, 'asset-1').winners[0].id, truth.id);
    const count = db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count;
    assert.throws(() => run(manager, { stage: 'refine', sources: [],
        targets: [{ field: 'date', subjectId: null, question: 'Change date?', concern: 'date' }],
        claims: [claim({ supersedesId: truth.id })] }), /authoritative/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count, count);
});

test('known local facts outrank AI and cannot be manufactured by Scout', t => {
    const { manager } = fixture(t);
    run(manager, { stage: 'local', claims: [claim({ kind: 'known_fact' })] });
    run(manager, { sources: [source('visual-2')], claims: [claim({ kind: 'inferred_conclusion', sourceIds: ['visual-2'], evidence: [] })] });
    assert.equal(loadAnalysis(manager, 'asset-1').winners[0].kind, 'known_fact');
    assert.throws(() => run(manager, { sources: [], claims: [claim({ kind: 'user_confirmed' })] }), /authoritative/);
    assert.throws(() => run(manager, { sources: [], claims: [claim({ kind: 'known_fact' })] }), /authoritative/);
});

test('sources cannot cross asset boundaries and failed results are atomic', t => {
    const { manager, db } = fixture(t);
    run(manager, { assetId: 'asset-2', sources: [source('other-source', 'asset-2')], claims: [] });
    assert.throws(() => run(manager, { claims: [claim({ sourceIds: ['other-source'] })] }), /this asset/);
    assert.equal(loadAnalysis(manager, 'asset-1').runs.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM analysis_sources').get().count, 1);
});

test('rejects verbose evidence, excessive contradictions and invalid field values', t => {
    const { manager } = fixture(t);
    assert.throws(() => run(manager, { claims: [claim({ evidence: [{ text: 'x'.repeat(181), sourceIds: ['visual-1'] }] })] }));
    assert.throws(() => run(manager, { claims: [claim({ contradictions: Array.from({ length: 3 }, () => ({ text: 'Conflict', sourceIds: ['visual-1'] })) })] }));
    assert.throws(() => run(manager, { claims: [claim({ value: '1920s' })] }));
    assert.equal(loadAnalysis(manager, 'asset-1').runs.length, 0);
});

test('regions map solely through their declared image crop', t => {
    const { manager } = fixture(t);
    const image = { id: 'detail-1', assetId: 'asset-1', kind: 'detail', width: 500, height: 300,
        fullPhotoBox: { x: 0.2, y: 0.4, width: 0.5, height: 0.3 } };
    run(manager, { claims: [], images: [image], sources: [], regions: [{ id: 'text-1', sourceImageId: 'detail-1',
        box: { left: 100, top: 200, right: 500, bottom: 600 }, kind: 'sign', observation: 'Visible sign', confidence: 'high' }] });
    const box = loadAnalysis(manager, 'asset-1').regions[0].fullPhotoBox;
    assert.equal(box.x, 0.25);
    assert.equal(box.y, 0.46);
    assert.equal(box.width, 0.2);
    assert.equal(box.height, 0.12);
    assert.throws(() => run(manager, { sources: [], claims: [], images: [], regions: [{ id: 'text-2', sourceImageId: 'missing',
        box: { left: 0, top: 0, right: 1000, bottom: 1000 }, kind: 'sign', observation: 'Sign', confidence: 'high' }] }), /source image ID/);
});

test('database itself constrains evidence item count and foreign asset references', t => {
    const { manager, db } = fixture(t);
    run(manager);
    const stored = loadAnalysis(manager, 'asset-1').claims[0];
    assert.throws(() => db.prepare(`INSERT INTO analysis_claim_sources
        (claim_id,asset_id,role,ordinal,source_ordinal,source_id,display_text) VALUES (?,?,'evidence',3,0,?,'too many')`)
        .run(stored.id, 'asset-1', 'visual-1'), /CHECK/);
    run(manager, { assetId: 'asset-2', sources: [source('foreign-source', 'asset-2')], claims: [] });
    assert.throws(() => db.prepare(`INSERT INTO analysis_claim_sources
        (claim_id,asset_id,role,ordinal,source_ordinal,source_id,display_text) VALUES (?,?,'evidence',1,0,?,'cross asset')`)
        .run(stored.id, 'asset-1', 'foreign-source'), /FOREIGN KEY/);
});

test('human truth and supporting immutable history survive an analysis soft rebuild', t => {
    const { manager, db } = fixture(t);
    run(manager);
    const previous = loadAnalysis(manager, 'asset-1').claims[0];
    run(manager, { stage: 'user', sources: [source('user-1')], claims: [claim({ kind: 'user_confirmed',
        sourceIds: ['user-1'], evidence: [], supersedesId: previous.id })] });
    run(manager, { assetId: 'asset-2', sources: [source('discard-machine', 'asset-2')], claims: [] });
    const before = loadAnalysis(manager, 'asset-1');
    const state = snapshotDurablePhotoAnalysisState(db);
    assert.deepEqual(state.assetIds, ['asset-1']);
    const replacement = new Database(':memory:');
    t.after(() => replacement.close());
    replacement.pragma('foreign_keys = ON');
    replacement.exec("CREATE TABLE assets (id TEXT PRIMARY KEY); INSERT INTO assets VALUES ('asset-1');");
    replacement.exec(PHOTO_ANALYSIS_SCHEMA_SQL);
    restoreDurablePhotoAnalysisState(replacement, state);
    const after = loadAnalysis({ getDb: () => replacement }, 'asset-1');
    assert.deepEqual(after, before);
    assert.equal(loadAnalysis({ getDb: () => replacement }, 'asset-2').runs.length, 0);
});
