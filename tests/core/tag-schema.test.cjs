const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('database schema declares canonical tag and review tables', () => {
    const schemaSource = fs.readFileSync('src/data/dbSchema.ts', 'utf8');

    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS tag_definitions/);
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS tag_aliases/);
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS asset_tag_assignments/);
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS review_items/);
});
