const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('WP15 interrupted soft rebuild keeps the prior database usable and retry cleans swap files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-wp15-reset-recovery-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let manager = new DatabaseManager(directory);
    try {
        manager.getDb().prepare(
            "INSERT INTO asset_identities (guid, original_path) VALUES ('durable-asset', 'C:/archive/photo.jpg')",
        ).run();
        manager.getDb().prepare(
            "INSERT INTO settings (id, value) VALUES ('durable-setting', 'keep-me')",
        ).run();

        const restore = manager.restoreSoftResetState;
        manager.restoreSoftResetState = () => {
            throw new Error('injected restore failure');
        };
        assert.throws(() => manager.resetPreservingManualData(), /injected restore failure/);
        assert.equal(manager.getSetting('durable-setting'), 'keep-me');
        assert.equal(
            manager.getDb().prepare("SELECT guid FROM asset_identities WHERE guid = 'durable-asset'").get().guid,
            'durable-asset',
        );
        assert.equal(fs.existsSync(path.join(directory, 'library.db.soft-reset-replacement')), false);

        manager.restoreSoftResetState = restore;
        manager.resetPreservingManualData();
        manager.close();
        manager = new DatabaseManager(directory);
        assert.equal(manager.getSetting('durable-setting'), 'keep-me');
        assert.equal(fs.existsSync(path.join(directory, 'library.db.soft-reset-backup')), false);
        assert.equal(fs.existsSync(path.join(directory, 'library.db.soft-reset-replacement')), false);
    } finally {
        manager.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('WP15 startup recovers the old database when a soft-reset backup marker remains', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-wp15-reset-restart-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let manager = new DatabaseManager(directory);
    try {
        manager.setSetting('recovery-proof', 'old-database');
        manager.close();
        fs.renameSync(
            path.join(directory, 'library.db'),
            path.join(directory, 'library.db.soft-reset-backup'),
        );
        fs.writeFileSync(path.join(directory, 'library.db'), 'incomplete replacement');

        manager = new DatabaseManager(directory);
        assert.equal(manager.getSetting('recovery-proof'), 'old-database');
        assert.equal(fs.existsSync(path.join(directory, 'library.db.soft-reset-backup')), false);
    } finally {
        manager.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
