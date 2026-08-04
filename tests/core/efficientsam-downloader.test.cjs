const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install } = require('../../tooling/scripts/core/download_efficientsam_models.cjs');

function fixture(bytes) {
    return { file: 'model.onnx', url: 'https://example.test/model.onnx', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

test('EfficientSAM downloader installs verified content atomically and reuses a valid destination', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-model-download-'));
    const bytes = Buffer.from('verified-model');
    const model = fixture(bytes);
    try {
        const response = { ok: true, status: 200, arrayBuffer: async () => bytes };
        assert.equal((await install(model, { target: directory, fetchImpl: async () => response })).installed, true);
        assert.equal(fs.readFileSync(path.join(directory, model.file)).equals(bytes), true);
        assert.equal((await install(model, { target: directory, fetchImpl: async () => { throw new Error('must not fetch'); } })).installed, false);
        assert.equal(fs.existsSync(path.join(directory, `${model.file}.part`)), false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('EfficientSAM downloader rejects corrupt content and removes partial files', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-model-download-'));
    const model = fixture(Buffer.from('expected'));
    try {
        await assert.rejects(() => install(model, { target: directory, fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('corrupt') }) }), /checksum mismatch/);
        assert.equal(fs.existsSync(path.join(directory, model.file)), false);
        assert.equal(fs.existsSync(path.join(directory, `${model.file}.part`)), false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
