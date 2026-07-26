const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

test('render_photo_edit creates a derived canonical asset and preserves the source', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-edit-command-'));
    const sourcePath = path.join(tempDir, 'source.png');
    const sourceBytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#806040' } }).png().toBuffer();
    fs.writeFileSync(sourcePath, sourceBytes);
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    let response;
    try {
        dbManager.getDb().prepare('INSERT INTO assets (id, original_path, width, height) VALUES (?, ?, 64, 48)').run('source', sourcePath);
        await handleSystemCommand({
            id: 'render-edit',
            command: 'render_photo_edit',
            payload: {
                id: 'edit-1', sourceAssetId: 'source', name: 'Restored', mode: 'new_version', masks: [],
                operations: [{ id: 'adjust-1', tool: 'adjust', name: 'Tune image', enabled: true, maskId: null, values: { brightness: 1.2, contrast: 0.1, saturation: 1, hue: 0 } }],
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: (id, status, data, error) => { response = { id, status, data, error }; },
        });

        assert.equal(response.status, 'ok');
        assert.notEqual(response.data.assetId, 'source');
        assert.deepEqual(fs.readFileSync(sourcePath), sourceBytes);
        const group = dbManager.getDb().prepare("SELECT * FROM asset_groups WHERE type = 'edit_version'").get();
        assert.equal(group.canonical_asset_id, response.data.assetId);
        const members = dbManager.getDb().prepare('SELECT asset_id, role FROM asset_group_members WHERE group_id = ? ORDER BY role').all(group.id);
        assert.deepEqual(members, [{ asset_id: response.data.assetId, role: 'canonical' }, { asset_id: 'source', role: 'original' }]);
        assert.equal(dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM previews WHERE asset_id = ?').get(response.data.assetId).count, 2);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('style recipes receive installed tool versions and retain unavailable operations', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-style-command-'));
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const execute = async (command, payload) => {
        let response;
        await handleSystemCommand({ id: command, command, payload, dbManager, eventBus: { emit() {} }, activeJobs: new Map(), LIB_DIR: tempDir, respond: (id, status, data, error) => { response = { id, status, data, error }; } });
        return response;
    };
    try {
        dbManager.getDb().prepare("INSERT INTO assets (id, original_path) VALUES ('source', 'C:/photos/source.jpg')").run();
        const operations = [
            { id: 'adjust', tool: 'adjust', name: 'Tune image', enabled: true, values: { brightness: 1 } },
            { id: 'missing', tool: 'removed_tool', name: 'Removed tool', enabled: true, values: { amount: 3 } },
        ];
        assert.equal((await execute('save_photo_edit_style', { id: 'style', name: 'Portable', operations, masks: [] })).status, 'ok');
        const persisted = JSON.parse(dbManager.getDb().prepare('SELECT operations_json FROM photo_edit_styles WHERE id = ?').get('style').operations_json);
        assert.equal(persisted[0].recipeVersion, 1);
        assert.equal(persisted[1].recipeVersion, undefined);
        const workspace = await execute('get_photo_edit_workspace', { assetId: 'source' });
        assert.equal(workspace.status, 'ok');
        assert.deepEqual(workspace.data.styles[0].unavailableOperationIds, ['missing']);
        assert.deepEqual(workspace.data.styles[0].operations.map((operation) => operation.id), ['adjust', 'missing']);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('style recipe resolution applies plug-in migrations and keeps unsupported future recipes', async () => {
    const { PhotoEditToolRegistry } = await import('../../dist/core/src/services/photoEditing/photoEditToolRegistry.js');
    const { resolvePhotoEditStyleWithRegistry } = await import('../../dist/core/src/services/photoEditing/photoEditStyleRecipes.js');
    const registry = new PhotoEditToolRegistry();
    registry.registerPlugin({
        id: 'example', recipeVersion: 2, label: 'Example', icon: 'Example', group: 'test', defaults: {},
        migrateOperation: (operation) => ({ ...operation, values: { ...operation.values, migrated: 1 } }),
        validateOperation: (operation) => assert.equal(operation.values.migrated, 1),
    });
    const resolved = resolvePhotoEditStyleWithRegistry({ id: 'style', name: 'Migrated', masks: [], createdAt: '', updatedAt: '', operations: [
        { id: 'old', tool: 'example', name: 'Example', enabled: true, values: {}, recipeVersion: 1 },
        { id: 'future', tool: 'example', name: 'Example', enabled: true, values: {}, recipeVersion: 3 },
    ] }, registry);
    assert.equal(resolved.operations[0].recipeVersion, 2);
    assert.equal(resolved.operations[0].values.migrated, 1);
    assert.deepEqual(resolved.unavailableOperationIds, ['future']);
});
