const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    createTempDir,
    seedAsset,
} = require('./workflow-runtime-grouping.helpers.cjs');

async function runCommand(dbManager, tempDir, command, payload = {}) {
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let response;
    await handleSystemCommand({
        id: `presentation-preference-${command}`,
        command,
        payload,
        dbManager,
        eventBus: {},
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: (id, status, data, error) => {
            response = { id, status, data, error };
        },
    });
    assert.equal(response?.status, 'ok', response?.error ?? `No response for ${command}`);
    return response.data;
}

function seedExactCopies(dbManager) {
    seedAsset(dbManager, {
        id: 'copy-small',
        originalPath: 'C:/photos/copy-small.jpg',
        fileHash: 'same-content',
        fileSize: 1000,
        width: 1200,
        height: 800,
    });
    seedAsset(dbManager, {
        id: 'copy-best',
        originalPath: 'C:/photos/copy-best.jpg',
        fileHash: 'same-content',
        fileSize: 2000,
        width: 1200,
        height: 800,
    });
}

function semanticHistoryCounts(db) {
    return {
        attestations: db.prepare('SELECT COUNT(*) AS count FROM semantic_attestations').get().count,
        decisions: db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count,
    };
}

test('semantic presentation actions use durable UI preferences without semantic evidence', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedExactCopies(dbManager);
        const initial = await runCommand(dbManager, tempDir, 'get_assets', {
            limit: 20,
            offset: 0,
            withGroupCounts: true,
            galleryOrder: 'default',
        });
        assert.equal(initial.presentationItems.length, 1);
        const stack = initial.presentationItems[0];
        assert.equal(stack.relationshipKind, 'exact_copy');
        assert.equal(stack.representativeAssetId, 'copy-best');
        assert.equal(stack.stackCount, 2);
        assert.match(stack.presentationKey, /^exact:/);

        const expansionResult = await runCommand(dbManager, tempDir, 'get_library_presentation_expansion', {
            presentationKey: stack.presentationKey,
        });
        assert.equal(expansionResult.expansion.presentationKey, stack.presentationKey);
        assert.equal(expansionResult.expansion.relationshipKind, 'exact_copy');
        assert.equal(expansionResult.expansion.representativeAssetId, 'copy-best');
        assert.deepEqual(
            expansionResult.expansion.items.map((entry) => ({
                id: entry.asset.id,
                ordinal: entry.ordinal,
                isRepresentative: entry.isRepresentative,
            })),
            [
                { id: 'copy-best', ordinal: 0, isRepresentative: true },
                { id: 'copy-small', ordinal: 1, isRepresentative: false },
            ],
        );

        const db = dbManager.getDb();
        const semanticBefore = semanticHistoryCounts(db);
        await runCommand(dbManager, tempDir, 'set_library_presentation_cover', {
            presentationKey: stack.presentationKey,
            assetId: 'copy-small',
        });
        const covered = await runCommand(dbManager, tempDir, 'get_assets', {
            limit: 20,
            offset: 0,
            withGroupCounts: true,
            galleryOrder: 'default',
        });
        assert.equal(covered.presentationItems[0].representativeAssetId, 'copy-small');
        assert.deepEqual(semanticHistoryCounts(db), semanticBefore);

        await runCommand(dbManager, tempDir, 'set_library_presentation_show_separately', {
            presentationKey: stack.presentationKey,
            showSeparately: true,
        });
        const separate = await runCommand(dbManager, tempDir, 'get_assets', {
            limit: 20,
            offset: 0,
            withGroupCounts: true,
            galleryOrder: 'default',
        });
        assert.equal(separate.total, 2);
        assert.equal(separate.presentationItems.length, 2);
        assert.deepEqual(
            new Set(separate.presentationItems.map((item) => item.representativeAssetId)),
            new Set(['copy-best', 'copy-small']),
        );
        assert.ok(separate.presentationItems.every((item) => item.relationshipKind === null));
        assert.ok(separate.presentationItems.every((item) => item.stackCount === 1));
        assert.deepEqual(semanticHistoryCounts(db), semanticBefore);

        const preferenceBeforeReset = db.prepare(`
            SELECT cluster_fingerprint, preferred_asset_identity_guid, show_separately
            FROM library_presentation_preferences
        `).get();
        assert.equal(preferenceBeforeReset.show_separately, 1);
        assert.ok(preferenceBeforeReset.preferred_asset_identity_guid);

        dbManager.resetPreservingManualData();
        const preferenceAfterReset = dbManager.getDb().prepare(`
            SELECT cluster_fingerprint, preferred_asset_identity_guid, show_separately
            FROM library_presentation_preferences
        `).get();
        assert.deepEqual(preferenceAfterReset, preferenceBeforeReset);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
