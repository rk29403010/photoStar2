const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp12d-people-'));
}

function commandContext(dbManager, payload = {}) {
    let response = null;
    return {
        ctx: {
            id: 'wp12d-command', payload, originWs: undefined, dbManager,
            eventBus: { emit() {} },
            respond(_id, status, data, error) {
                response = { status, data, error };
            },
        },
        response: () => response,
    };
}

test('WP12d merge preserves canonical metadata and fills missing durable Person metadata and GEDCOM links', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO people (id, name, birth_date, death_date, thumbnail_path)
            VALUES
                ('canonical', 'Canonical', '1900', NULL, NULL),
                ('old-id', 'Old', '1899', '1970', '/old-thumbnail.webp')
        `).run();
        db.prepare(`
            INSERT INTO family_trees (id, filename, file_hash, gedcom_content, tree_group_id)
            VALUES ('tree-a', 'tree.ged', 'hash-a', '0 HEAD', 'group-a')
        `).run();
        db.prepare(`
            INSERT INTO people_gedcom_links (person_id, gedcom_tree_id, gedcom_person_id)
            VALUES ('old-id', 'tree-a', 'I1')
        `).run();

        lifecycle.redirectMergedPerson(db, 'old-id', 'canonical', null);

        assert.deepEqual(
            db.prepare(`
                SELECT birth_date, death_date, thumbnail_path
                FROM people WHERE id = 'canonical'
            `).get(),
            { birth_date: '1900', death_date: '1970', thumbnail_path: '/old-thumbnail.webp' },
        );
        assert.deepEqual(
            db.prepare(`
                SELECT person_id, gedcom_tree_id, gedcom_person_id
                FROM people_gedcom_links
                WHERE person_id = 'canonical'
            `).all(),
            [{ person_id: 'canonical', gedcom_tree_id: 'tree-a', gedcom_person_id: 'I1' }],
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people WHERE id = 'old-id'").get().count, 1);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12d GEDCOM commands resolve historical Person ids to the current Person', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const { gedcomCommandHandlers } = await import('../../dist/core/src/services/handlers/gedcomCommands.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('canonical', 'Canonical'), ('old-id', 'Old')").run();
        db.prepare(`
            INSERT INTO family_trees (id, filename, file_hash, gedcom_content, tree_group_id)
            VALUES ('tree-a', 'tree.ged', 'hash-a', '0 HEAD', 'group-a')
        `).run();
        lifecycle.redirectMergedPerson(db, 'old-id', 'canonical', null);

        const link = commandContext(dbManager, { personId: 'old-id', gedcomTreeId: 'tree-a', gedcomPersonId: 'I1' });
        gedcomCommandHandlers.link_person_to_gedcom(link.ctx);
        assert.equal(link.response().status, 'ok');
        assert.deepEqual(
            db.prepare('SELECT person_id, gedcom_person_id FROM people_gedcom_links').all(),
            [{ person_id: 'canonical', gedcom_person_id: 'I1' }],
        );

        const list = commandContext(dbManager);
        gedcomCommandHandlers.get_people_gedcom_links(list.ctx);
        assert.equal(list.response().status, 'ok');
        assert.deepEqual(list.response().data.links, [
            { person_id: 'canonical', gedcom_tree_id: 'tree-a', gedcom_person_id: 'I1' },
        ]);

        const unlink = commandContext(dbManager, { personId: 'old-id', gedcomTreeId: 'tree-a', gedcomPersonId: 'I1' });
        gedcomCommandHandlers.unlink_person_from_gedcom(unlink.ctx);
        assert.equal(unlink.response().status, 'ok');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM people_gedcom_links').get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP12d person gallery filters follow permanent Person redirects', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const lifecycle = await import('../../dist/core/src/services/faces/personLifecycleRepository.js');
    const { buildFilterSubquery } = await import('../../dist/core/src/services/handlers/assetQueryFilters.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-a', 'C:/a.jpg')").run();
        db.prepare("INSERT INTO people (id, name) VALUES ('canonical', 'Canonical'), ('old-id', 'Old')").run();
        lifecycle.redirectMergedPerson(db, 'old-id', 'canonical', null);
        db.prepare(`
            INSERT INTO face_assignments (asset_id, face_index, person_id, confidence)
            VALUES ('asset-a', 0, 'canonical', 0.9)
        `).run();

        const params = [];
        const filter = buildFilterSubquery({ type: 'person_any', personIds: ['old-id'] }, params);
        const rows = db.prepare(`SELECT a.id FROM assets a WHERE 1=1 ${filter}`).all(...params);
        assert.deepEqual(rows, [{ id: 'asset-a' }]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
