const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('semantic predicate generated registry owns the initial Phase 1 predicates', async () => {
    const registry = await import('../../dist/core/src/services/relationships/predicates/generatedSemanticPredicateRegistry.js');
    const keys = registry.generatedSemanticPredicatePlugins.map((plugin) => plugin.manifest.key);
    assert.deepEqual(keys, ['depicts', 'derived_from', 'represents_photograph']);
    assert.equal(new Set(keys).size, keys.length);
});

test('semantic predicate definitions are snapshotted without deleting unknown persisted definitions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-predicate-registry-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const first = new DatabaseManager(tempDir);
    first.close();

    const reopened = new DatabaseManager(tempDir);
    try {
        const db = reopened.getDb();
        assert.deepEqual(db.prepare(`
            SELECT predicate_key, predicate_version, status
            FROM semantic_predicate_definitions
            ORDER BY predicate_key ASC
        `).all(), [
            { predicate_key: 'depicts', predicate_version: 1, status: 'active' },
            { predicate_key: 'derived_from', predicate_version: 1, status: 'active' },
            { predicate_key: 'represents_photograph', predicate_version: 1, status: 'active' },
        ]);
        db.prepare(`
            INSERT INTO semantic_predicate_definitions (
                predicate_key, predicate_version, definition_json, status
            ) VALUES ('extension.unknown', 7, '{"label":"Unknown"}', 'unavailable')
        `).run();
    } finally {
        reopened.close();
    }

    const finalOpen = new DatabaseManager(tempDir);
    try {
        assert.equal(finalOpen.getDb().prepare(`
            SELECT status
            FROM semantic_predicate_definitions
            WHERE predicate_key = 'extension.unknown' AND predicate_version = 7
        `).get().status, 'unavailable');
    } finally {
        finalOpen.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
