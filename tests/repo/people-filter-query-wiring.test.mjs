import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('person filters preserve spacing between visibility and person subqueries', () => {
    const source = fs.readFileSync('src/services/handlers/assetQueryFilters.ts', 'utf8');

    assert.match(source, /return filterBody \? `\$\{visibilitySubquery\} \$\{filterBody\}` : visibilitySubquery;/);
    assert.doesNotMatch(source, /return `\$\{visibilitySubquery\}\$\{/);
});
