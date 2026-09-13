const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tempDirectory(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `photostar-wp15-${label}-`));
}

function seedAssets(db) {
    db.prepare(`INSERT INTO assets (id, original_path, file_hash, binned_at) VALUES
        ('source', 'C:/archive/source.jpg', 'source-hash', NULL),
        ('rendered', 'C:/archive/rendered.jpg', 'rendered-hash', NULL),
        ('unreferenced', 'C:/archive/transient.jpg', 'transient-hash', '2026-09-12T12:00:00.000Z')
    `).run();
}

function seedPeopleAndGedcom(db) {
    db.prepare(`INSERT INTO people (id, name, lifecycle_status) VALUES
        ('confirmed', 'Confirmed person', 'confirmed'),
        ('merged', 'Merged person', 'merged'),
        ('manual-reference', 'Manually assigned person', 'provisional'),
        ('provisional', 'Machine person', 'provisional')
    `).run();
    db.prepare(`INSERT INTO face_assignments (asset_id, face_index, person_id, is_suggested)
        VALUES ('source', 0, 'manual-reference', 0)`).run();
    db.prepare(`INSERT INTO person_redirects (old_person_id, current_person_id)
        VALUES ('merged', 'confirmed')`).run();
    db.prepare(`INSERT INTO family_trees (
        id, filename, file_hash, gedcom_content, tree_group_id, version_label, home_person_id
    ) VALUES ('tree', 'family.ged', 'tree-hash', '0 HEAD', 'family', 'v1', 'I1')`).run();
    db.prepare(`INSERT INTO people_gedcom_links (person_id, gedcom_tree_id, gedcom_person_id)
        VALUES ('confirmed', 'tree', 'I1')`).run();
}

function seedEditsAndMetadata(db) {
    db.prepare(`INSERT INTO photo_edit_documents (
        id, source_asset_id, rendered_asset_id, name, operations_json, masks_json, status
    ) VALUES ('edit-parent', 'source', 'rendered', 'Restoration', '[]', '[]', 'rendered')`).run();
    db.prepare(`INSERT INTO photo_edit_documents (
        id, source_asset_id, parent_edit_id, name, operations_json, masks_json
    ) VALUES ('edit-child', 'source', 'edit-parent', 'Crop', '[]', '[]')`).run();
    db.prepare(`INSERT INTO photo_edit_styles (id, name, operations_json, masks_json)
        VALUES ('style', 'Family style', '[]', '[]')`).run();
    db.prepare(`INSERT INTO photo_metadata_assertions (
        id, asset_id, field_path, value_json, user_id, note
    ) VALUES ('assertion', 'source', 'caption', '"At the seaside"', 'contributor', 'From album note')`).run();
}

function seedTagsAlbumsAndReviews(db) {
    db.prepare(`INSERT INTO tag_definitions (id, canonical_label, description, status, category)
        VALUES ('tag', 'family', 'Family archive', 'active', 'people')`).run();
    db.prepare(`INSERT INTO tag_aliases (id, tag_definition_id, alias_label)
        VALUES ('alias', 'tag', 'relatives')`).run();
    db.prepare(`INSERT INTO asset_tag_assignments (
        asset_id, tag_definition_id, source_kind, source_record_id, confidence
    ) VALUES
        ('source', 'tag', 'manual', 'manual-action', 1),
        ('rendered', 'tag', 'ai', 'model-run', 0.8)
    `).run();
    db.prepare(`INSERT INTO albums (id, title, cover_asset_id, is_system, system_kind) VALUES
        ('album', 'Family album', 'source', 0, NULL),
        ('system:bin', 'Bin', NULL, 1, 'bin')
    `).run();
    db.prepare(`INSERT INTO album_items (album_id, asset_id) VALUES
        ('album', 'rendered'),
        ('system:bin', 'unreferenced')
    `).run();
    db.prepare(`INSERT INTO review_items (
        id, review_item_type, subject_type, subject_id, payload_json, status,
        reviewer_id, review_note, reviewed_at
    ) VALUES
        ('reviewed', 'tag_proposal', 'asset', 'source', '{}', 'approved', 'reviewer', 'Keep this', '2026-09-12'),
        ('pending', 'tag_proposal', 'asset', 'unreferenced', '{}', 'pending', NULL, NULL, NULL)
    `).run();
}

function tableRows(db, table) {
    return db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all();
}

test('WP15 durable library snapshot restores human state and discards rebuildable rows', async () => {
    const sourceDirectory = tempDirectory('source');
    const targetDirectory = tempDirectory('target');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const resetState = await import('../../dist/core/src/data/durableLibraryResetState.js');
    const sourceManager = new DatabaseManager(sourceDirectory);
    const targetManager = new DatabaseManager(targetDirectory);
    try {
        const source = sourceManager.getDb();
        source.pragma('foreign_keys = ON');
        seedAssets(source);
        seedPeopleAndGedcom(source);
        seedEditsAndMetadata(source);
        seedTagsAlbumsAndReviews(source);

        const snapshot = resetState.snapshotDurableLibraryResetState(source);
        const target = targetManager.getDb();
        target.pragma('foreign_keys = ON');
        target.transaction(() => resetState.restoreDurableLibraryResetState(target, snapshot))();

        assert.deepEqual(tableRows(target, 'people').map((row) => row.id), ['confirmed', 'manual-reference', 'merged']);
        assert.deepEqual(tableRows(target, 'person_redirects'), tableRows(source, 'person_redirects'));
        assert.deepEqual(tableRows(target, 'family_trees'), tableRows(source, 'family_trees'));
        assert.deepEqual(tableRows(target, 'people_gedcom_links'), tableRows(source, 'people_gedcom_links'));
        assert.deepEqual(tableRows(target, 'photo_edit_documents'), tableRows(source, 'photo_edit_documents'));
        assert.deepEqual(tableRows(target, 'photo_edit_styles'), tableRows(source, 'photo_edit_styles'));
        assert.deepEqual(tableRows(target, 'photo_metadata_assertions'), tableRows(source, 'photo_metadata_assertions'));
        assert.deepEqual(tableRows(target, 'tag_definitions'), tableRows(source, 'tag_definitions'));
        assert.deepEqual(tableRows(target, 'tag_aliases'), tableRows(source, 'tag_aliases'));
        assert.deepEqual(tableRows(target, 'asset_tag_assignments').map((row) => row.source_kind), ['manual']);
        assert.deepEqual(tableRows(target, 'albums').map((row) => row.id), ['album']);
        assert.deepEqual(tableRows(target, 'album_items').map((row) => row.album_id), ['album']);
        assert.deepEqual(tableRows(target, 'review_items').map((row) => row.id), ['reviewed']);
        assert.deepEqual(tableRows(target, 'assets').map((row) => row.id), ['rendered', 'source', 'unreferenced']);
        assert.equal(
            target.prepare("SELECT binned_at FROM assets WHERE id = 'unreferenced'").get().binned_at,
            '2026-09-12T12:00:00.000Z',
        );
        assert.equal(target.prepare("SELECT parent_edit_id FROM photo_edit_documents WHERE id = 'edit-child'").get().parent_edit_id, 'edit-parent');
        assert.equal(target.prepare("SELECT cover_asset_id FROM albums WHERE id = 'album'").get().cover_asset_id, 'source');
    } finally {
        sourceManager.close();
        targetManager.close();
        fs.rmSync(sourceDirectory, { recursive: true, force: true });
        fs.rmSync(targetDirectory, { recursive: true, force: true });
    }
});
