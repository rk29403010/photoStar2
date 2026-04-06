import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery wires tag filter state from library view into the toolbar pane', () => {
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');
    const galleryPaneSource = fs.readFileSync('src/ui/components/library/LibraryGalleryPane.tsx', 'utf8');
    const toolbarSource = fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8');

    assert.match(toolbarSource, /selectedTag:\s*string;/);
    assert.match(toolbarSource, /availableTags:\s*string\[];/);
    assert.match(toolbarSource, /onTagChange:\s*\(tag:\s*string\)\s*=>\s*void;/);

    assert.match(galleryPaneSource, /selectedTag:\s*string;/);
    assert.match(galleryPaneSource, /availableTags:\s*string\[];/);
    assert.match(galleryPaneSource, /onTagChange:\s*\(tag:\s*string\)\s*=>\s*void;/);

    assert.match(libraryViewSource, /onTagFilterChange:\s*\(tag:\s*string\)\s*=>\s*void;/);
    assert.match(libraryViewSource, /const rawSelectedTag = props\.activeFilter\?\.type === 'tag' \? props\.activeFilter\.value : '';/);
    assert.match(libraryViewSource, /props\.availableTags \?\? getAvailableTags\(props\.assets, rawSelectedTag\)/);
    assert.match(libraryViewSource, /onTagFilterChange:\s*props\.onTagFilterChange/);
});
