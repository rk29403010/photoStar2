const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-photo-metadata-resolver-'));
}

function createBlock(overrides) {
    return {
        type: 'Family portrait',
        caption: 'Scout caption',
        description: 'Scout description',
        location: 'Scout location',
        estimated_date: {
            most_likely_date: '1968-12-24T00:00:00.000Z',
            min_date: '1968-01-01T00:00:00.000Z',
            max_date: '1968-12-31T23:59:59.999Z',
            display_label: 'late 1968',
            rationale: 'Scout pass estimate.',
        },
        subjects: [],
        regions_of_interest: [],
        keywords: ['family', 'christmas'],
        emotional_impact: 'Warm',
        quality: { technical: 4, lighting: 4, composition: 4, emotional: 5, discard: false },
        recommended_enhancements: ['Tighten crop'],
        authenticity: { score: 0.82, reasons: ['family context'] },
        ...overrides,
    };
}

function seedAsset(db) {
    db.prepare(`
        INSERT INTO assets (id, original_path, created_at)
        VALUES ('asset-1', 'C:/photos/family-1968.jpg', '2026-03-27T09:00:00.000Z')
    `).run();
}

async function createResolverTools(dbManager) {
    const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
    const { createPhotoMetadataManualAssertionsService } = await import('../../dist/core/src/services/photoMetadata/manualAssertions.js');
    const { createPhotoMetadataResolver } = await import('../../dist/core/src/services/photoMetadata/resolver.js');

    return {
        repository: createPhotoMetadataRepository({ dbManager }),
        manualAssertions: createPhotoMetadataManualAssertionsService({ dbManager }),
        resolver: createPhotoMetadataResolver({ dbManager }),
    };
}

function seedPrimaryResolverScenario(repository, manualAssertions) {
    const scoutBlockId = repository.insertMetadataBlock({
        assetId: 'asset-1',
        sourceKind: 'gemini_flash_scout',
        provider: 'google',
        modelVersion: 'gemini-2.5-flash',
        schemaVersion: 1,
        block: createBlock({
            caption: 'Scout caption',
            description: 'Scout description',
            location: 'Scout location',
        }),
    });
    const refinedBlockId = repository.insertMetadataBlock({
        assetId: 'asset-1',
        sourceKind: 'gemini_pro_refined',
        provider: 'google',
        modelVersion: 'gemini-3.1-pro-preview',
        schemaVersion: 1,
        block: createBlock({
            caption: 'Refined caption',
            description: 'Refined description',
            location: 'Refined location',
            estimated_date: {
                most_likely_date: '1968-12-25T00:00:00.000Z',
                min_date: '1968-12-24T00:00:00.000Z',
                max_date: '1968-12-26T23:59:59.999Z',
                display_label: 'Christmas 1968',
                rationale: 'Refined pass found the Christmas dinner context.',
            },
            keywords: ['family', 'christmas', 'dinner'],
        }),
    });

    const captionAssertion = manualAssertions.recordManualAssertion({
        assetId: 'asset-1',
        fieldPath: 'caption',
        value: 'Billy and Dad enjoying Christmas dinner',
        userId: 'user-father-in-law',
        note: 'Family memory confirmed the caption.',
    });
    const displayLabelAssertion = manualAssertions.recordManualAssertion({
        assetId: 'asset-1',
        fieldPath: 'estimated_date.display_label',
        value: 'late 1968',
        userId: 'user-father-in-law',
        note: 'Family memory narrowed the display label.',
    });

    return {
        scoutBlockId,
        refinedBlockId,
        captionAssertion,
        displayLabelAssertion,
    };
}

function assertPrimaryResolverScenario(result) {
    const { bundle, projectionRow, ids } = result;

    assert.equal(bundle.projection.assetId, 'asset-1');
    assert.equal(bundle.projection.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(bundle.projection.description, 'Refined description');
    assert.equal(bundle.projection.location, 'Refined location');
    assert.equal(bundle.projection.estimatedDate.display_label, 'late 1968');
    assert.equal(bundle.provenance.caption.sourceKind, 'manual');
    assert.equal(bundle.provenance.caption.sourceId, ids.captionAssertion.id);
    assert.equal(bundle.provenance.description.sourceKind, 'gemini_pro_refined');
    assert.equal(bundle.provenance.description.sourceId, ids.refinedBlockId);
    assert.equal(bundle.provenance.location.sourceKind, 'gemini_pro_refined');
    assert.equal(bundle.provenance.location.sourceId, ids.refinedBlockId);
    assert.equal(bundle.provenance.estimatedDate.sourceKind, 'gemini_pro_refined');
    assert.equal(bundle.provenance.estimatedDate.sourceId, ids.refinedBlockId);
    assert.equal(bundle.provenance.estimatedDate.display_label.sourceKind, 'manual');
    assert.equal(bundle.provenance.estimatedDate.display_label.sourceId, ids.displayLabelAssertion.id);
    assert.equal(bundle.provenance.estimatedDate.most_likely_date.sourceKind, 'gemini_pro_refined');
    assert.equal(bundle.provenance.estimatedDate.most_likely_date.sourceId, ids.refinedBlockId);
    assert.equal(bundle.evidence.machineBlocks.length, 2);
    assert.equal(bundle.evidence.manualAssertions.length, 2);
    assert.ok(bundle.evidence.manualAssertions.some((assertion) => assertion.id === ids.captionAssertion.id));
    assert.ok(bundle.evidence.manualAssertions.some((assertion) => assertion.id === ids.displayLabelAssertion.id));
    assert.ok(bundle.evidence.machineBlocks.some((block) => block.id === ids.scoutBlockId));
    assert.ok(bundle.evidence.machineBlocks.some((block) => block.id === ids.refinedBlockId));
    assert.equal(projectionRow?.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(projectionRow?.caption_source_kind, 'manual');
    assert.equal(projectionRow?.caption_source_id, ids.captionAssertion.id);
    assert.equal(projectionRow?.estimated_date_display_label, 'late 1968');
    assert.equal(projectionRow?.estimated_date_source_kind, 'gemini_pro_refined');
    assert.equal(projectionRow?.estimated_date_source_id, ids.refinedBlockId);
    assert.equal(projectionRow?.description, 'Refined description');
    assert.equal(projectionRow?.description_source_kind, 'gemini_pro_refined');
    assert.equal(projectionRow?.description_source_id, ids.refinedBlockId);
}

test('resolver prefers manual field edits and keeps unrelated fields machine-derived', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);
        const tools = await createResolverTools(dbManager);
        const ids = seedPrimaryResolverScenario(tools.repository, tools.manualAssertions);
        const bundle = tools.resolver.resolvePhotoMetadata('asset-1');
        const projectionRow = tools.repository.loadProjection('asset-1');

        assertPrimaryResolverScenario({ bundle, projectionRow, ids });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('refined machine evidence beats scout evidence when no manual override exists', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db);

        const { createPhotoMetadataRepository } = await import('../../dist/core/src/services/photoMetadata/repository.js');
        const { createPhotoMetadataResolver } = await import('../../dist/core/src/services/photoMetadata/resolver.js');
        const repository = createPhotoMetadataRepository({ dbManager });

        const scoutBlockId = repository.insertMetadataBlock({
            assetId: 'asset-1',
            sourceKind: 'gemini_flash_scout',
            provider: 'google',
            modelVersion: 'gemini-2.5-flash',
            schemaVersion: 1,
            block: createBlock({
                caption: 'Scout caption',
                description: 'Scout description',
                location: 'Scout location',
            }),
        });
        const refinedBlockId = repository.insertMetadataBlock({
            assetId: 'asset-1',
            sourceKind: 'gemini_pro_refined',
            provider: 'google',
            modelVersion: 'gemini-3.1-pro-preview',
            schemaVersion: 1,
            block: createBlock({
                caption: 'Refined caption',
                description: 'Refined description',
                location: 'Refined location',
            }),
        });

        const resolver = createPhotoMetadataResolver({ dbManager });
        const bundle = resolver.resolvePhotoMetadata('asset-1');
        const projectionRow = repository.loadProjection('asset-1');

        assert.equal(bundle.projection.caption, 'Refined caption');
        assert.equal(bundle.projection.description, 'Refined description');
        assert.equal(bundle.projection.location, 'Refined location');
        assert.equal(bundle.provenance.caption.sourceKind, 'gemini_pro_refined');
        assert.equal(bundle.provenance.caption.sourceId, refinedBlockId);
        assert.equal(bundle.provenance.description.sourceKind, 'gemini_pro_refined');
        assert.equal(bundle.provenance.description.sourceId, refinedBlockId);
        assert.equal(bundle.provenance.location.sourceKind, 'gemini_pro_refined');
        assert.equal(bundle.provenance.location.sourceId, refinedBlockId);
        assert.ok(bundle.evidence.machineBlocks.some((block) => block.id === scoutBlockId));
        assert.ok(bundle.evidence.machineBlocks.some((block) => block.id === refinedBlockId));
        assert.equal(projectionRow?.caption, 'Refined caption');
        assert.equal(projectionRow?.caption_source_kind, 'gemini_pro_refined');
        assert.equal(projectionRow?.caption_source_id, refinedBlockId);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
