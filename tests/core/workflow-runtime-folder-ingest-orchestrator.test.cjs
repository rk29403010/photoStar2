const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-enrichment-'));
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

function createFixtureFolder(rootDir) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4jwQYcHIAu4cj3WS55GoAAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(path.join(folderPath, 'one.png'), pngBytes);
    fs.writeFileSync(path.join(folderPath, 'two.png'), pngBytes);
    return folderPath;
}

async function createFolderIngestHarness(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { scanFolderPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/scan-folder/plugin.js');
    const { generatePreviewsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-previews/plugin.js');
    const { extractEmbeddedMetadataPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/extract-embedded-metadata/plugin.js');
    const { detectFacesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-faces/plugin.js');
    const { detectFramesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/plugin.js');
    const { segmentObjectsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/segment-objects/plugin.js');
    const { generateFaceVectorsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/plugin.js');
    const { resolvePeoplePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/resolve-people/plugin.js');
    const { groupSimilarPhotosPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/plugin.js');
    const { detectSensitiveContentPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-sensitive-content/plugin.js');
    const { createGenerateAiMetadataScoutPluginModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
    const { createGenerateAiMetadataRefinePluginModule: createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-refine/plugin.js');
    const { estimatePhotoDatePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/plugin.js');
    const { detectPrintTexturePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-print-texture/plugin.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    for (const subject of [
        {
            id: 'folder',
            version: 1,
            durable: false,
            summary: { titleField: 'path', thumbnailStrategy: 'none' },
            progressSemantics: 'aggregate',
            relations: [],
            ui: { detailSections: ['overview'] },
            labels: { singular: 'folder', plural: 'folders' },
        },
        {
            id: 'asset',
            version: 1,
            durable: true,
            summary: { titleField: 'id', thumbnailStrategy: 'asset' },
            progressSemantics: 'per_subject',
            relations: [],
            ui: { detailSections: ['overview'] },
            labels: { singular: 'file', plural: 'files' },
        },
    ]) {
        subjects.register(subject);
    }

    modules.registerPlugin(scanFolderPlugin, { dbManager });
    modules.registerPlugin(extractEmbeddedMetadataPlugin, { dbManager });
    modules.registerPlugin(generatePreviewsPlugin, { dbManager });
    modules.registerPlugin(detectFacesPlugin, { dbManager });
    modules.registerPlugin(detectFramesPlugin, { dbManager });
    modules.registerPlugin(segmentObjectsPlugin, { dbManager });
    modules.registerPlugin(generateFaceVectorsPlugin, { dbManager });
    modules.registerPlugin(resolvePeoplePlugin, { dbManager });
    modules.registerPlugin(groupSimilarPhotosPlugin, { dbManager });
    modules.registerPlugin(detectSensitiveContentPlugin, { dbManager });
    modules.register(createGenerateAiMetadataScoutPluginModule({ dbManager }));
    modules.register(createGenerateAiMetadataModule({ dbManager }));
    modules.registerPlugin(estimatePhotoDatePlugin, { dbManager });
    modules.registerPlugin(detectPrintTexturePlugin, { dbManager });
    workflows.register(folderIngestWorkflowDefinition);

    return {
        dbManager,
        store,
        orchestrator: new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        }),
    };
}

test('folder_ingest_v1 completes enrichment branches after Library ready', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    let harness;

    try {
        harness = await createFolderIngestHarness(tempDir);

        const runId = await harness.orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'recursive',
                aiMode: 'off',
            },
        });

        const run = harness.store.getRunDetail(runId);
        assert.equal(
            run.milestones.find((milestone) => milestone.milestoneId === 'enrichment_complete')?.status,
            'completed'
        );
        assert.ok(run.steps.some((step) => step.nodeId === 'group-similar-photos'));

        const peopleCount = harness.dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM people').get();
        const groupCount = harness.dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM asset_groups WHERE type = 'people'").get();
        assert.equal(peopleCount.count, 0);
        assert.equal(groupCount.count, 0);
        const metadataCount = harness.dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'embedded_metadata'").get();
        assert.equal(metadataCount.count, 2);
        const estimateCount = harness.dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'photo_date_estimate'").get();
        assert.equal(estimateCount.count, 2);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});
