const test = require('node:test');
const assert = require('node:assert/strict');

const INITIAL_FRAME = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

function assertBoxClose(actual, expected) {
    for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: expected ${expected[key]}, received ${actual[key]}`);
    }
}

function assertPointClose(actual, expected) {
    for (const key of ['x', 'y']) {
        assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: expected ${expected[key]}, received ${actual[key]}`);
    }
}

test('crop frame resizing supports all eight handles and preserves opposite edges', async () => {
    const { resizeCropFrame } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const cases = [
        ['north', { x: 0.2, y: 0.3, width: 0.6, height: 0.5 }],
        ['north-east', { x: 0.2, y: 0.3, width: 0.7, height: 0.5 }],
        ['east', { x: 0.2, y: 0.2, width: 0.7, height: 0.6 }],
        ['south-east', { x: 0.2, y: 0.2, width: 0.7, height: 0.7 }],
        ['south', { x: 0.2, y: 0.2, width: 0.6, height: 0.7 }],
        ['south-west', { x: 0.3, y: 0.2, width: 0.5, height: 0.7 }],
        ['west', { x: 0.3, y: 0.2, width: 0.5, height: 0.6 }],
        ['north-west', { x: 0.3, y: 0.3, width: 0.5, height: 0.5 }],
    ];

    for (const [handle, expected] of cases) {
        assertBoxClose(resizeCropFrame(INITIAL_FRAME, handle, { x: 0.1, y: 0.1 }), expected);
    }
});

test('crop frames clamp to image bounds and enforce per-axis minimum sizes', async () => {
    const { clampCropFrame, resizeCropFrame } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const minimum = { width: 0.05, height: 0.08 };

    assertBoxClose(
        clampCropFrame({ x: -0.2, y: 0.95, width: 2, height: 0.01 }, minimum),
        { x: 0, y: 0.92, width: 1, height: 0.08 },
    );
    assertBoxClose(
        resizeCropFrame({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, 'north-west', { x: 1, y: 1 }, minimum),
        { x: 0.45, y: 0.42, width: 0.05, height: 0.08 },
    );
    assertBoxClose(
        resizeCropFrame({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, 'south-east', { x: 2, y: 2 }, minimum),
        { x: 0.1, y: 0.1, width: 0.9, height: 0.9 },
    );
});

test('panning translates the image under a fixed frame and derives inverse crop coordinates', async () => {
    const { deriveCropBox, panCropImage } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, imageOffset: { x: 0, y: 0 } };
    const panned = panCropImage(initial, { x: 0.1, y: -0.15 });

    assert.deepEqual(panned.frame, initial.frame);
    assert.deepEqual(panned.imageOffset, { x: 0.1, y: -0.15 });
    assertBoxClose(deriveCropBox(panned), { x: 0.1, y: 0.35, width: 0.4, height: 0.4 });
});

test('panning preserves a frame smaller than the default interactive minimum', async () => {
    const { panCropImage } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { frame: { x: 0.2, y: 0.2, width: 0.02, height: 0.03 }, imageOffset: { x: 0, y: 0 } };

    assertBoxClose(panCropImage(initial, { x: 0, y: 0 }).frame, initial.frame);
});

test('image panning clamps at both coverage edges', async () => {
    const { deriveCropBox, panCropImage } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { frame: { x: 0.2, y: 0.25, width: 0.4, height: 0.5 }, imageOffset: { x: 0, y: 0 } };
    const farPositive = panCropImage(initial, { x: 10, y: 10 });
    const farNegative = panCropImage(initial, { x: -10, y: -10 });

    assertPointClose(farPositive.imageOffset, { x: 0.2, y: 0.25 });
    assertBoxClose(deriveCropBox(farPositive), { x: 0, y: 0, width: 0.4, height: 0.5 });
    assertPointClose(farNegative.imageOffset, { x: -0.4, y: -0.25 });
    assertBoxClose(deriveCropBox(farNegative), { x: 0.6, y: 0.5, width: 0.4, height: 0.5 });
});

test('resizing a crop viewport reclamps the image offset to keep the frame covered', async () => {
    const { deriveCropBox, resizeCropViewport } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const resized = resizeCropViewport(
        { frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, imageOffset: { x: -0.3, y: 0 } },
        'east',
        { x: 0.2, y: 0 },
    );

    assertBoxClose(resized.frame, { x: 0.2, y: 0.2, width: 0.6, height: 0.4 });
    assertPointClose(resized.imageOffset, { x: -0.2, y: 0 });
    assertBoxClose(deriveCropBox(resized), { x: 0.4, y: 0.2, width: 0.6, height: 0.4 });
});

test('fitting a crop to an aspect ratio preserves its centre and area when bounds allow', async () => {
    const { fitCropFrameToAspect } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
    const fitted = fitCropFrameToAspect({ x: 0.1, y: 0.2, width: 0.8, height: 0.6 }, 1);

    assert.ok(Math.abs(fitted.x + fitted.width / 2 - (initial.x + initial.width / 2)) < 1e-9);
    assert.ok(Math.abs(fitted.y + fitted.height / 2 - (initial.y + initial.height / 2)) < 1e-9);
    assert.ok(Math.abs(fitted.width / fitted.height - 1) < 1e-9);
    assert.ok(Math.abs(fitted.width * fitted.height - initial.width * initial.height) < 1e-9);
});

test('switching between panoramic and portrait ratios does not progressively collapse the crop', async () => {
    const { fitCropFrameToAspect } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    const panoramic = fitCropFrameToAspect(initial, 19 / 6);
    const landscape = fitCropFrameToAspect(panoramic, 3 / 2);
    const portrait = fitCropFrameToAspect(landscape, 2 / 3);

    assert.ok(portrait.width > 0.4);
    assert.ok(portrait.height > 0.65);
    assert.ok(Math.abs(portrait.width / portrait.height - 2 / 3) < 1e-9);
});

test('fixed-aspect corner resizing preserves the opposite corner and selected ratio', async () => {
    const { resizeCropFrameWithAspect } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const resized = resizeCropFrameWithAspect(
        { x: 0.2, y: 0.2, width: 0.6, height: 0.4 },
        'south-east',
        { x: 0.1, y: 0.05 },
        1.5,
    );

    assert.ok(Math.abs(resized.x - 0.2) < 1e-9);
    assert.ok(Math.abs(resized.y - 0.2) < 1e-9);
    assert.ok(Math.abs(resized.width / resized.height - 1.5) < 1e-9);
    assert.ok(resized.x + resized.width <= 1);
    assert.ok(resized.y + resized.height <= 1);
});

test('fixed-aspect edge resizing keeps the perpendicular centre and selected ratio', async () => {
    const { resizeCropFrameWithAspect } = await import('../../src/ui/components/photo-editor/cropGeometry.ts');
    const initial = { x: 0.2, y: 0.3, width: 0.6, height: 0.4 };
    const resized = resizeCropFrameWithAspect(initial, 'east', { x: 0.1, y: 0 }, 1.5);

    assert.ok(Math.abs(resized.width / resized.height - 1.5) < 1e-9);
    assert.ok(Math.abs(resized.y + resized.height / 2 - (initial.y + initial.height / 2)) < 1e-9);
    assert.equal(resized.x, initial.x);
});
