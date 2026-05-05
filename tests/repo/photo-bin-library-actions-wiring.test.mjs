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

test('library and single-photo actions switch between Move to Bin and Restore', () => {
    const actionModelSource = readWorkspaceFile('src/ui/components/app/libraryBinActionModel.ts');
    const filterBarSource = readWorkspaceFile('src/ui/components/app/AppFilterBar.tsx');
    const hookSource = readWorkspaceFile('src/ui/hooks/usePhotoBinActions.ts');
    const selectionSource = readWorkspaceFile('src/shared/utils/librarySelectionState.ts');
    const appSource = readWorkspaceFile('src/ui/App.tsx');
    const loadedShellSource = readWorkspaceFile('src/ui/components/app/LoadedAppShell.tsx');
    const mainContentSource = readWorkspaceFile('src/ui/components/app/AppMainContent.tsx');
    const overlaysSource = readWorkspaceFile('src/ui/components/app/AppOverlays.tsx');
    const controlsSource = readWorkspaceFile('src/ui/components/single-photo/ActionOverlayControls.tsx');
    const singlePhotoMenuModelSource = readWorkspaceFile('src/ui/components/single-photo/singlePhotoActionMenuModel.ts');
    const viewportSource = readWorkspaceFile('src/ui/components/single-photo/PhotoViewport.tsx');

    assert.match(actionModelSource, /export function isBinLibraryFilter/);
    assert.match(actionModelSource, /export function getLibraryBinActionLabel/);

    assert.match(filterBarSource, /onMoveSelectionToBin: \(\) => Promise<void>/);
    assert.match(filterBarSource, /onRestoreSelectionFromBin: \(\) => Promise<void>/);
    assert.match(filterBarSource, /getLibraryBinActionLabel/);
    assert.match(filterBarSource, /void onRestoreSelectionFromBin\(\)/);
    assert.match(filterBarSource, /void onMoveSelectionToBin\(\)/);

    assert.match(singlePhotoMenuModelSource, /export function getLibraryBinActionLabel/);
    assert.match(controlsSource, /onMoveToBin\?: \(assetId: string\) => Promise<void>/);
    assert.match(controlsSource, /onRestoreFromBin\?: \(assetId: string\) => Promise<void>/);
    assert.match(controlsSource, /getLibraryBinActionLabel\(asset\.binned_at \? 'restore' : 'move_to_bin'\)/);
    assert.match(viewportSource, /onMoveToBin=\{props\.onMoveToBin\}/);
    assert.match(viewportSource, /onRestoreFromBin=\{props\.onRestoreFromBin\}/);

    assert.match(selectionSource, /export function getLibrarySelectionAssetIds/);
    assert.match(selectionSource, /selection\.groupIds\.has\(asset\.group_id\)/);
    assert.match(hookSource, /export function usePhotoBinActions/);
    assert.match(hookSource, /assets: Asset\[\];/);
    assert.match(hookSource, /showTransientBanner\(\{/);
    assert.match(hookSource, /actionLabel: 'Undo'/);
    assert.match(hookSource, /getLibrarySelectionAssetIds\(librarySelection, assets\)/);
    assert.match(hookSource, /await actions\.moveToBin\(assetIds\)/);
    assert.match(hookSource, /await actions\.restoreFromBin\(assetIds\)/);

    assert.match(appSource, /usePhotoBinActions\(/);
    assert.match(appSource, /assets,/);
    assert.match(mainContentSource, /onMoveAssetToBin: \(assetId: string\) => Promise<void>/);
    assert.match(mainContentSource, /onRestoreAssetFromBin: \(assetId: string\) => Promise<void>/);
    assert.match(loadedShellSource, /onMoveSelectionToBin=\{props\.handlers\.handleMoveSelectionToBin\}/);
    assert.match(loadedShellSource, /onRestoreSelectionFromBin=\{props\.handlers\.handleRestoreSelectionFromBin\}/);
    assert.match(overlaysSource, /onMoveToBin: \(assetId: string\) => Promise<void>/);
    assert.match(overlaysSource, /onRestoreFromBin: \(assetId: string\) => Promise<void>/);
});
