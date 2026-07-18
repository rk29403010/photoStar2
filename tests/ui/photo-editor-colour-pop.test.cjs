const test = require('node:test');
const assert = require('node:assert/strict');

test('colour pop preserves selected hues and converts other colours to monochrome', async () => {
    const colourPop = await import('../../src/shared/photoEditing/colourPop.ts');
    const selected = { red: 220, green: 30, blue: 25 };
    const values = colourPop.writeColourPopColours({ colourRange: 20, softness: 0.25 }, [selected]);
    const output = colourPop.applyColourPopPixels(Uint8Array.from([
        220, 30, 25, 255,
        20, 70, 220, 255,
    ]), values);
    assert.deepEqual(Array.from(output.slice(0, 4)), [220, 30, 25, 255]);
    assert.equal(output[4], output[5]);
    assert.equal(output[5], output[6]);
});

test('quantised image palette keeps distinct common and saturated colours', async () => {
    const colourPop = await import('../../src/shared/photoEditing/colourPop.ts');
    const pixels = Uint8Array.from([
        ...Array.from({ length: 20 }, () => [120, 118, 116, 255]).flat(),
        ...Array.from({ length: 8 }, () => [210, 25, 30, 255]).flat(),
        ...Array.from({ length: 8 }, () => [25, 60, 210, 255]).flat(),
    ]);
    const palette = colourPop.quantizeColourPalette(pixels, 5);
    assert.ok(palette.some((colour) => colour.red > 180 && colour.green < 60));
    assert.ok(palette.some((colour) => colour.blue > 180 && colour.red < 60));
});

test('colour selection is packed into recipe-safe numeric slots', async () => {
    const colourPop = await import('../../src/shared/photoEditing/colourPop.ts');
    const colours = [{ red: 12, green: 34, blue: 56 }, { red: 200, green: 150, blue: 100 }];
    const values = colourPop.writeColourPopColours({}, colours);
    assert.equal(values.colourCount, 2);
    assert.deepEqual(colourPop.readColourPopColours(values), colours);
});
