const test = require('node:test');
const assert = require('node:assert/strict');

test('tile overlays stay quiet while the gallery is scrolling', async () => {
    const { getTileOverlayVisibility } = await import('../../src/ui/components/layout/tileOverlayModel.ts');

    assert.deepEqual(
        getTileOverlayVisibility({
            isHovered: true,
            isScrollSettled: false,
            isImageVisible: true,
            showGroupIds: true,
            isGroupRepresentative: true,
        }),
        {
            showCaption: false,
            showDeclusterButton: false,
            showStackBadge: false,
            showGroupIdPills: false,
        },
    );
});

test('tile overlays return once the gallery settles without affecting selection chrome', async () => {
    const { getTileOverlayVisibility } = await import('../../src/ui/components/layout/tileOverlayModel.ts');

    assert.deepEqual(
        getTileOverlayVisibility({
            isHovered: true,
            isScrollSettled: true,
            isImageVisible: true,
            showGroupIds: true,
            isGroupRepresentative: true,
        }),
        {
            showCaption: true,
            showDeclusterButton: true,
            showStackBadge: true,
            showGroupIdPills: true,
        },
    );
});

test('tile overlays stay hidden until the image is actually visible', async () => {
    const { getTileOverlayVisibility } = await import('../../src/ui/components/layout/tileOverlayModel.ts');

    assert.deepEqual(
        getTileOverlayVisibility({
            isHovered: true,
            isScrollSettled: true,
            isImageVisible: false,
            showGroupIds: true,
            isGroupRepresentative: true,
        }),
        {
            showCaption: false,
            showDeclusterButton: false,
            showStackBadge: false,
            showGroupIdPills: false,
        },
    );
});
