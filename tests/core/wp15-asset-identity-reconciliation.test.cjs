const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function temporaryStorage() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-wp15-identity-'));
}

function insertAsset(db, id, originalPath, hash, size = 100) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size)
        VALUES (?, ?, ?, ?)
    `).run(id, originalPath, hash, size);
}

test('asset identity reconciliation reattaches only compatible unique content and protects replacement content', async () => {
    const { DatabaseManager } = await import('../../dist/core/src/data/db.js');
    const { ensureAssetIdentityForAsset } = await import('../../dist/core/src/data/assetIdentityRepository.js');
    const { ensureSemanticEntity } = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const { ensureArchiveRepresentation, getArchiveRepresentationsForAsset } = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const storage = temporaryStorage();
    const manager = new DatabaseManager(storage);
    const db = manager.getDb();

    insertAsset(db, 'first', 'C:/photos/image.jpg', 'same-file', 100);
    const firstIdentity = ensureAssetIdentityForAsset(db, 'first');
    const photographId = ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });
    ensureArchiveRepresentation(db, {
        assetId: 'first', subjectEntityId: photographId, representationKind: 'original', sourceKind: 'human',
    });

    db.prepare('DELETE FROM assets WHERE id = ?').run('first');
    insertAsset(db, 'reimported', 'C:/photos/image.jpg', 'same-file', 100);
    assert.equal(ensureAssetIdentityForAsset(db, 'reimported').guid, firstIdentity.guid);

    insertAsset(db, 'replacement', 'C:/photos/image.jpg', 'different-file', 100);
    const replacementIdentity = ensureAssetIdentityForAsset(db, 'replacement');
    assert.notEqual(replacementIdentity.guid, firstIdentity.guid);
    assert.equal(db.prepare('SELECT original_path FROM asset_identities WHERE guid = ?').get(firstIdentity.guid).original_path,
        `detached:${firstIdentity.guid}`);
    assert.equal(db.prepare('SELECT asset_identity_guid FROM archive_representations').get().asset_identity_guid,
        firstIdentity.guid);
    assert.equal(getArchiveRepresentationsForAsset(db, 'replacement').length, 0);
    assert.equal(getArchiveRepresentationsForAsset(db, 'reimported')[0].currentAssetId, 'reimported');

    db.prepare('DELETE FROM assets WHERE id = ?').run('replacement');
    insertAsset(db, 'moved', 'D:/archive/image.jpg', 'different-file', 100);
    assert.equal(ensureAssetIdentityForAsset(db, 'moved').guid, replacementIdentity.guid);

    db.prepare(`INSERT INTO asset_identities (
        guid, original_path, content_hash, content_size, last_known_path
    ) VALUES
        ('duplicate-a', 'detached:duplicate-a', 'ambiguous-file', 77, 'A:/one.jpg'),
        ('duplicate-b', 'detached:duplicate-b', 'ambiguous-file', 77, 'B:/two.jpg')`).run();
    insertAsset(db, 'ambiguous', 'E:/imports/image.jpg', 'ambiguous-file', 77);
    const ambiguous = ensureAssetIdentityForAsset(db, 'ambiguous');
    assert.notEqual(ambiguous.guid, 'duplicate-a');
    assert.notEqual(ambiguous.guid, 'duplicate-b');

    manager.close();
    fs.rmSync(storage, { recursive: true, force: true });
});
