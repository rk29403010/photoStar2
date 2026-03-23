import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('group similar photo sync effect tracks the setter instead of the whole actions object', () => {
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');

    assert.match(appSource, /const setGroupSimilarPhotos = actions\.setGroupSimilarPhotos;/);
    assert.match(
        appSource,
        /useEffect\(\(\) => {\s*setGroupSimilarPhotos\(uiState\.groupSimilarPhotos\);\s*}, \[setGroupSimilarPhotos, uiState\.groupSimilarPhotos]\);/s,
    );
    assert.doesNotMatch(
        appSource,
        /useEffect\(\(\) => {\s*actions\.setGroupSimilarPhotos\(uiState\.groupSimilarPhotos\);\s*}, \[actions, uiState\.groupSimilarPhotos]\);/s,
    );
});
