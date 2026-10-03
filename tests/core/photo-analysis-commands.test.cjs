const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require.cache[require.resolve('keytar')] = { id: require.resolve('keytar'), filename: require.resolve('keytar'), loaded: true,
    exports: { getPassword: async () => null, setPassword: async () => {}, deletePassword: async () => true } };
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const { handleSystemCommand } = require('../../dist/core/src/services/handlers.js');
const { recordUserTruth } = require('../../dist/core/src/services/photoAnalysis/userTruth.js');
const { persistAnalysisRun } = require('../../dist/core/src/services/photoAnalysis/repository.js');

function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-analysis-commands-'));
    const manager = new DatabaseManager(directory);
    manager.getDb().prepare('INSERT INTO assets(id,original_path) VALUES (?,?)').run('photo', 'C:/photos/archive.jpg');
    t.after(() => { manager.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    return { manager, directory };
}
function command(setup, name, payload) {
    let response;
    handleSystemCommand({ id: 'command', command: name, payload, dbManager: setup.manager, eventBus: { emit() {} }, activeJobs: new Map(), LIB_DIR: setup.directory,
        respond: (_id, status, data, error) => { response = { status, data, error }; } });
    return response;
}
test('application detail and gallery read the new resolved claims, while evidence includes attribution', t => {
    const setup = fixture(t);
    const confirmed = recordUserTruth(setup.manager, { assetId: 'photo', field: 'caption', value: 'A confirmed family photograph', userId: 'test-reviewer' });
    const detail = command(setup, 'get_asset_detail', { assetId: 'photo', includeEvidence: true });
    assert.equal(detail.status, 'ok', detail.error);
    assert.equal(detail.data.asset.caption, confirmed.claim.value);
    assert.equal(detail.data.asset.photo_metadata.analysis.winners[0].kind, 'user_confirmed');
    assert.ok(detail.data.asset.photo_metadata.analysis.sources.some(source => source.refId === 'test-reviewer'));
    const list = command(setup, 'get_assets', { detailLevel: 'gallery', limit: 10, withGroupCounts: false });
    assert.equal(list.status, 'ok', list.error); assert.equal(list.data.assets[0].caption, confirmed.claim.value);
});
test('user corrections remain authoritative against later AI and unsupported fields do not write truth', t => {
    const setup = fixture(t);
    const response = command(setup, 'record_photo_analysis_truth', { assetId: 'photo', field: 'date', value: { start: '1976-12-25', end: '1976-12-25', label: 'Christmas 1976' }, userId: 'test-reviewer' });
    assert.equal(response.status, 'ok', response.error);
    persistAnalysisRun(setup.manager, { assetId: 'photo', stage: 'scout', provider: 'test', modelVersion: 'test-model', promptVersion: 'test',
        sources: [{ id: 'visual', assetId: 'photo', kind: 'image', refId: 'overview', text: 'Overview' }],
        result: { claims: [{ field: 'date', subjectId: null, value: { start: '1920-01-01', end: '1930-12-31', label: '1920s' }, kind: 'hypothesis', confidence: 'low', evidence: [], contradictions: [], sourceIds: ['visual'], supersedesId: null }], regions: [], refinementOpportunities: [] } });
    const read = command(setup, 'get_photo_analysis', { assetId: 'photo' });
    assert.equal(read.data.analysis.winners[0].value.label, 'Christmas 1976');
    assert.equal(command(setup, 'record_photo_analysis_truth', { assetId: 'photo', field: 'discard', value: true, userId: 'test-reviewer' }).status, 'error');
    const second = command(setup, 'record_photo_metadata_assertion', { assetId: 'photo', fieldPath: 'caption', value: 'Corrected caption', userId: 'test-reviewer' });
    assert.equal(second.status, 'ok', second.error); assert.equal(second.data.manualAssertion.kind, 'user_confirmed');
});
