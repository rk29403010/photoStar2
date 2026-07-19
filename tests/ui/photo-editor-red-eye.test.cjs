const test = require('node:test');
const assert = require('node:assert/strict');

test('red-eye recipes detect red and pet-eye candidates and preserve alpha', async () => {
    const redEye = await import('../../src/shared/photoEditing/redEye.ts');
    const width = 12;
    const height = 8;
    const source = new Uint8Array(width * height * 4).fill(255);
    for (let index = 0; index < width * height; index += 1) { source[index * 4] = 40; source[index * 4 + 1] = 40; source[index * 4 + 2] = 40; }
    const redOffset = (3 * width + 4) * 4;
    source.set([240, 30, 25, 180], redOffset);
    source.set([240, 30, 25, 180], redOffset + 4);
    const points = redEye.detectRedEyePoints(source, width, height, [{ x: 0, y: 0, width: 1, height: 1 }], redEye.RED_EYE_DEFAULTS);
    assert.equal(points.length, 1);
    const fixed = redEye.applyRedEyePixels(source, width, height, redEye.writeRedEyePoints(redEye.RED_EYE_DEFAULTS, points));
    assert.ok(fixed[redOffset] < source[redOffset]);
    assert.equal(fixed[redOffset + 3], 180);
    source.set([30, 230, 70, 180], redOffset);
    source.set([30, 230, 70, 180], redOffset + 4);
    const petPoints = redEye.detectRedEyePoints(source, width, height, [{ x: 0, y: 0, width: 1, height: 1 }], { ...redEye.RED_EYE_DEFAULTS, mode: redEye.RED_EYE_MODE.pet });
    assert.equal(petPoints.length, 1);
});
