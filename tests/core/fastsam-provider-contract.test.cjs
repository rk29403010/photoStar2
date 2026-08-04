const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ort = require('onnxruntime-node');

function tensors(score = 0.9) {
    const detection = new Float32Array(37);
    detection[0] = 512; detection[1] = 512; detection[2] = 800; detection[3] = 800; detection[4] = score; detection[5] = 10;
    const prototype = new Float32Array(32 * 256 * 256);
    prototype.fill(1, 0, 256 * 256);
    return { output0: new ort.Tensor('float32', detection, [1, 37, 1]), '467': new ort.Tensor('float32', prototype, [1, 32, 256, 256]) };
}

test('FastSAM uses one image feed and selects reconstructed candidates with prompts', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-fastsam-'));
    const model = path.join(temporary, 'fastsam-s-fp32.onnx');
    fs.writeFileSync(model, 'fixture');
    const feeds = [];
    try {
        const { FastSamSegmentationProvider } = await import('../../dist/core/src/services/segmentation/fastSamSegmentationProvider.js');
        const session = { inputNames: ['images'], run: async (feed) => { feeds.push(feed); return tensors(); } };
        const provider = new FastSamSegmentationProvider({ modelPath: model, sessionFactory: async () => session, verifyChecksum: false });
        const prepared = await provider.prepare({ pixels: new Float32Array(3 * 1024 * 1024), width: 1024, height: 1024, sourceWidth: 100, sourceHeight: 100, scale: 10, padX: 0, padY: 0 });
        const masks = await provider.segment(prepared, { positivePoints: [{ x: 0.5, y: 0.5 }], negativePoints: [{ x: 0.01, y: 0.01 }], box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
        assert.equal(masks.length, 1);
        assert.deepEqual(Object.keys(feeds[0]), ['images']);
        assert.equal('point_coords' in feeds[0], false);
        assert.equal('point_labels' in feeds[0], false);
        assert.deepEqual(feeds[0].images.dims, [1, 3, 1024, 1024]);
        await provider.dispose();
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('FastSAM rejects a graph signature that looks like a SAM point decoder', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-fastsam-'));
    const model = path.join(temporary, 'fastsam-s-fp32.onnx');
    fs.writeFileSync(model, 'fixture');
    try {
        const { FastSamSegmentationProvider } = await import('../../dist/core/src/services/segmentation/fastSamSegmentationProvider.js');
        const provider = new FastSamSegmentationProvider({ modelPath: model, sessionFactory: async () => ({ inputNames: ['images', 'point_coords', 'point_labels'], run: async () => tensors() }), verifyChecksum: false });
        const prepared = await provider.prepare({ pixels: new Float32Array(3 * 1024 * 1024), width: 1024, height: 1024 });
        await assert.rejects(() => provider.automaticCandidates(prepared), /exactly one image tensor/);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('FastSAM retains a useful model-native proposal above the local 0.25 threshold', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-fastsam-'));
    const model = path.join(temporary, 'fastsam-s-fp32.onnx');
    fs.writeFileSync(model, 'fixture');
    try {
        const { FastSamSegmentationProvider } = await import('../../dist/core/src/services/segmentation/fastSamSegmentationProvider.js');
        const provider = new FastSamSegmentationProvider({ modelPath: model, sessionFactory: async () => ({ inputNames: ['images'], run: async () => tensors(0.3) }), verifyChecksum: false });
        const prepared = await provider.prepare({ pixels: new Float32Array(3 * 1024 * 1024), width: 1024, height: 1024, sourceWidth: 100, sourceHeight: 100, scale: 10, padX: 0, padY: 0 });
        assert.equal((await provider.automaticCandidates(prepared)).length, 1);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
