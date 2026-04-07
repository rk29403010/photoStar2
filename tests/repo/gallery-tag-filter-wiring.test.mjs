import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readWorkspaceFile(relativePath) {
    return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('gallery tag filtering is wired through the shared filter contract and backend query builder', () => {
    const filterTypesSource = readWorkspaceFile('src/boundary/contracts/usePhotoLibrary.types.ts');
    const assetQueryFiltersSource = readWorkspaceFile('src/services/handlers/assetQueryFilters.ts');

    assert.match(filterTypesSource, /'person_any' \| 'person_all' \| 'person_only' \| 'album' \| 'tag'/);
    assert.match(assetQueryFiltersSource, /tag\?: string/);
    assert.match(assetQueryFiltersSource, /filter\.type === 'tag' && filter\.tag/);
    assert.match(assetQueryFiltersSource, /json_each/);
});

test('gallery view exposes a tag dropdown and forwards tag filter state through the toolbar wiring', () => {
    const libraryViewSource = readWorkspaceFile('src/ui/components/LibraryView.tsx');
    const toolbarSource = readWorkspaceFile('src/ui/components/library/LibraryToolbar.tsx');

    assert.match(toolbarSource, /selectedTag: string;/);
    assert.match(toolbarSource, /availableTags: string\[\];/);
    assert.match(toolbarSource, /onTagChange: \(tag: string\) => void;/);
    assert.match(toolbarSource, /<ToolbarSelect label="Tag" ariaLabel="Filter gallery by tag"/);
    assert.match(toolbarSource, /<option value="">All tags<\/option>/);

    assert.match(libraryViewSource, /const availableTags = useMemo\(/);
    assert.match(libraryViewSource, /const rawSelectedTag = props\.activeFilter\?\.type === 'tag' \? \(props\.activeFilter\.tag \?\? ''\) : '';/);
    assert.match(libraryViewSource, /selectedTag,/);
    assert.match(libraryViewSource, /onTagFilterChange: props\.onTagFilterChange/);
});

test('gallery tag options are deduped and sorted case-insensitively', () => {
    const libraryViewSource = readWorkspaceFile('src/ui/components/LibraryView.tsx');

    assert.match(libraryViewSource, /function getTagKey\(tag: string\)/);
    assert.match(libraryViewSource, /const tagsByKey = new Map<string, string>\(\);/);
    assert.match(libraryViewSource, /const key = getTagKey\(trimmedTag\);/);
    assert.match(libraryViewSource, /!tagsByKey\.has\(key\)/);
    assert.match(libraryViewSource, /localeCompare\(right, undefined, \{ sensitivity: 'base' \}\)/);
    assert.match(libraryViewSource, /availableTags\.find\(\(tag\) => getTagKey\(tag\) === getTagKey\(rawSelectedTag\)\)/);
});
