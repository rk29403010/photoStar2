import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery toolbar exposes reverse-date as a sort option', () => {
    const toolbarSource = fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8');
    const gallerySource = fs.readFileSync('src/shared/utils/libraryGallery.ts', 'utf8');

    assert.match(gallerySource, /'filename' \| 'date' \| 'reverse-date' \| 'group'/);
    assert.match(toolbarSource, /<option value="reverse-date">Reverse date<\/option>/);
});
