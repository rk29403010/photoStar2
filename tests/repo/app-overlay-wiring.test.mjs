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
    assert.match(lifecycleSource, /if \(shouldSyncAssetFocus\) \{\s*onAssetFocusChange\?\.\(assetId\);\s*\}/s);
});
