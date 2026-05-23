const test = require('node:test');
const assert = require('node:assert/strict');

test('getSingleClickTileAction opens single photo view when the info panel is hidden and selection is empty', async () => {
    const { getSingleClickTileAction } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(getSingleClickTileAction({ showInfoPanel: false, selectionCount: 0 }), 'open');
    assert.equal(getSingleClickTileAction({ showInfoPanel: false, selectionCount: 2 }), 'select');
});

test('getSingleClickTileAction selects the clicked photo when the info panel is visible', async () => {
    const { getSingleClickTileAction } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(getSingleClickTileAction({ showInfoPanel: true, selectionCount: 0 }), 'select');
    assert.equal(getSingleClickTileAction({ showInfoPanel: true, selectionCount: 2 }), 'select');
});

test('shouldOpenAssetOnDoubleClick only enables double-click navigation while the info panel is visible', async () => {
    const { shouldOpenAssetOnDoubleClick } = await import('../../src/ui/components/layout/layoutTileInteractionModel.ts');

    assert.equal(shouldOpenAssetOnDoubleClick(false), false);
    assert.equal(shouldOpenAssetOnDoubleClick(true), true);
});
