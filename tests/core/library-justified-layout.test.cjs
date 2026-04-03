const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function importJustifiedLayout() {
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../dist/core/src/shared/utils/libraryJustifiedLayout.js')).href;
    return import(moduleUrl);
}

test('buildJustifiedLayoutRows packs mixed aspect ratios into width-bounded rows', async () => {
    const { buildJustifiedLayoutRows } = await importJustifiedLayout();

    const rows = buildJustifiedLayoutRows([
        { id: 'wide', width: 1600, height: 900 },
        { id: 'portrait', width: 900, height: 1600 },
        { id: 'square', width: 1000, height: 1000 },
        { id: 'landscape', width: 1400, height: 1000 },
        { id: 'second-portrait', width: 900, height: 1600 },
    ], {
        containerWidth: 700,
        gap: 2,
        targetRowHeight: 180,
        maxRowHeight: 240,
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].items.length, 4);
    assert.ok(Math.abs(rows[0].width - 700) <= 1);
    assert.ok(rows[0].items.every((item) => item.height === rows[0].height));
});

test('buildJustifiedLayoutRows keeps the final row at target height instead of stretching', async () => {
    const { buildJustifiedLayoutRows } = await importJustifiedLayout();

    const rows = buildJustifiedLayoutRows([
        { id: 'a', width: 1200, height: 800 },
        { id: 'b', width: 1200, height: 800 },
        { id: 'c', width: 800, height: 1200 },
        { id: 'd', width: 800, height: 1200 },
        { id: 'e', width: 800, height: 1200 },
    ], {
        containerWidth: 700,
        gap: 2,
        targetRowHeight: 170,
        maxRowHeight: 220,
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[1].height, 170);
    assert.ok(rows[1].width < 1000);
});

test('buildJustifiedLayoutRows falls back safely when dimensions are missing', async () => {
    const { buildJustifiedLayoutRows } = await importJustifiedLayout();

    const rows = buildJustifiedLayoutRows([
        { id: 'unknown' },
        { id: 'known', width: 800, height: 1200 },
    ], {
        containerWidth: 600,
        gap: 2,
        targetRowHeight: 150,
        maxRowHeight: 210,
    });

    assert.equal(rows.length, 1);
    assert.ok(rows[0].items[0].width > 0);
    assert.ok(rows[0].items[0].height > 0);
});
