import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('library view wires a gallery info panel and switches gallery click behavior with the panel state', () => {
    const libraryViewSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/LibraryView.tsx'), 'utf8');
    const libraryPanelSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/library/LibraryPanel.tsx'), 'utf8');
    const libraryViewHelpersSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/library/libraryViewHelpers.tsx'), 'utf8');
    const layoutEngineSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/layout/LayoutEngine.tsx'), 'utf8');

    assert.match(libraryViewSource, /showInfoPanel: boolean;/);
    assert.match(libraryViewSource, /onShowInfoPanelChange: \(show: boolean\) => void;/);
    assert.match(libraryViewSource, /selectedInfoAsset: params\.selectedInfoAsset/);
    assert.match(libraryPanelSource, /<GalleryInfoPanel\b/);
    assert.match(libraryPanelSource, /onClose=\{\(\) => onShowInfoPanelChange\(false\)\}/);
    assert.match(libraryViewHelpersSource, /handleInfoPanelVisibilityChange\(show, params\.props\.onShowInfoPanelChange, params\.props\.onLibrarySelectionChange\)/);
    assert.match(layoutEngineSource, /showInfoPanel: boolean;/);
    assert.match(layoutEngineSource, /onDoubleClick=\{onDoubleClick\}/);
});
