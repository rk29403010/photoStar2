import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('gallery info panel detail loading keys off a stable asset id and callback', () => {
    const libraryViewSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/LibraryView.tsx'), 'utf8');
    const loadedShellSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/app/LoadedAppShell.tsx'), 'utf8');

    assert.match(libraryViewSource, /const selectedInfoAssetId = selectedInfoAsset\?\.id \?\? null;/);
    assert.match(libraryViewSource, /onEnsureAssetDetails\?\.\(selectedInfoAssetId\);/);
    assert.match(libraryViewSource, /\[onEnsureAssetDetails, selectedInfoAssetId, showInfoPanel\]/);
    assert.match(loadedShellSource, /const ensureAssetDetails = useCallback\(\(assetId: string\) => \{\s*void actions\.loadAssetDetails\(assetId\);\s*\}, \[actions\]\);/s);
    assert.match(loadedShellSource, /onEnsureAssetDetails=\{ensureAssetDetails\}/);
});
