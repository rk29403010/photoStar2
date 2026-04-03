import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery exposes justified layout mode through the shared type and toolbar option', () => {
    const layoutModeSource = fs.readFileSync('src/shared/utils/libraryLayout.ts', 'utf8');
    const toolbarSource = fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8');

    assert.match(layoutModeSource, /'tiled' \| 'grid' \| 'justified'/);
    assert.match(toolbarSource, /<option value="justified">Justified<\/option>/);
});
