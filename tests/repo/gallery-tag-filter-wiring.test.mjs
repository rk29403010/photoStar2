import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery wires tag filter state from library view into the toolbar pane', () => {
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');
    const libraryChromeSource = fs.readFileSync('src/ui/components/library/libraryViewChrome.tsx', 'utf8');
    const galleryPaneSource = fs.readFileSync('src/ui/components/library/LibraryGalleryPane.tsx', 'utf8');
    const toolbarSource = fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8');

    assert.match(toolbarSource, /selectedTag:\s*string;/);
    assert.match(toolbarSource, /availableTags:\s*string\[];/);
    assert.match(toolbarSource, /onTagChange:\s*\(tag:\s*string\)\s*=>\s*void;/);

    assert.doesNotMatch(galleryPaneSource, /selectedTag:\s*string;/);
    assert.doesNotMatch(galleryPaneSource, /availableTags:\s*string\[];/);
    assert.doesNotMatch(galleryPaneSource, /onTagChange:\s*\(tag:\s*string\)\s*=>\s*void;/);
    assert.match(galleryPaneSource, /(interface|type) LibraryGalleryPaneProps/);

    assert.match(libraryViewSource, /onTagFilterChange:\s*\(tag:\s*string\)\s*=>\s*void;/);
    assert.match(libraryChromeSource, /const rawSelectedTag = params\.activeFilter\?\.type === 'tag' \? params\.activeFilter\.value : '';/);
    assert.match(libraryChromeSource, /params\.availableTags \?\? getAvailableTags\(params\.assets, rawSelectedTag\)/);
    assert.match(libraryChromeSource, /onTagFilterChange:\s*params\.onTagFilterChange/);
    assert.match(libraryChromeSource, /getLibraryToolbarProps\(/);
});
