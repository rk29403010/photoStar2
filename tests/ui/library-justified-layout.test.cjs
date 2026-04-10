const test = require('node:test');
const assert = require('node:assert/strict');

test('justified last row does not overflow the available container width', async () => {
    const { buildJustifiedLayoutRows } = await import('../../src/shared/utils/libraryJustifiedLayout.ts');

    const rows = buildJustifiedLayoutRows([
        { id: 'a', width: 400, height: 300 },
        { id: 'b', width: 400, height: 300 },
        { id: 'c', width: 400, height: 300 },
    ], {
        containerWidth: 500,
        targetRowHeight: 220,
        gap: 2,
        maxRowHeight: 240,
    });

    assert.ok(rows.length >= 1);
    assert.ok(rows.at(-1).width <= 500);
});

test('justified rows preserve source item indexes for sectioned layouts', async () => {
    const { buildJustifiedLayoutRows } = await import('../../src/shared/utils/libraryJustifiedLayout.ts');

    const rows = buildJustifiedLayoutRows([
        { id: 'photo:a', index: 4, width: 400, height: 300 },
        { id: 'photo:b', index: 7, width: 400, height: 300 },
    ], {
        containerWidth: 900,
        targetRowHeight: 220,
        gap: 6,
        maxRowHeight: 240,
    });

    assert.deepEqual(rows.flatMap((row) => row.items.map((item) => item.index)), [4, 7]);
});

test('justified non-final rows preserve the configured gap while filling the container', async () => {
    const { buildJustifiedLayoutRows } = await import('../../src/shared/utils/libraryJustifiedLayout.ts');

    const rows = buildJustifiedLayoutRows([
        { id: 'a', width: 320, height: 480 },
        { id: 'b', width: 320, height: 480 },
        { id: 'c', width: 320, height: 480 },
        { id: 'd', width: 320, height: 480 },
        { id: 'e', width: 320, height: 480 },
        { id: 'f', width: 320, height: 480 },
        { id: 'g', width: 320, height: 480 },
    ], {
        containerWidth: 700,
        targetRowHeight: 220,
        gap: 6,
        maxRowHeight: 240,
    });

    assert.ok(rows.length >= 2);
    assert.equal(Math.round(rows[0].width), 700);
    assert.equal(rows[0].isFinalRow, false);
    assert.equal(rows[0].gap, 6);
    const firstRowContentWidth = rows[0].items.reduce((sum, item) => sum + item.width, 0);
    const firstRowGapWidth = rows[0].gap * (rows[0].items.length - 1);
    assert.equal(Math.round(firstRowContentWidth + firstRowGapWidth), 700);
    assert.equal(rows.at(-1).isFinalRow, true);
    assert.equal(rows.at(-1).gap, 6);
});
