import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readWorkspaceFile(relativePath) {
    return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('preserve-paging refresh requests the full loaded asset window', () => {
    const gallerySource = readWorkspaceFile('src/ui/hooks/usePhotoLibrary.gallery.ts');
    const librarySource = readWorkspaceFile('src/ui/hooks/usePhotoLibrary.ts');

    assert.match(gallerySource, /loadedAssetCount\?: number;/);
    assert.match(gallerySource, /const prefersFullTimelineDataset = galleryDataModeRef\.current === 'grouped-timeline';/);
    assert.match(gallerySource, /const refreshLimit = prefersFullTimelineDataset/);
    assert.match(gallerySource, /Math\.max\(ASSET_PAGE_SIZE, options\.loadedAssetCount \?\? 0\)/);
    assert.match(gallerySource, /limit: refreshLimit,/);

    assert.match(librarySource, /loadedAssetCount: options\.preservePagingState \? assets\.length : options\.loadedAssetCount/);
});
