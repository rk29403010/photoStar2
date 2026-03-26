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

test('single-photo overlay keeps selected asset id in sync while navigating', () => {
    const overlaysSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/app/AppOverlays.tsx'), 'utf8');
    const singlePhotoSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/SinglePhotoView.tsx'), 'utf8');

    assert.match(overlaysSource, /onAssetFocusChange=\{props\.setSelectedAssetId\}/);
    assert.match(singlePhotoSource, /onAssetFocusChange\?: \(assetId: string\) => void;/);
    assert.match(singlePhotoSource, /useEffect\(\(\) => \{\s*if \(!asset\?\.id\) \{return;\}\s*onAssetFocusChange\?\.\(asset\.id\);/s);
});
