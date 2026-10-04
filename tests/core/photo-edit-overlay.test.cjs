const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

function overlayOperation(assetLayers) {
    return {
        id: 'overlay-1',
        tool: 'overlay',
        name: 'Overlay photos',
        enabled: true,
        maskId: null,
        values: {},
        assetLayers,
    };
}

function layer(overrides = {}) {
    return {
        id: 'layer-1',
        assetId: 'second-photo',
        enabled: true,
        opacity: 0.5,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        ...overrides,
    };
}

async function pixel(buffer, x, y) {
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (y * info.width + x) * info.channels;
    return [...data.subarray(offset, offset + 3)];
}

test('overlay photos composites another asset at 50% opacity by default', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const base = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 0, b: 0 } } }).png().toBuffer();
    const second = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 200 } } }).png().toBuffer();
    const output = await renderPhotoEdit(base, [overlayOperation([layer()])], [], {
        resolveAssetSource: async (assetId) => {
            assert.equal(assetId, 'second-photo');
            return second;
        },
    });

    const [red, green, blue] = await pixel(output, 20, 20);
    assert.ok(Math.abs(red - 100) <= 2);
    assert.equal(green, 0);
    assert.ok(Math.abs(blue - 100) <= 2);
});

test('overlay photos centres contained images and honours scale and position', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const base = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000000' } }).png().toBuffer();
    const second = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const output = await renderPhotoEdit(base, [overlayOperation([layer({ opacity: 1, scale: 0.5, offsetX: 0.25 })])], [], {
        resolveAssetSource: () => second,
    });

    assert.deepEqual(await pixel(output, 30, 30), [0, 0, 0]);
    assert.deepEqual(await pixel(output, 60, 30), [255, 255, 255]);
});

test('changes after overlay affect the combined image while earlier changes affect only the base', async () => {
    const { renderPhotoEdit } = await import('../../src/services/photoEditing/editRenderer.ts');
    const base = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toBuffer();
    const second = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 20, g: 20, b: 220 } } }).png().toBuffer();
    const resolveAssetSource = () => second;
    const grayscale = { id: 'bw', tool: 'grayscale', name: 'Black & white', enabled: true, maskId: null, values: {} };

    const editCombined = await renderPhotoEdit(base, [overlayOperation([layer()]), grayscale], [], { resolveAssetSource });
    const editBaseFirst = await renderPhotoEdit(base, [grayscale, overlayOperation([layer()])], [], { resolveAssetSource });
    const combinedPixel = await pixel(editCombined, 10, 10);
    const baseFirstPixel = await pixel(editBaseFirst, 10, 10);

    assert.equal(combinedPixel[0], combinedPixel[1]);
    assert.equal(combinedPixel[1], combinedPixel[2]);
    assert.ok(baseFirstPixel[2] > baseFirstPixel[0]);
});
