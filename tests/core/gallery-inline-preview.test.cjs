const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('attachInlinePreviewDataUrls adds a data URL for gallery assets with preview files', async () => {
    const { attachInlinePreviewDataUrls } = await import('../../src/services/handlers/galleryInlinePreview.ts');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-inline-preview-'));
    const previewPath = path.join(tempDir, 'sample-thumbnail.webp');
    const previewBytes = Buffer.from('RIFFdemoWEBP', 'utf8');

    await fs.writeFile(previewPath, previewBytes);

    const [asset] = await attachInlinePreviewDataUrls([
        {
            id: 'asset-1',
            original_path: 'photo.jpg',
            preview_path: previewPath,
        },
    ]);

    assert.equal(asset.preview_path, previewPath);
    assert.equal(asset.preview_data_url, `data:image/webp;base64,${previewBytes.toString('base64')}`);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test('attachInlinePreviewDataUrls leaves assets without preview files unchanged', async () => {
    const { attachInlinePreviewDataUrls } = await import('../../src/services/handlers/galleryInlinePreview.ts');

    const [asset] = await attachInlinePreviewDataUrls([
        {
            id: 'asset-2',
            original_path: 'missing.jpg',
            preview_path: 'C:/missing-thumbnail.webp',
        },
    ]);

    assert.equal(asset.preview_data_url, undefined);
});
