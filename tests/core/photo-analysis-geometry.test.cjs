const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const geometry = require('../../dist/core/src/services/photoAnalysis/geometry.js');
const { prepareAnalysisImages } = require('../../dist/core/src/services/photoAnalysis/imageInputs.js');

function approximate(actual, expected) {
    for (const key of Object.keys(expected)) {
        assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key}: ${actual[key]} != ${expected[key]}`);
    }
}

test('model named corners map only through their declared crop manifest', () => {
    const sources = [{ id: 'sign', assetId: 'photo', kind: 'detail', width: 400, height: 200,
        fullPhotoBox: { x: 0.25, y: 0.4, width: 0.5, height: 0.2 } }];
    approximate(geometry.mapModelBoxToFullPhoto({ sourceImageId: 'sign', sources,
        box: { left: 100, top: 200, right: 800, bottom: 900 } }), { x: 0.3, y: 0.44, width: 0.35, height: 0.14 });
    assert.throws(() => geometry.mapModelBoxToFullPhoto({ sourceImageId: 'missing', sources,
        box: { left: 0, top: 0, right: 1000, bottom: 1000 } }), /source image ID/);
    assert.throws(() => geometry.mapModelBoxToFullPhoto({ sourceImageId: 'sign', sources: [...sources, ...sources],
        box: { left: 0, top: 0, right: 1000, bottom: 1000 } }), /source image ID/);
});

test('invalid geometry cannot silently change scale, axis order or orientation', () => {
    for (const box of [
        { left: 500, top: 200, right: 100, bottom: 800 },
        { left: -1, top: 0, right: 1000, bottom: 1000 },
        { left: 0, top: 0, right: 1001, bottom: 1000 },
        { left: 0, top: 0, right: NaN, bottom: 1000 },
        [0, 0, 1000, 1000],
        { x: 0, y: 0, width: 1000, height: 1000 },
    ]) {assert.throws(() => geometry.assertModelBoundingBox(box));}
    for (const box of [
        { x: 0, y: 0, width: 1000, height: 1000 },
        { x: 0, y: 0, width: 0, height: 1 },
        { x: 0.9, y: 0, width: 0.2, height: 1 },
        { x: NaN, y: 0, width: 1, height: 1 },
    ]) {assert.throws(() => geometry.assertCanonicalPhotoBox(box));}
});

test('outward pixel rounding is retained for exact crop-to-full-photo mapping', () => {
    const dimensions = { width: 101, height: 57 };
    const crop = geometry.canonicalBoxToPixelCrop({ x: 0.123, y: 0.22, width: 0.31, height: 0.19 }, dimensions);
    assert.deepEqual(crop, { left: 12, top: 12, width: 32, height: 12 });
    const footprint = geometry.pixelCropToCanonicalBox(crop, dimensions);
    approximate(footprint, { x: 12 / 101, y: 12 / 57, width: 32 / 101, height: 12 / 57 });
    assert.throws(() => geometry.pixelCropToCanonicalBox({ left: 100, top: 0, width: 2, height: 1 }, dimensions));
    assert.throws(() => geometry.canonicalBoxToPixelCrop(footprint, { width: 0, height: 57 }));
});

test('Face-ID association depends on canonical IDs, never location or response order', () => {
    const first = { faceId: 'face-a', box: { x: 0.7, y: 0.2, width: 0.1, height: 0.1 } };
    const second = { faceId: 'face-b', box: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 } };
    const faces = geometry.assignModelFaceIds([second, first]);
    assert.deepEqual(faces.map(face => [face.faceId, face.modelFaceId]), [['face-a', 'F1'], ['face-b', 'F2']]);
    assert.deepEqual(geometry.assignModelFaceIds([first, second]), faces);
    assert.equal(geometry.resolveModelFaceId('F2', faces).faceId, 'face-b');
    assert.throws(() => geometry.resolveModelFaceId('F3', faces), /supplied Face ID/);
    assert.throws(() => geometry.assignModelFaceIds([first, first]), /unique canonical/);
});

async function fixture(directory, orientation) {
    const pixels = Buffer.alloc(80 * 40 * 3);
    const colours = [[240, 10, 10], [10, 10, 240], [10, 240, 10], [240, 240, 10]];
    for (let y = 0; y < 40; y += 1) {for (let x = 0; x < 80; x += 1) {
        const colour = colours[Number(x >= 40) + 2 * Number(y >= 20)];
        for (let channel = 0; channel < 3; channel += 1) {pixels[(y * 80 + x) * 3 + channel] = colour[channel];}
    }}
    const filename = path.join(directory, `oriented-${orientation}.jpg`);
    await sharp(pixels, { raw: { width: 80, height: 40, channels: 3 } }).jpeg({ quality: 100 })
        .withMetadata({ orientation }).toFile(filename);
    return { filename, colours };
}

test('all eight EXIF orientations share one oriented source and preserve detail crops', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-geometry-'));
    try {
        const expectedTopLeft = [0, 1, 3, 2, 0, 2, 3, 1];
        for (let orientation = 1; orientation <= 8; orientation += 1) {
            const { filename, colours } = await fixture(directory, orientation);
            const result = await prepareAnalysisImages({ assetId: 'photo', imagePath: filename,
                details: [{ regionId: 'top-left', box: { x: 0, y: 0, width: 0.5, height: 0.5 } }],
                faces: [{ faceId: 'face-a', box: { x: 0, y: 0, width: 0.25, height: 0.25 } }],
                limits: { overview: 20, face: 512, detail: 2048, facePadding: 0 } });
            assert.deepEqual(result.dimensions, orientation < 5 ? { width: 80, height: 40 } : { width: 40, height: 80 });
            assert.equal(Math.max(result.sources[0].width, result.sources[0].height), 20);
            assert.equal(result.sources[1].faceId, 'face-a');
            assert.equal(result.faces[0].modelFaceId, 'F1');
            assert.equal(Math.max(result.sources[2].width, result.sources[2].height), 40);
            assert.deepEqual(result.sources[2].fullPhotoBox, { x: 0, y: 0, width: 0.5, height: 0.5 });
            const decoded = await sharp(Buffer.from(result.parts[2].data, 'base64')).raw().toBuffer({ resolveWithObject: true });
            const index = (Math.floor(decoded.info.height / 2) * decoded.info.width + Math.floor(decoded.info.width / 2)) * 3;
            const expected = colours[expectedTopLeft[orientation - 1]];
            for (let channel = 0; channel < 3; channel += 1) {assert.ok(Math.abs(decoded.data[index + channel] - expected[channel]) < 15);}
        }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('image preparation rejects unreadable input and invalid crop requests without a geometry fallback', async () => {
    await assert.rejects(prepareAnalysisImages({ assetId: 'photo', imagePath: 'missing-photo.jpg' }));
    await assert.rejects(prepareAnalysisImages({ assetId: 'photo', imagePath: 'missing-photo.jpg', limits: { overview: 0 } }), /integer/);
    await assert.rejects(prepareAnalysisImages({ assetId: 'photo', imagePath: 'missing-photo.jpg', details: [
        { regionId: 'a', box: { x: 0, y: 0, width: 1, height: 1 } },
        { regionId: 'a', box: { x: 0, y: 0, width: 1, height: 1 } },
    ] }), /unique region IDs/);
});

test('local detector crops oriented pixels and maps through exact integer crop footprint', async () => {
    const { RetinaFaceDetector } = require('../../dist/core/src/services/faces/retinaFaceDetector.js');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-detector-'));
    try {
        const { filename } = await fixture(directory, 6);
        const detector = new RetinaFaceDetector();
        let modelTensor;
        detector.session = { run: async input => { modelTensor = input['input.1']; return {}; } };
        detector.postProcess = (_results, width, height) => {
            assert.equal(width, 13); assert.equal(height, 25);
            return [{ score: 0.99, box: [0, 0, 1, 1], landmarks: [{ x: 0.5, y: 0.5 }] }];
        };
        const [face] = await detector.detect(filename, { x: 0.1, y: 0.1, width: 0.31, height: 0.31 });
        approximate({ x: face.box[0], y: face.box[1], width: face.box[2] - face.box[0], height: face.box[3] - face.box[1] },
            { x: 4 / 40, y: 8 / 80, width: 13 / 40, height: 25 / 80 });
        approximate(face.landmarks[0], { x: 10.5 / 40, y: 20.5 / 80 });
        assert.ok(modelTensor.data[640 * 640] > 0.5);
        assert.ok(modelTensor.data[0] < -0.5);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('border interiors feeding face crops use oriented full-photo geometry', async () => {
    const { detectSimpleBorder } = require('../../dist/core/src/services/photoMetadata/borderDetection.js');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-border-'));
    try {
        const filename = path.join(directory, 'border.tiff');
        const pixels = Buffer.alloc(100 * 80 * 3, 255);
        for (let y = 8; y < 64; y += 1) {for (let x = 20; x < 70; x += 1) {
            for (let channel = 0; channel < 3; channel += 1) {pixels[(y * 100 + x) * 3 + channel] = 30;}
        }}
        await sharp(pixels, { raw: { width: 100, height: 80, channels: 3 } })
            .tiff({ compression: 'deflate' }).withMetadata({ orientation: 6 }).toFile(filename);
        approximate(await detectSimpleBorder(filename), { x: 0.2, y: 0.2, width: 0.7, height: 0.5 });
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
