const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Mock keytar for test execution
require.cache[require.resolve('keytar')] = {
    id: require.resolve('keytar'),
    filename: require.resolve('keytar'),
    loaded: true,
    exports: {
        getPassword: async () => 'AIzaSyDUMMYKEY12345678901234567890',
        setPassword: async () => {},
        deletePassword: async () => true,
    }
};

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-selection-metadata-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 9) {
                console.warn(`[Test Cleanup] Could not delete temp dir ${targetPath}: ${error.message}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
    }
}

async function createHarness(tempDir, options = {}) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { expandSelectionPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/expand-selection/plugin.js');
    const { createGenerateAiMetadataScoutPluginModule: createGenerateAiMetadataScoutModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
    const { estimatePhotoDatePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/plugin.js');
    const { detectPrintTexturePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-print-texture/plugin.js');
    const { selectedSubjectMetadataWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    dbManager.setSetting('ai_metadata_v2_api_key', 'AIzaSyDUMMYKEY12345678901234567890');
    const db = dbManager.getDb();
    const assetOnePath = createAssetFile(tempDir, 'asset-one.jpg');
    const assetTwoPath = createAssetFile(tempDir, 'asset-two.jpg');
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
        VALUES
        ('asset-1', ?, NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP),
        ('asset-2', ?, NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP)
    `).run(assetOnePath, assetTwoPath);

    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    subjects.register({
        id: 'selection',
        version: 1,
        durable: false,
        summary: { titleField: 'id', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'selection', plural: 'selections' },
    });
    subjects.register({
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'file', plural: 'files' },
    });

    modules.registerPlugin(expandSelectionPlugin);
    modules.register(createGenerateAiMetadataScoutModule({
        dbManager,
        aiRuntime: options.aiRuntime,
    }));
    modules.registerPlugin(estimatePhotoDatePlugin, { dbManager });
    modules.registerPlugin(detectPrintTexturePlugin, { dbManager });
    workflows.register(selectedSubjectMetadataWorkflowDefinition);

    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });

    return { dbManager, orchestrator, store };
}

function createAssetFile(tempDir, fileName) {
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, 'selection-metadata-test');
    return filePath;
}

test('selected subject metadata workflow expands selected assets and de-duplicates repeated entries', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        const runId = await harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-1' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'asset', subjectId: 'asset-1' },
                    { subjectType: 'asset', subjectId: 'asset-2' },
                    { subjectType: 'asset', subjectId: 'asset-1' },
                ],
            },
        });

        const rows = harness.dbManager.getDb().prepare(`
            SELECT asset_id, data
            FROM derived_results
            WHERE task = 'ai_metadata'
            ORDER BY asset_id ASC
        `).all();
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map((row) => row.asset_id), ['asset-1', 'asset-2']);

        const detail = harness.store.getRunDetail(runId);
        const expansionStep = detail.steps.find((step) => step.nodeId === 'expand-selection');
        assert.ok(expansionStep);
        assert.equal(expansionStep.totalItems, 1);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('selected subject metadata workflow rejects unsupported non-asset subjects in v1', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        await assert.rejects(() => harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-2' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'group', subjectId: 'group-1' },
                ],
            },
        }), /expand-selection/i);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('selected subject metadata workflow persists photo metadata evidence and recalculates photo date', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        const metadataBlock = {
            type: 'Family portrait',
            caption: 'A woman holding an infant',
            description: 'An indoor family portrait with a woman holding a baby.',
            location: 'Unknown',
            estimated_date: {
                most_likely_date: '1990',
                min_date: '1985-01-01',
                max_date: '1995-12-31',
                display_label: 'circa 1990',
                rationale: 'Hairstyle and glasses strongly suggest the late 1980s to early 1990s.',
            },
            subjects: [],
            regions_of_interest: [],
            keywords: ['family', 'baby'],
            emotional_impact: 'Warm',
            quality: { technical: 6, lighting: 7, composition: 7, emotional: 8, discard: false },
            recommended_enhancements: [],
            authenticity: { score: 9, reasons: ['period styling is consistent'] },
        };
        harness = await createHarness(tempDir, {
            aiRuntime: {
                async generateLiveMetadata() {
                    return {
                        provider: 'google',
                        modelVersion: 'gemini-2.5-flash',
                        data: { ...metadataBlock, _analysis_tier: 'flash' },
                        metadataSourceKind: 'gemini_flash_scout',
                        metadataBlock,
                    };
                },
            },
        });
        const assetPath = createAssetFile(tempDir, 'family-photo.jpg');
        const db = harness.dbManager.getDb();
        db.prepare(`
            UPDATE assets
            SET original_path = ?,
                photo_created_at = '2025-02-12T05:33:36.273Z',
                photo_created_at_confidence = 0.431
            WHERE id = 'asset-1'
        `).run(assetPath);

        await harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-date-1' }],
            parameters: {
                aiMode: 'live',
                selectedSubjects: [
                    { subjectType: 'asset', subjectId: 'asset-1' },
                ],
            },
        });

        const projection = db.prepare(`
            SELECT caption, estimated_date_display_label
            FROM photo_metadata_projection
            WHERE asset_id = 'asset-1'
        `).get();
        const blockCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM photo_metadata_blocks
            WHERE asset_id = 'asset-1'
        `).get();
        const updatedAsset = db.prepare(`
            SELECT photo_created_at, photo_created_at_confidence
            FROM assets
            WHERE id = 'asset-1'
        `).get();
        const updatedYear = new Date(updatedAsset.photo_created_at).getUTCFullYear();

        assert.equal(blockCount.count, 1);
        assert.equal(projection.caption, 'A woman holding an infant');
        assert.equal(projection.estimated_date_display_label, 'circa 1990');
        assert.notEqual(updatedAsset.photo_created_at, '2025-02-12T05:33:36.273Z');
        assert.equal(updatedYear >= 1985 && updatedYear <= 1995, true);
        assert.ok(updatedAsset.photo_created_at_confidence > 0.431);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});
