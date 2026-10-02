const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12c-person-'));
}

test('WP12c Person lifecycle defaults machine-only rows to provisional and supports permanent redirect chains', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('person-a', 'A'), ('person-b', 'B'), ('person-c', 'C')").run();
        assert.deepEqual(
            db.prepare('SELECT id, lifecycle_status FROM people ORDER BY id').all(),
            [
                { id: 'person-a', lifecycle_status: 'provisional' },
                { id: 'person-b', lifecycle_status: 'provisional' },
                { id: 'person-c', lifecycle_status: 'provisional' },
            ],
        );

        lifecycle.markPersonConfirmed(db, 'person-b');
        assert.equal(lifecycle.redirectMergedPerson(db, 'person-a', 'person-b', null), 'person-b');
        assert.equal(lifecycle.resolveCurrentPersonId(db, 'person-a'), 'person-b');
        assert.deepEqual(
            db.prepare("SELECT lifecycle_status FROM people WHERE id = 'person-a'").get(),
            { lifecycle_status: 'merged' },
        );

        assert.equal(lifecycle.redirectMergedPerson(db, 'person-b', 'person-c', null), 'person-c');
        assert.equal(lifecycle.resolveCurrentPersonId(db, 'person-a'), 'person-c');
        assert.deepEqual(
            db.prepare('SELECT old_person_id, current_person_id FROM person_redirects ORDER BY old_person_id').all(),
            [
                { old_person_id: 'person-a', current_person_id: 'person-b' },
                { old_person_id: 'person-b', current_person_id: 'person-c' },
            ],
        );
        assert.throws(
            () => lifecycle.redirectMergedPerson(db, 'person-c', 'person-a', null),
            /would create a cycle/,
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12c merged People remain durable while current People UI projection hides them', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { peopleCommandHandlers } = await import('../../dist/core/src/services/handlers/peopleCommands.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('canonical', 'Canonical'), ('old-id', 'Old')").run();
        let mergeResponse = null;
        peopleCommandHandlers.merge_people({
            id: 'merge-command',
            payload: { personIds: ['canonical', 'old-id'], targetName: 'Merged name' },
            originWs: undefined,
            dbManager,
            eventBus: { emit() {} },
            respond(_id, status, data, error) {
                mergeResponse = { status, data, error };
            },
        });

        assert.equal(mergeResponse.status, 'ok');
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people WHERE id = 'old-id'").get().count, 1);
        assert.deepEqual(
            db.prepare("SELECT lifecycle_status FROM people WHERE id = 'old-id'").get(),
            { lifecycle_status: 'merged' },
        );
        assert.equal(lifecycle.resolveCurrentPersonId(db, 'old-id'), 'canonical');

        let peopleResponse = null;
        peopleCommandHandlers.get_people({
            id: 'get-people', payload: {}, originWs: undefined, dbManager,
            eventBus: { emit() {} },
            respond(_id, status, data, error) {
                peopleResponse = { status, data, error };
            },
        });
        assert.equal(peopleResponse.status, 'ok');
        assert.deepEqual(peopleResponse.data.people.map((person) => person.id), ['canonical']);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12c confirmed Person lifecycle survives rebuildable IdentityCluster replacement', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const clusters = await import('../../dist/core/src/services/faces/identityClusterRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('confirmed-person', 'Confirmed')").run();
        lifecycle.markPersonConfirmed(db, 'confirmed-person');

        clusters.replaceIdentityClusters(db, {
            algorithmKey: 'test', algorithmVersion: '1', threshold: 0.6,
            clusters: [{ id: 'machine-a', centroid: [1, 0], members: [] }],
        });
        clusters.replaceIdentityClusters(db, {
            algorithmKey: 'test', algorithmVersion: '1', threshold: 0.7,
            clusters: [{ id: 'machine-b', centroid: [0, 1], members: [] }],
        });

        assert.deepEqual(
            db.prepare("SELECT id, name, lifecycle_status FROM people WHERE id = 'confirmed-person'").get(),
            { id: 'confirmed-person', name: 'Confirmed', lifecycle_status: 'confirmed' },
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
