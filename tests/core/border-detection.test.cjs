const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-border-detect-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 9) {
                console.warn(`[Test Cleanup] Could not delete temp dir ${targetPath}: ${error.message}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
    }
}

test('detectSimpleBorder detects uniform border when trim is >= 2%', async () => {
    const { detectSimpleBorder } = await import('../../src/services/photoMetadata/borderDetection.ts');
    const tempDir = createTempDir();
    const imagePath = path.join(tempDir, 'bordered.png');

    try {
        // Create a 100x100 white image with a 10px black border (total 120x120)
        await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
        .extend({
            top: 10,
            bottom: 10,
            left: 10,
            right: 10,
            background: { r: 0, g: 0, b: 0 }
        })
        .png()
        .toFile(imagePath);

        const boundingBox = await detectSimpleBorder(imagePath);
        assert.ok(boundingBox !== null);
        assert.ok(Math.abs(boundingBox.x - 10 / 120) < 0.01);
        assert.ok(Math.abs(boundingBox.y - 10 / 120) < 0.01);
        assert.ok(Math.abs(boundingBox.width - 100 / 120) < 0.01);
        assert.ok(Math.abs(boundingBox.height - 100 / 120) < 0.01);
    } finally {
        await removeDirWithRetry(tempDir);
    }
});

test('detectSimpleBorder returns null when trim is less than 2%', async () => {
    const { detectSimpleBorder } = await import('../../src/services/photoMetadata/borderDetection.ts');
    const tempDir = createTempDir();
    const imagePath = path.join(tempDir, 'no-border.png');

    try {
        // Create a 100x100 solid white image
        await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
        .png()
        .toFile(imagePath);

        const boundingBox = await detectSimpleBorder(imagePath);
        assert.equal(boundingBox, null);
    } finally {
        await removeDirWithRetry(tempDir);
    }
});

test('detectSimpleBorder returns null and handles corruption/missing file gracefully', async () => {
    const { detectSimpleBorder } = await import('../../src/services/photoMetadata/borderDetection.ts');
    const tempDir = createTempDir();
    const imagePath = path.join(tempDir, 'corrupted.png');

    try {
        fs.writeFileSync(imagePath, Buffer.from('not an image'));

        const boundingBox = await detectSimpleBorder(imagePath);
        assert.equal(boundingBox, null);
    } finally {
        await removeDirWithRetry(tempDir);
    }
});
