const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

function operation(tool, values, extras = {}) {
    return { id: `${tool}-${Math.random()}`, tool, name: tool, enabled: true, maskId: null, values, ...extras };
}

function sampleRed({ data, info }, x, y) {
    return data[(y * info.width + x) * info.channels];
}

test('photo edit renderer applies geometry in stack order without mutating the source', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#808080' } }).png().toBuffer();
    const output = await renderPhotoEdit(source, [
        operation('crop', { x: 0.1, y: 0.25, width: 0.5, height: 0.5 }),
        operation('rotate', { angle: 90 }),
    ], []);

    const sourceMetadata = await sharp(source).metadata();
    const outputMetadata = await sharp(output).metadata();
    assert.equal(sourceMetadata.width, 100);
    assert.equal(sourceMetadata.height, 80);
    assert.equal(outputMetadata.width, 50);
    assert.equal(outputMetadata.height, 50);
});

test('rotation supports fixed and pivot-aware expanded canvases', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#cc3322' } }).png().toBuffer();
    const fixed = await renderPhotoEdit(source, [operation('rotate', { angle: 90, expandCanvas: false, fillMode: 0, pivotX: 0, pivotY: 0 })], []);
    const expandedCentre = await renderPhotoEdit(source, [operation('rotate', { angle: 90, expandCanvas: true, fillMode: 0, pivotX: 0.5, pivotY: 0.5 })], []);
    const expandedCorner = await renderPhotoEdit(source, [operation('rotate', { angle: 90, expandCanvas: true, fillMode: 0, pivotX: 0, pivotY: 0 })], []);
    assert.deepEqual(await sharp(fixed).metadata().then(({ width, height }) => ({ width, height })), { width: 100, height: 50 });
    assert.deepEqual(await sharp(expandedCentre).metadata().then(({ width, height }) => ({ width, height })), { width: 100, height: 100 });
    assert.deepEqual(await sharp(expandedCorner).metadata().then(({ width, height }) => ({ width, height })), { width: 150, height: 100 });
});

test('rotation fills exposed pixels with transparent, black, or white backgrounds', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#cc3322' } }).png().toBuffer();
    const render = (fillMode) => renderPhotoEdit(source, [operation('rotate', { angle: 30, expandCanvas: false, fillMode, pivotX: 0.5, pivotY: 0.5 })], []);
    const corner = async (fillMode) => (await sharp(await render(fillMode)).ensureAlpha().raw().toBuffer()).subarray(0, 4);
    assert.deepEqual([...await corner(0)], [0, 0, 0, 0]);
    assert.deepEqual([...await corner(1)], [0, 0, 0, 255]);
    assert.deepEqual([...await corner(2)], [255, 255, 255, 255]);
});

test('rotation applies horizontal and vertical flips without changing the source', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const pixels = Buffer.from([
        255, 0, 0, 0, 255, 0,
        0, 0, 255, 255, 255, 255,
    ]);
    const source = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } }).png().toBuffer();
    const decoded = async (values) => [...await sharp(await renderPhotoEdit(source, [operation('rotate', values)], [])).removeAlpha().raw().toBuffer()];
    assert.deepEqual(await decoded({ angle: 0, flipHorizontal: true }), [
        0, 255, 0, 255, 0, 0,
        255, 255, 255, 0, 0, 255,
    ]);
    assert.deepEqual(await decoded({ angle: 0, flipVertical: true }), [
        0, 0, 255, 255, 255, 255,
        255, 0, 0, 0, 255, 0,
    ]);
    assert.deepEqual([...await sharp(source).raw().toBuffer()], [...pixels]);
});

test('photo edit renderer restricts an adjustment to an elliptical mask', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#808080' } }).png().toBuffer();
    const output = await renderPhotoEdit(source, [operation('adjust', { brightness: 2, contrast: 0, saturation: 1, hue: 0 }, { maskId: 'center' })], [{
        id: 'center', name: 'Center', kind: 'ellipse', box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, feather: 0, source: 'user',
    }]);
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => data[(y * info.width + x) * info.channels];
    assert.ok(pixel(40, 40) > pixel(2, 2) + 70);
});

test('disabled operations are skipped and preview width is capped', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#808080' } }).png().toBuffer();
    const output = await renderPhotoEdit(source, [{ ...operation('grayscale', {}), enabled: false }], [], { maxWidth: 50 });
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 50);
    assert.equal(metadata.height, 25);
});

test('dehaze restores contrast using deterministic image filters', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#646464' } })
        .composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 3, background: '#969696' } }).png().toBuffer(), left: 20, top: 0 }])
        .png()
        .toBuffer();
    const output = await renderPhotoEdit(source, [operation('dehaze', { strength: 1, contrast: 0.35, colour: 0, clarity: 0 })], []);
    const sourcePixels = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const outputPixels = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sourceContrast = sampleRed(sourcePixels, 30, 10) - sampleRed(sourcePixels, 10, 10);
    const outputContrast = sampleRed(outputPixels, 30, 10) - sampleRed(outputPixels, 10, 10);
    assert.ok(outputContrast > sourceContrast);
});

test('colour pop preserves selected colours and converts the rest to monochrome', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const pixels = Buffer.from([220, 30, 25, 20, 70, 220]);
    const source = await sharp(pixels, { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer();
    const output = await renderPhotoEdit(source, [operation('colour_pop', {
        colourCount: 1,
        colour0: 0xDC1E19,
        colourRange: 20,
        softness: 0.25,
    })], []);
    const outputPixels = await sharp(output).removeAlpha().raw().toBuffer();
    assert.deepEqual([...outputPixels.subarray(0, 3)], [220, 30, 25]);
    assert.equal(outputPixels[3], outputPixels[4]);
    assert.equal(outputPixels[4], outputPixels[5]);
});

test('zero-strength dehaze is an exact no-op', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const source = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 0.5 } } }).png().toBuffer();
    const baseline = await renderPhotoEdit(source, [], []);
    const output = await renderPhotoEdit(source, [
        operation('dehaze', { strength: 0, radiusPercent: 1.5 }),
    ], []);
    assert.deepEqual(output, baseline);
});
