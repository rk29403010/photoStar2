const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-group-diagnostics-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a command response');
            }
            return response;
        },
    };
}

test('get_group_diagnostics_report summarizes overlap inflation and lower-level rollups', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();

    try {
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime)
            VALUES
                ('asset-1', 'C:/photos/one-a.jpg', 'hash-1a', 100, 10, 10, '2026-03-18T10:00:00.000Z'),
                ('asset-2', 'C:/photos/one-b.jpg', 'hash-1b', 101, 10, 10, '2026-03-18T10:00:01.000Z'),
                ('asset-3', 'C:/photos/two-a.jpg', 'hash-2a', 102, 10, 10, '2026-03-18T10:00:02.000Z'),
                ('asset-4', 'C:/photos/two-b.jpg', 'hash-2b', 103, 10, 10, '2026-03-18T10:00:03.000Z')
        `).run();
        db.prepare(`
            INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
            VALUES
                ('group-f882', 'burst', 'proposed', 'asset-1', '1.0', '{}'),
                ('group-0b5a', 'duplicate', 'proposed', 'asset-1', '1.0', '{}'),
                ('group-afed', 'duplicate', 'proposed', 'asset-3', '1.0', '{}')
        `).run();
        db.prepare(`
            INSERT INTO asset_group_members (group_id, asset_id, role, rank)
            VALUES
                ('group-f882', 'asset-1', 'canonical', 0),
                ('group-f882', 'asset-2', 'member', 1),
                ('group-f882', 'asset-3', 'member', 2),
                ('group-f882', 'asset-4', 'member', 3),
                ('group-0b5a', 'asset-1', 'canonical', 0),
                ('group-0b5a', 'asset-2', 'member', 1),
                ('group-afed', 'asset-3', 'canonical', 0),
                ('group-afed', 'asset-4', 'member', 1)
        `).run();

        handleSystemCommand({
            id: 'cmd-group-diagnostics',
            command: 'get_group_diagnostics_report',
            payload: {},
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.report.summary.totalAssets, 4);
        assert.equal(response.data.report.summary.totalMemberships, 8);
        assert.equal(response.data.report.summary.overlappingAssetCount, 4);

        const burstGroup = response.data.report.groups.find((group) => group.groupId === 'group-f882');
        assert.ok(burstGroup);
        assert.equal(burstGroup.groupType, 'burst');
        assert.equal(burstGroup.fileCount, 4);
        assert.equal(burstGroup.underlyingImageEstimate, 2);
        assert.match(burstGroup.summary, /4 files/i);
        assert.match(burstGroup.summary, /2 underlying/i);
        assert.ok(burstGroup.flags.includes('overcount_on_collapse'));
        assert.ok(burstGroup.flags.includes('multi_group_overlap'));
        assert.equal(burstGroup.assets.length, 4);
        assert.deepEqual(
            burstGroup.assets.map((asset) => asset.membershipCount),
            [2, 2, 2, 2],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
