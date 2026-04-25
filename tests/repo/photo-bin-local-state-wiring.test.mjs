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

test('photo bin actions use local asset state helpers instead of widening preserve-paging refresh', () => {
    const helperSource = readWorkspaceFile('src/shared/utils/photoBinLocalState.ts');
    const hookSource = readWorkspaceFile('src/ui/hooks/usePhotoBinActions.ts');
    const coreActionsSource = readWorkspaceFile('src/ui/hooks/usePhotoLibrary.coreActions.ts');
    const gallerySource = readWorkspaceFile('src/ui/hooks/usePhotoLibrary.gallery.ts');

    assert.match(helperSource, /export function removeAssetsById/);
    assert.match(helperSource, /export function restoreAssetsByReference/);

    assert.match(coreActionsSource, /removeAssetsFromState:/);
    assert.match(coreActionsSource, /restoreAssetsInState:/);
    assert.match(hookSource, /actions\.removeAssetsFromState\(assetIds\)/);
    assert.match(hookSource, /actions\.restoreAssetsInState\(restoredAssets, referenceAssets\)/);
    assert.match(gallerySource, /loadedAssetCount\?: number;/);
    assert.match(gallerySource, /options\.preservePagingState\s*\?\s*Math\.max\(ASSET_PAGE_SIZE, options\.loadedAssetCount \?\? 0\)/);
});
