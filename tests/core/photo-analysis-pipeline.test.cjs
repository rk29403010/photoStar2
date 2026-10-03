const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const { createStableFaceDetection } = require('../../dist/core/src/services/faces/stableFaceRepository.js');
const { runPhotoAnalysis } = require('../../dist/core/src/services/photoAnalysis/pipeline.js');
const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
const { recordUserTruth } = require('../../dist/core/src/services/photoAnalysis/userTruth.js');

async function fixture(t, withFace = false) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-pipeline-'));
    const filename = path.join(directory, 'Christmas 76.jpg');
    await sharp({ create: { width: 200, height: 120, channels: 3, background: '#556677' } }).jpeg().toFile(filename);
    const manager = new DatabaseManager(directory);
    const db = manager.getDb();
    t.after(async () => { manager.close(); await fs.rm(directory, { recursive: true, force: true }); });
    db.prepare('INSERT INTO assets (id, original_path, width, height, exif_datetime) VALUES (?, ?, ?, ?, ?)')
        .run('photo', filename, 200, 120, '2025:01:01');
    const row = db.prepare('SELECT * FROM assets WHERE id = ?').get('photo');
    const face = withFace ? createStableFaceDetection(db, {
        assetId: 'photo', sourceAnalysisGenerationId: 'local-detection',
        box: { x: 0.3, y: 0.2, width: 0.2, height: 0.3 }, sourceWidth: 200, sourceHeight: 120,
        sourceOrientation: 1, sourceModuleId: 'runtime.detect_faces', provider: 'test-local', modelVersion: '1',
    }) : null;
    return { manager, db, row, face };
}

function result(claims = [], regions = [], refinementOpportunities = []) { return { claims, regions, refinementOpportunities }; }

function sources(request) {
    return request.prompt.split('\n').flatMap(line => {
        for (const label of ['Visual sources:', 'Sources:', 'Contextual evidence:', 'Available sources:']) {
            if (line.startsWith(label)) {return JSON.parse(line.slice(label.length));}
        }
        return [];
    });
}

function claim(request, field, value, overrides = {}) {
    const source = sources(request).find(item => item.kind === 'image') ?? sources(request)[0];
    assert.ok(source, 'model must be supplied referenceable evidence sources');
    return { field, value, subjectId: null, confidence: 'medium', kind: 'hypothesis',
        evidence: [{ text: 'Visible evidence', sourceIds: [source.id] }], contradictions: [],
        sourceIds: [source.id], supersedesId: null, ...overrides };
}

function provider(respond) {
    const requests = [];
    return { requests, generateStructured: async request => {
        requests.push(request);
        return { data: await respond(request, requests.length), modelVersion: 'actual-model-version',
            usage: { promptTokenCount: 321, candidatesTokenCount: 42 },
            attempts: [{ attempt: 1, latencyMs: 20, status: 'success', requested: true }], latencyMs: 20 };
    } };
}

function options(setup, mock, overrides = {}) {
    return { dbManager: setup.manager, row: setup.row, provider: mock, model: 'configurable-model', ...overrides };
}

function confirm(setup, field, value, subjectId = null) {
    const source = { id: `user-${field}`, assetId: 'photo', kind: 'user', refId: 'user-review', text: 'User correction' };
    return persistAnalysisRun(setup.manager, { assetId: 'photo', stage: 'user', provider: 'human', modelVersion: null,
        promptVersion: 'user-1', sources: [source], result: result([{ field, value, subjectId,
            confidence: 'high', kind: 'user_confirmed', evidence: [], contradictions: [], sourceIds: [source.id], supersedesId: null }]) });
}

test('debug pipeline is strictly read-only and follows the same constrained Scout contract', async t => {
    const setup = await fixture(t);
    const mock = provider(request => result([claim(request, 'caption', 'People outdoors')]));
    const before = setup.db.prepare('SELECT total_changes() AS count').get().count;
    const output = await runPhotoAnalysis(options(setup, mock, { persist: false }));
    assert.equal(setup.db.prepare('SELECT total_changes() AS count').get().count, before);
    assert.equal(output.runId, null); assert.equal(output.analysis, undefined);
    assert.equal(output.result.claims[0].value, 'People outdoors');
    assert.ok(mock.requests[0].responseJsonSchema);
    assert.equal(mock.requests[0].images.length, 1);
    assert.ok(!mock.requests[0].prompt.includes('Christmas 76'));
    assert.ok(!mock.requests[0].prompt.includes('2025:01:01'));
});

test('read-only benchmark carries optional perception observations into Scout without writing runs', async t => {
    const setup = await fixture(t);
    const mock = provider((request, call) => call === 1
        ? result([claim(request, 'archive_clue', 'Visible station sign', { kind: 'observation' })])
        : result([claim(request, 'caption', 'People near a station')]));
    await runPhotoAnalysis(options(setup, mock, { persist: false, perceptionModel: 'perception-model' }));
    assert.equal(mock.requests.length, 2);
    assert.match(mock.requests[1].prompt, /Visible station sign/);
    assert.equal(setup.db.prepare('SELECT COUNT(*) AS count FROM analysis_runs').get().count, 0);
});

test('local and Scout runs preserve Face-ID semantics and API telemetry without AI face localisation', async t => {
    const setup = await fixture(t, true);
    const mock = provider(request => result([
        claim(request, 'caption', 'One person outdoors'),
        claim(request, 'appearance', { apparentAge: { min: 30, max: 45 }, presentation: null,
            expression: 'Smiling', clothing: 'Dark jacket' }, { subjectId: 'F1', kind: 'observation' }),
    ]));
    const output = await runPhotoAnalysis(options(setup, mock));
    assert.deepEqual(output.analysis.runs.map(run => run.stage), ['local', 'scout']);
    assert.equal(output.analysis.winners.find(item => item.field === 'appearance').subjectId, setup.face.faceId);
    assert.equal(output.faces[0].modelFaceId, 'F1');
    assert.match(mock.requests[0].prompt, /do not locate faces/);
    assert.equal(mock.requests[0].images.length, 2);
    assert.equal(output.analysis.runs[1].modelVersion, 'actual-model-version');
    assert.equal(output.analysis.runs[1].telemetry.usage.promptTokenCount, 321);
    assert.equal(output.analysis.runs[1].telemetry.attempts[0].latencyMs, 20);
    const box = setup.db.prepare('SELECT x, y, width, height FROM visual_region_geometry_generations').get();
    assert.deepEqual(box, { x: 0.3, y: 0.2, width: 0.2, height: 0.3 });
});

test('winning analysis tags use approved vocabulary and queue unknown tags once for review', async t => {
    const setup = await fixture(t);
    setup.db.prepare("INSERT INTO tag_definitions (id, canonical_label, status) VALUES ('family-tag', 'Family', 'active')").run();
    const mock = provider(request => result([claim(request, 'tags', ['family', 'Unknown clue'])]));
    await runPhotoAnalysis(options(setup, mock));
    await runPhotoAnalysis(options(setup, mock));
    const assignment = setup.db.prepare("SELECT source_kind, source_record_id FROM asset_tag_assignments WHERE asset_id = 'photo'").get();
    assert.equal(assignment.source_kind, 'analysis');
    assert.equal(loadAnalysis(setup.manager, 'photo').winners.find(item => item.field === 'tags').id, assignment.source_record_id);
    assert.equal(setup.db.prepare("SELECT COUNT(*) AS count FROM review_items WHERE review_item_type = 'tag_proposal'").get().count, 1);
    recordUserTruth(setup.manager, { assetId: 'photo', field: 'tags', value: ['Family'], userId: 'local-user' });
    assert.equal(setup.db.prepare("SELECT source_record_id FROM asset_tag_assignments WHERE asset_id = 'photo'").get().source_record_id,
        loadAnalysis(setup.manager, 'photo').winners.find(item => item.field === 'tags').id);
});

test('targeted Refine retains good caption and user-confirmed date while appending competing inference', async t => {
    const setup = await fixture(t);
    const scout = provider(request => result([claim(request, 'caption', 'A family portrait'),
        claim(request, 'date', { label: '1920s', start: '1920-01-01', end: '1929-12-31' })]));
    await runPhotoAnalysis(options(setup, scout));
    confirm(setup, 'date', { label: '1936', start: '1936-01-01', end: '1936-12-31' });
    const before = loadAnalysis(setup.manager, 'photo');
    const caption = before.winners.find(item => item.field === 'caption');
    const truth = before.winners.find(item => item.field === 'date');
    const refine = provider(request => result([claim(request, 'date', { label: 'Late 1920s', start: '1927-01-01', end: '1929-12-31' },
        { kind: 'inferred_conclusion' })]));
    const output = await runPhotoAnalysis(options(setup, refine, { metadataPass: 'refine',
        targets: [{ field: 'date', subjectId: null, question: 'Investigate conflicting date', concern: 'contradiction' }] }));
    assert.equal(output.analysis.winners.find(item => item.field === 'caption').id, caption.id);
    assert.equal(output.analysis.winners.find(item => item.field === 'date').id, truth.id);
    assert.equal(output.analysis.claims.filter(item => item.field === 'date').length, 3);
    assert.ok(!refine.requests[0].prompt.includes('"label":"1920s"'));
    assert.match(refine.requests[0].prompt, /1936/);
    const unrelated = provider(request => result([claim(request, 'caption', 'Unrequested caption')]));
    await assert.rejects(runPhotoAnalysis(options(setup, unrelated, { metadataPass: 'refine',
        targets: [{ field: 'date', subjectId: null, question: 'Which year?', concern: 'date' }] })), /outside refine scope|unrelated/);
    assert.equal(loadAnalysis(setup.manager, 'photo').winners.find(item => item.field === 'caption').id, caption.id);
});

test('identity Refine evaluates supplied known people and rejects invented names or Person IDs', async t => {
    const setup = await fixture(t, true);
    setup.db.prepare("INSERT INTO people (id, name, lifecycle_status) VALUES ('person-known', 'Known Person', 'confirmed')").run();
    confirm(setup, 'identity', { personId: 'person-known' }, setup.face.faceId);
    const targets = [{ field: 'identity', subjectId: setup.face.faceId, question: 'Assess supplied candidate', concern: 'identity' }];
    const valid = provider(request => {
        assert.match(request.prompt, /Known Person/);
        return result([claim(request, 'identity', { personId: 'person-known' }, { subjectId: 'F1', kind: 'inferred_conclusion' })]);
    });
    const output = await runPhotoAnalysis(options(setup, valid, { metadataPass: 'refine', targets }));
    assert.equal(output.result.claims[0].subjectId, setup.face.faceId);
    assert.equal(output.analysis.winners.find(item => item.field === 'identity').kind, 'user_confirmed');
    const invented = provider(request => result([claim(request, 'identity', { personId: 'arbitrary-new-person' }, { subjectId: 'F1' })]));
    await assert.rejects(runPhotoAnalysis(options(setup, invented, { metadataPass: 'refine', targets })), /candidate set/);
    assert.equal(setup.db.prepare("SELECT COUNT(*) AS count FROM people WHERE id = 'arbitrary-new-person'").get().count, 0);
});

test('invalid evidence references and model boxes reject the model run without partially saving its claims', async t => {
    const setup = await fixture(t);
    const invalidSource = provider(request => result([claim(request, 'caption', 'Should not persist', { sourceIds: ['missing-source'] })]));
    await assert.rejects(runPhotoAnalysis(options(setup, invalidSource)), /source reference/);
    const invalidBox = provider(request => result([claim(request, 'caption', 'Should not persist')], [{
        id: 'sign', sourceImageId: request.images[0].id, box: { left: 500, top: 0, right: 100, bottom: 1000 },
        kind: 'sign', observation: 'Visible sign', confidence: 'medium',
    }]));
    await assert.rejects(runPhotoAnalysis(options(setup, invalidBox)), /positive area/);
    assert.equal(setup.db.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE stage = 'scout' AND status = 'successful'").get().count, 0);
    assert.equal(setup.db.prepare("SELECT COUNT(*) AS count FROM analysis_claims WHERE field = 'caption'").get().count, 0);
    assert.equal(setup.db.prepare('SELECT COUNT(*) AS count FROM analysis_regions').get().count, 0);
});

test('perception localises text independently and later targeted Refine receives its exact detail crop', async t => {
    const setup = await fixture(t);
    const mock = provider((request, call) => call === 1 ? result([
        claim(request, 'text', { transcription: 'PARIS', language: 'French' }, { subjectId: 'sign', kind: 'observation' }),
    ], [{ id: 'sign', sourceImageId: request.images[0].id, box: { left: 100, top: 200, right: 600, bottom: 700 },
        kind: 'sign', observation: 'Printed sign', confidence: 'high' }]) : result([claim(request, 'caption', 'People near a sign')]));
    const first = await runPhotoAnalysis(options(setup, mock, { perceptionModel: 'perception-model' }));
    assert.deepEqual(first.analysis.runs.map(run => run.stage), ['local', 'perception', 'scout']);
    const originalRegionId = first.analysis.regions[0].id;
    const rerun = provider((request, call) => call === 1 ? result([
        claim(request, 'text', { transcription: 'PARIS', language: 'French' }, { subjectId: 'sign', kind: 'observation' }),
    ], [{ id: 'sign', sourceImageId: request.images[0].id, box: { left: 100, top: 200, right: 600, bottom: 700 },
        kind: 'sign', observation: 'Printed sign', confidence: 'high' }]) : result([claim(request, 'caption', 'People near a sign')]));
    const repeated = await runPhotoAnalysis(options(setup, rerun, { perceptionModel: 'perception-model' }));
    const latestRegionId = repeated.analysis.regions.at(-1).id;
    assert.notEqual(latestRegionId, originalRegionId);
    assert.equal(new Set(repeated.analysis.regions.map(region => region.id)).size, 2);
    const refine = provider(request => {
        assert.equal(request.images.length, 2);
        assert.ok(request.images.some(image => image.id.endsWith(`:detail:${latestRegionId}`)));
        assert.ok(!request.images.some(image => image.id.endsWith(`:detail:${originalRegionId}`)));
        assert.match(request.prompt, /PARIS/);
        return result([claim(request, 'text', { transcription: 'PARIS', language: 'French' }, { subjectId: latestRegionId, kind: 'inferred_conclusion' })]);
    });
    const second = await runPhotoAnalysis(options(setup, refine, { metadataPass: 'refine',
        targets: [{ field: 'text', subjectId: latestRegionId, question: 'Check sign transcription', concern: 'transcription' }] }));
    const image = second.images.find(item => item.kind === 'detail');
    assert.deepEqual(image.fullPhotoBox, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 });
    assert.equal(image.width, 100); assert.equal(image.height, 60);
    assert.equal(second.analysis.winners.find(item => item.field === 'caption').value, 'People near a sign');
});
