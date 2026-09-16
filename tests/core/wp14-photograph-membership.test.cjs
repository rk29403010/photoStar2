const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp14-membership-'));
}

function seedAsset(db, id, originalPath, fileHash = null) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height)
        VALUES (?, ?, ?, 1000, 1000, 800)
    `).run(id, originalPath, fileHash);
}

async function loadServices() {
    return {
        semantic: await import('../../dist/core/src/services/relationships/semanticRepository.js'),
        representations: await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js'),
        membership: await import('../../dist/core/src/services/relationships/photographMembershipRepository.js'),
    };
}

test('WP14a resolves whole-Asset Photograph membership through one current representation path', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { semantic, representations, membership } = await loadServices();
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'scan', 'C:/archive/scan.tif');
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'scan',
            subjectEntityId: photograph,
            representationKind: 'scan',
            sourceKind: 'human',
        });

        const resolved = membership.resolveAssetPhotographMembership(db, 'scan');
        assert.equal(resolved.status, 'resolved');
        assert.equal(resolved.photographEntityId, photograph);
        assert.equal(resolved.source, 'direct_representation');
        assert.ok(resolved.sourceRepresentationId);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP14a keeps VisualRegion propositions as evidence until an explicit decision resolves membership', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { semantic, membership } = await loadServices();
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'album-page', 'C:/archive/page.tif');
        db.prepare('INSERT INTO asset_identities (guid, original_path) VALUES (?, ?)')
            .run('asset-guid-page', 'C:/archive/page.tif');
        const region = semantic.ensureSemanticEntity(db, { kind: 'region', nativeId: 'region-1' });
        db.prepare('INSERT INTO visual_regions (id, asset_identity_guid) VALUES (?, ?)')
            .run(region, 'asset-guid-page');
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-extracted' });
        const scopeKey = membership.visualRegionPhotographMembershipScopeKey(region);
        const propositionId = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: region,
            predicate: 'represents_photograph',
            object: { type: 'entity', entityId: photograph },
        });
        semantic.addSemanticAttestation(db, {
            propositionId,
            stance: 'support',
            sourceKind: 'machine',
            sourceIdentity: 'frame-detector:v1',
        });

        const proposed = membership.resolveVisualRegionPhotographMembership(db, region);
        assert.equal(proposed.status, 'unresolved');
        assert.equal(proposed.photographEntityId, null);
        assert.deepEqual(proposed.candidatePhotographEntityIds, [photograph]);

        membership.recordVisualRegionPhotographMembership(db, {
            visualRegionId: region,
            photographEntityId: photograph,
            sourceKind: 'human',
            sourceRef: 'owner-review',
        });
        const accepted = membership.resolveVisualRegionPhotographMembership(db, region);
        assert.equal(accepted.status, 'resolved');
        assert.equal(accepted.photographEntityId, photograph);
        assert.equal(accepted.source, 'semantic_decision');
        assert.ok(accepted.decisionId);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP14a replaces VisualRegion current resolution append-only without a competing membership table', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { semantic, membership } = await loadServices();
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'page', 'C:/archive/page-2.tif');
        db.prepare('INSERT INTO asset_identities (guid, original_path) VALUES (?, ?)')
            .run('asset-guid-page-2', 'C:/archive/page-2.tif');
        const region = semantic.ensureSemanticEntity(db, { kind: 'region', nativeId: 'region-2' });
        db.prepare('INSERT INTO visual_regions (id, asset_identity_guid) VALUES (?, ?)')
            .run(region, 'asset-guid-page-2');
        const first = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-first' });
        const second = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-second' });

        membership.recordVisualRegionPhotographMembership(db, {
            visualRegionId: region,
            photographEntityId: first,
            sourceKind: 'human',
        });
        membership.recordVisualRegionPhotographMembership(db, {
            visualRegionId: region,
            photographEntityId: second,
            sourceKind: 'human',
        });

        const resolved = membership.resolveVisualRegionPhotographMembership(db, region);
        assert.equal(resolved.photographEntityId, second);
        const decisions = db.prepare(`
            SELECT is_current FROM semantic_decisions
            WHERE scope_key = ? ORDER BY created_at, id
        `).all(membership.visualRegionPhotographMembershipScopeKey(region));
        assert.equal(decisions.length, 2);
        assert.equal(decisions.filter((row) => row.is_current === 1).length, 1);
        const membershipTables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name LIKE '%photograph%membership%'
        `).all();
        assert.deepEqual(membershipTables, []);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP14b exact copies inherit one resolved Photograph from content identity without legacy groups', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { semantic, representations, membership } = await loadServices();
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'original', 'C:/archive/original.jpg', 'sha256-same');
        seedAsset(db, 'copy', 'D:/backup/copy.jpg', 'sha256-same');
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-copy-set' });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'original',
            subjectEntityId: photograph,
            representationKind: 'original',
            sourceKind: 'human',
        });

        const copyMembership = membership.resolveAssetPhotographMembership(db, 'copy');
        assert.equal(copyMembership.status, 'resolved');
        assert.equal(copyMembership.photographEntityId, photograph);
        assert.equal(copyMembership.source, 'exact_copy');
        assert.equal(copyMembership.sourceAssetId, 'original');
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'asset_groups'`).get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP14b does not guess when exact-copy peers carry conflicting Photograph membership', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { semantic, representations, membership } = await loadServices();
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'copy-a', 'C:/archive/a.jpg', 'sha256-conflict');
        seedAsset(db, 'copy-b', 'C:/archive/b.jpg', 'sha256-conflict');
        seedAsset(db, 'copy-c', 'C:/archive/c.jpg', 'sha256-conflict');
        const first = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-a' });
        const second = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-b' });
        for (const [assetId, photograph] of [['copy-a', first], ['copy-b', second]]) {
            representations.ensureArchiveRepresentation(db, {
                assetId,
                subjectEntityId: photograph,
                representationKind: 'original',
                sourceKind: 'human',
            });
        }

        const resolution = membership.resolveAssetPhotographMembership(db, 'copy-c');
        assert.equal(resolution.status, 'disputed');
        assert.equal(resolution.photographEntityId, null);
        assert.deepEqual(resolution.candidatePhotographEntityIds, [first, second].sort());
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
