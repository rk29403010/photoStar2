const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('tag filter query uses canonical tag assignments instead of projection keywords json', () => {
    const source = fs.readFileSync('src/services/handlers/assetQueryFilters.ts', 'utf8');

    assert.match(source, /asset_tag_assignments/i);
    assert.match(source, /tag_definitions/i);
    assert.doesNotMatch(source, /json_each\(COALESCE\(pm\.keywords_json, '?\[\]'?\)\)/i);
});
