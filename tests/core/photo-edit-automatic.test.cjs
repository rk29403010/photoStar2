const assert = require('node:assert/strict');
const test = require('node:test');

function image(width, height, pixel) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const [red, green, blue, alpha = 255] = pixel(x, y);
            data.set([red, green, blue, alpha], offset);
        }
    }
    return data;
}

const emptyContext = {
    attentionBoxes: [],
    faceBoxes: [],
    frameBox: null,
    sceneHint: null,
};

test('automatic analysis lifts dark photos and protects clipped highlights', async () => {
    const { analyzePhotoPixels } = await import('../../src/shared/photoEditing/automatic.ts');
    const data = image(40, 30, (x) => x === 39 ? [255, 255, 255] : [52, 52, 52]);
    const analysis = analyzePhotoPixels(data, 40, 30, emptyContext);

    assert.ok(analysis.tune.brightness > 0);
    assert.ok(analysis.tune.shadows > 0);
    assert.ok(analysis.tune.highlights <= 0);
    assert.equal(analysis.scene, 'landscape');
});

test('automatic white balance detects a blue cast conservatively', async () => {
    const { analyzePhotoPixels } = await import('../../src/shared/photoEditing/automatic.ts');
    const data = image(30, 30, () => [92, 118, 174]);
    const analysis = analyzePhotoPixels(data, 30, 30, emptyContext);

    assert.ok(analysis.tune.temperature > 0);
    assert.ok(analysis.tune.temperature <= 28);
    assert.ok(Math.abs(analysis.tune.tint) <= 20);
});

test('automatic exposure weights a detected face without losing global measurements', async () => {
    const { analyzePhotoPixels } = await import('../../src/shared/photoEditing/automatic.ts');
    const face = { x: 0.35, y: 0.25, width: 0.3, height: 0.5 };
    const data = image(60, 40, (x, y) => x >= 21 && x < 39 && y >= 10 && y < 30
        ? [62, 58, 54]
        : [178, 180, 182]);
    const analysis = analyzePhotoPixels(data, 60, 40, { ...emptyContext, faceBoxes: [face] });

    assert.equal(analysis.scene, 'portrait');
    assert.ok(analysis.subjectMedian < analysis.globalMedian);
    assert.ok(analysis.tune.brightness > 0);
});

test('frame crop uses the ingest boundary and ignores nearly full-frame boxes', async () => {
    const { frameCropBox } = await import('../../src/shared/photoEditing/automatic.ts');
    const crop = frameCropBox({ ...emptyContext, frameBox: { x: 0.08, y: 0.1, width: 0.84, height: 0.8 } });

    assert.ok(crop.x > 0.08);
    assert.ok(crop.y > 0.1);
    assert.ok(crop.width < 0.84);
    assert.equal(frameCropBox({ ...emptyContext, frameBox: { x: 0, y: 0, width: 1, height: 1 } }), null);
});

test('lightweight attention crop follows detailed content and blank images stay uncropped', async () => {
    const { analyzePhotoPixels } = await import('../../src/shared/photoEditing/automatic.ts');
    const detailed = image(80, 60, (x, y) => x > 52 && y > 18 && y < 44
        ? [(x + y) % 2 ? 255 : 20, 70, 30]
        : [110, 110, 110]);
    const blank = image(80, 60, () => [110, 110, 110]);

    assert.ok(analyzePhotoPixels(detailed, 80, 60, emptyContext).attentionCrop.x > 0.1);
    assert.equal(analyzePhotoPixels(blank, 80, 60, emptyContext).attentionCrop, null);
});

test('Tune Image preserves alpha, is neutral at zero, and maps tonal boundaries', async () => {
    const { applyTuneImagePixels, TUNE_IMAGE_DEFAULTS } = await import('../../src/shared/photoEditing/tune.ts');
    const source = new Uint8ClampedArray([20, 20, 20, 71, 220, 220, 220, 93]);
    assert.deepEqual(Array.from(applyTuneImagePixels(source, TUNE_IMAGE_DEFAULTS)), Array.from(source));
    const output = applyTuneImagePixels(source, { blackPoint: 30, whitePoint: 30 });

    assert.equal(output[3], 71);
    assert.equal(output[7], 93);
    assert.ok(output[0] < 20);
    assert.ok(output[4] > 220);
});

test('Tune Image targets overlapping tonal ranges and keeps colour controls distinct', async () => {
    const { applyTuneImagePixels } = await import('../../src/shared/photoEditing/tune.ts');
    const ramp = new Uint8ClampedArray([30, 30, 30, 255, 128, 128, 128, 255, 225, 225, 225, 255]);
    const shadows = applyTuneImagePixels(ramp, { shadows: 40 });
    const midtones = applyTuneImagePixels(ramp, { midtones: 40 });
    const highlights = applyTuneImagePixels(ramp, { highlights: 40 });
    assert.ok(shadows[0] - ramp[0] > shadows[4] - ramp[4]);
    assert.ok(midtones[4] - ramp[4] > midtones[0] - ramp[0]);
    assert.ok(highlights[8] - ramp[8] > highlights[4] - ramp[4]);
    const colour = new Uint8ClampedArray([100, 150, 200, 255]);
    assert.notDeepEqual(Array.from(applyTuneImagePixels(colour, { temperature: 40 })), Array.from(applyTuneImagePixels(colour, { hue: 40 })));
    assert.notDeepEqual(Array.from(applyTuneImagePixels(colour, { tint: 40 })), Array.from(applyTuneImagePixels(colour, { hue: 40 })));
});

test('Tune Image brightness is a relative exposure adjustment rather than an additive blowout', async () => {
    const { applyTuneImagePixels } = await import('../../src/shared/photoEditing/tune.ts');
    const source = new Uint8ClampedArray([100, 120, 140, 255]);
    const output = applyTuneImagePixels(source, { brightness: 40 });

    assert.ok(output[0] > source[0]);
    assert.ok(output[1] > source[1]);
    assert.ok(output[2] > source[2]);
    assert.ok(output[2] < 180);
    assert.equal(output[3], 255);
});
