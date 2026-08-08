const test = require('node:test');
const assert = require('node:assert/strict');

function syntheticPeriodicRgba(width, height, period) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const wave = 128
                + 30 * Math.sin(2 * Math.PI * x / period)
                + 24 * Math.sin(2 * Math.PI * y / period);
            const value = Math.max(0, Math.min(255, Math.round(wave)));
            const offset = (y * width + x) * 4;
            data[offset] = value;
            data[offset + 1] = value;
            data[offset + 2] = value;
            data[offset + 3] = 255;
        }
    }
    return data;
}

function flatRgba(width, height, value) {
    const data = Buffer.alloc(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
        const offset = pixel * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
    }
    return data;
}

test('periodic texture detector finds a stable two-axis screen pattern', async () => {
    const { detectPeriodicTexture } = await import('../../dist/core/src/services/imageAnalysis/periodicTexture/detection.js');
    const width = 512;
    const height = 512;
    const detection = detectPeriodicTexture({
        data: syntheticPeriodicRgba(width, height, 16),
        width,
        height,
    });
    assert.equal(detection.likely, true);
    assert.ok(detection.peaks.length >= 2);
    assert.ok(Math.abs(detection.fundamentalPeriodPx - 16) < 1);
});

test('periodic texture detector rejects a flat image', async () => {
    const { detectPeriodicTexture } = await import('../../dist/core/src/services/imageAnalysis/periodicTexture/detection.js');
    const width = 512;
    const height = 512;
    const detection = detectPeriodicTexture({ data: flatRgba(width, height, 128), width, height });
    assert.equal(detection.likely, false);
    assert.equal(detection.peaks.length, 0);
});

test('periodic texture detection runs outside the backend event loop', async () => {
    const { detectPeriodicTextureInWorker } = await import('../../dist/core/src/services/imageAnalysis/periodicTexture/detection.js');
    const width = 512;
    const height = 512;
    let timerRan = false;
    setTimeout(() => { timerRan = true; }, 0);

    const detection = await detectPeriodicTextureInWorker({
        data: syntheticPeriodicRgba(width, height, 16),
        width,
        height,
    });

    assert.equal(timerRan, true);
    assert.equal(detection.likely, true);
});
