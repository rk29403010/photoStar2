const test = require('node:test');
const assert = require('node:assert/strict');

test('getSingleClickTileAction opens single photo view when the selection is empty', async () => {
    const { getSingleClickTileAction } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(getSingleClickTileAction({ showInfoPanel: false, selectionCount: 0 }), 'open');
    assert.equal(getSingleClickTileAction({ showInfoPanel: true, selectionCount: 0 }), 'open');
});

test('getSingleClickTileAction selects the clicked photo when selection is active', async () => {
    const { getSingleClickTileAction } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(getSingleClickTileAction({ showInfoPanel: false, selectionCount: 2 }), 'select');
    assert.equal(getSingleClickTileAction({ showInfoPanel: true, selectionCount: 2 }), 'select');
});

test('shouldOpenAssetOnDoubleClick never enables double-click navigation', async () => {
    const { shouldOpenAssetOnDoubleClick } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(shouldOpenAssetOnDoubleClick(false), false);
    assert.equal(shouldOpenAssetOnDoubleClick(true), false);
});
