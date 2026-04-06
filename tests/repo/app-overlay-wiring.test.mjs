import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('App renders a single overlay shell and keeps workflow visualiser wiring', () => {
    const loadedShellSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/app/LoadedAppShell.tsx'), 'utf8');
    const shellMatches = loadedShellSource.match(/<AppOverlays\b/g) ?? [];
    const appSource = readFileSync(path.join(workspaceRoot, 'src/ui/App.tsx'), 'utf8');

    assert.equal(shellMatches.length, 1);
    assert.match(appSource, /useSelectedAssetDetails\(loadAssetDetails, uiState\.selectedAssetId\)/);
});

test('single-photo overlay only syncs library-backed asset ids while navigating', () => {
    const singlePhotoSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/SinglePhotoView.tsx'), 'utf8');
    const assetModelSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/singlePhotoAssetModel.ts'), 'utf8');
    const lifecycleSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/useSinglePhotoAssetLifecycle.ts'), 'utf8');

    assert.match(assetModelSource, /export function isLibrarySelectionAnchorAsset\(assets: Asset\[], assetId: string \| undefined\): boolean/);
    assert.match(singlePhotoSource, /const shouldSyncAssetFocus = isLibrarySelectionAnchorAsset\(params\.assets, asset\?\.id\);/);
    assert.match(singlePhotoSource, /shouldSyncAssetFocus,/);
    assert.match(lifecycleSource, /export function shouldSyncSinglePhotoAssetFocus/);
    assert.match(lifecycleSource, /if \(shouldSyncSinglePhotoAssetFocus\(\{/);
    assert.match(lifecycleSource, /lastSyncedAssetIdRef\.current = assetId;\s*onAssetFocusChange\?\.\(assetId\);/s);
});

test('variant filmstrip keeps orbit loading stable across parent callback churn', () => {
    const filmstripSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/VariantFilmstrip.tsx'), 'utf8');

    assert.match(filmstripSource, /const onGetGroupOrbitRef = useRef\(onGetGroupOrbit\);/);
    assert.match(filmstripSource, /const onOrbitLoadedRef = useRef\(onOrbitLoaded\);/);
    assert.match(filmstripSource, /onGetGroupOrbitRef\.current\(groupId\)/);
    assert.match(filmstripSource, /onOrbitLoadedRef\.current\(nextOrbit\.items\.map\(\(item\) => item\.asset\)\);/);
    assert.match(filmstripSource, /\}, \[groupId\]\);/);
    assert.match(filmstripSource, /lastReportedGroupIdRef\.current === orbit\.group_id/);
});

test('viewport image transitions commit from current render state instead of post-render synced refs', () => {
    const viewportImageStateSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/usePhotoViewportImageState.ts'), 'utf8');

    assert.doesNotMatch(viewportImageStateSource, /useSyncedCurrent/);
    assert.doesNotMatch(viewportImageStateSource, /pendingAssetRef|pendingImageSrcRef|activeAssetRef|activeImageSrcRef/);
    assert.match(viewportImageStateSource, /if \(!pendingAsset\) \{\s*return;\s*\}/s);
    assert.match(viewportImageStateSource, /pendingAsset,\s*pendingImageSrc,\s*isActiveImageReady,/s);
});
