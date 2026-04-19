import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('asset detail loaders guard against duplicate requests for the same asset', () => {
    const selectedAssetDetailsSource = fs.readFileSync('src/ui/hooks/useSelectedAssetDetails.ts', 'utf8');
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');

    assert.match(selectedAssetDetailsSource, /requestedAssetIdRef/);
    assert.match(selectedAssetDetailsSource, /requestedAssetIdRef\.current === selectedAssetId/);
    assert.match(selectedAssetDetailsSource, /requestedAssetIdRef\.current = null/);

    assert.match(libraryViewSource, /requestedInfoAssetIdRef/);
    assert.match(libraryViewSource, /requestedInfoAssetIdRef\.current === selectedInfoAssetId/);
    assert.match(libraryViewSource, /requestedInfoAssetIdRef\.current = null/);
});
