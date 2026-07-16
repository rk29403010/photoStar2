const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('photo edit documents and styles persist independently from source assets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-edit-schema-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('source', 'C:/photos/source.jpg')").run();
        db.prepare(`INSERT INTO photo_edit_documents
            (id, source_asset_id, name, operations_json, masks_json)
            VALUES ('edit', 'source', 'Restoration', '[]', '[]')`).run();
        db.prepare(`INSERT INTO photo_edit_styles
            (id, name, operations_json, masks_json)
            VALUES ('style', 'Family archive', '[]', '[]')`).run();

        const edit = db.prepare("SELECT * FROM photo_edit_documents WHERE id = 'edit'").get();
        assert.equal(edit.source_asset_id, 'source');
        assert.equal(edit.status, 'draft');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photo_edit_styles').get().count, 1);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
