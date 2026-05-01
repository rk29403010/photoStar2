const test = require('node:test');
const assert = require('node:assert/strict');

function buildTile(selectionKey, top, bottom) {
    return {
        dataset: { selectionKey },
        getBoundingClientRect() {
            return { top, bottom };
        },
    };
}

function buildContainer({ top, bottom, tiles }) {
    return {
        getBoundingClientRect() {
            return { top, bottom };
        },
        querySelectorAll() {
            return tiles;
        },
    };
}

test('visible selection helper picks the visible tile nearest the top edge', async () => {
    const { getTopVisibleSelectionKeyFromScrollContainer } = await import('../../src/ui/components/library/libraryVisibleSelectionKey.ts');

    const container = buildContainer({
        top: 100,
        bottom: 500,
        tiles: [
            buildTile('photo:older', 20, 140),
            buildTile('photo:current', 145, 280),
            buildTile('photo:next', 285, 420),
        ],
    });

    assert.equal(getTopVisibleSelectionKeyFromScrollContainer(container), 'photo:current');
});

test('visible selection helper falls back to the first intersecting tile when everything starts above the top edge', async () => {
    const { getTopVisibleSelectionKeyFromScrollContainer } = await import('../../src/ui/components/library/libraryVisibleSelectionKey.ts');

    const container = buildContainer({
        top: 100,
        bottom: 500,
        tiles: [
            buildTile('photo:overlap', 40, 130),
            buildTile('photo:still-overlap', 60, 180),
        ],
    });

    assert.equal(getTopVisibleSelectionKeyFromScrollContainer(container), 'photo:overlap');
});

test('visible selection helper uses visual position instead of DOM order', async () => {
    const { getTopVisibleSelectionKeyFromScrollContainer } = await import('../../src/ui/components/library/libraryVisibleSelectionKey.ts');

    const container = buildContainer({
        top: 100,
        bottom: 500,
        tiles: [
            buildTile('photo:later-in-dom', 220, 340),
            buildTile('photo:topmost', 120, 210),
            buildTile('photo:lower', 345, 460),
        ],
    });

    assert.equal(getTopVisibleSelectionKeyFromScrollContainer(container), 'photo:topmost');
});
