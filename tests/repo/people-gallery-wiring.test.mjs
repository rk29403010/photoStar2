import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('people-to-gallery navigation clears stale photo selection before filtering the library', () => {
    const appSource = readFileSync(path.join(workspaceRoot, 'src/ui/App.tsx'), 'utf8');

    assert.match(
        appSource,
        /const handlePeopleFilter = useCallback\(\(filter: LibraryFilter\) => \{\s*setSelectedAssetId\(null\);\s*actions\.pushFilter\(filter\);\s*setView\('library'\);\s*setPeopleSelectionCount\(0\);\s*\}/s,
    );
});
