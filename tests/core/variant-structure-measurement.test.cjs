const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { readVariantStructureSample, measureVariantStructure } = require('../../dist/core/src/services/workflowRuntime/modules/grouping/variantStructure.js');
const { isAcceptedVariantStructureEvidence } = require('../../dist/core/src/shared/variantStructureEvidence.js');

async function writePattern(filePath, tint, shifted = false) {
    const pixels = Buffer.alloc(64 * 64 * 3);
    for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
            const horizontal = shifted ? (x + 24) % 64 : x;
            const value = 90 + 40 * Math.sin(horizontal / 7) + 25 * Math.cos(y / 4);
            const rgb = tint ? [value * 0.9 + 35, value * 0.7 + 5, value * 0.4] : [value, value, value];
            rgb.forEach((channel, index) => { pixels[(y * 64 + x) * 3 + index] = Math.round(channel); });
        }
    }
    await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(filePath);
}

test('variant structure tolerates tonal colour changes but rejects a different spatial arrangement', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-structure-'));
    try {
        const originalPath = path.join(directory, 'original.png');
        const tonalPath = path.join(directory, 'tonal.png');
        const otherPath = path.join(directory, 'other.png');
        await writePattern(originalPath, false);
        await writePattern(tonalPath, true);
        await writePattern(otherPath, false, true);
        const original = await readVariantStructureSample(originalPath);
        const tonal = await readVariantStructureSample(tonalPath);
        const other = await readVariantStructureSample(otherPath);
        assert.ok(measureVariantStructure(original, tonal, 9));
        assert.equal(measureVariantStructure(original, other, 9), null);
        assert.equal(measureVariantStructure(original, tonal, 13), null);
        assert.equal(measureVariantStructure(original, { ...tonal, aspectRatio: 2 }, 9), null);
        const blank = { gradients: Array(1800).fill(0), aspectRatio: 1 };
        assert.equal(measureVariantStructure(blank, blank, 0), null);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('structural evidence rejects unsupported versions, nonfinite scores and invalid distances', () => {
    const evidence = { measurement: 'spatial-gradient-v1', gradientCosine: 0.9, dhashDistance: 8, aspectRatioDelta: 0.02 };
    assert.equal(isAcceptedVariantStructureEvidence(evidence), true);
    for (const invalid of [null, {}, { ...evidence, measurement: 'future' },
        { ...evidence, gradientCosine: NaN }, { ...evidence, gradientCosine: Infinity },
        { ...evidence, dhashDistance: -1 }, { ...evidence, dhashDistance: 2.5 }]) {
        assert.equal(isAcceptedVariantStructureEvidence(invalid), false);
    }
});
