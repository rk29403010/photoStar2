import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('people selection updates parent selection count from an effect instead of render-time state updates', () => {
    const source = fs.readFileSync('src/ui/components/PeopleView.tsx', 'utf8');

    assert.match(source, /useEffect\(\(\) => \{\s*onSelectionChange\?\.\(selectedIds\.size\);\s*\}, \[onSelectionChange, selectedIds\]\);/s);
    assert.doesNotMatch(source, /onSelectionChange\?\.\(next\.size\)/);
});
