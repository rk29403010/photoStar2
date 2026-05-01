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

function buildSection(sectionId, top, bottom) {
    return {
        dataset: { timeSectionId: sectionId },
        getBoundingClientRect() {
            return { top, bottom };
        },
    };
}

test('visible timeline group helper prefers the first meaningfully visible section from the top', async () => {
    const { getTopVisibleTimelineGroupIdFromScrollContainer } = await import('../../src/ui/components/library/libraryVisibleSelectionKey.ts');

    const container = buildContainer({
        top: 100,
        bottom: 500,
        tiles: [
            buildSection('decade-2010', 40, 140),
            buildSection('decade-2000', 145, 280),
            buildSection('decade-1990', 285, 420),
        ],
    });

    assert.equal(getTopVisibleTimelineGroupIdFromScrollContainer(container), 'decade-2010');
});

test('visible timeline group helper prefers the section crossing the top edge over a barely visible previous section', async () => {
    const { getTopVisibleTimelineGroupIdFromScrollContainer } = await import('../../src/ui/components/library/libraryVisibleSelectionKey.ts');

    const container = buildContainer({
        top: 100,
        bottom: 500,
        tiles: [
            buildSection('decade-1950', 96, 104),
            buildSection('decade-1960', 98, 140),
            buildSection('decade-1970', 180, 240),
        ],
    });

    assert.equal(getTopVisibleTimelineGroupIdFromScrollContainer(container), 'decade-1960');
});
