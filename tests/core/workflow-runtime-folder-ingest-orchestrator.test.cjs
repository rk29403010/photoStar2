const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-enrichment-'));
}

function createFixtureFolder(rootDir) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(path.join(folderPath, 'one.png'), pngBytes);
    fs.writeFileSync(path.join(folderPath, 'two.png'), pngBytes);
    return folderPath;
}

test('folder_ingest_v1 completes enrichment branches after Library ready', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createScanFolderModule } = await import('../../dist/core/src/services/workflowRuntime/modules/scanFolderModule.js');
    const { createGeneratePreviewsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generatePreviewsModule.js');
    const { createExtractEmbeddedMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/extractEmbeddedMetadataModule.js');
    const { createDetectFacesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFacesModule.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    const { createResolvePeopleModule } = await import('../../dist/core/src/services/workflowRuntime/modules/resolvePeopleModule.js');
    const { createGroupSimilarPhotosModule } = await import('../../dist/core/src/services/workflowRuntime/modules/groupSimilarPhotosModule.js');
    const { createDetectSensitiveContentModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectSensitiveContentModule.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadataModule.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
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

        modules.register(createScanFolderModule({ dbManager }));
        modules.register(createExtractEmbeddedMetadataModule({ dbManager }));
        modules.register(createGeneratePreviewsModule({ dbManager }));
        modules.register(createDetectFacesModule({ dbManager }));
        modules.register(createGenerateFaceVectorsModule({ dbManager }));
        modules.register(createResolvePeopleModule({ dbManager }));
        modules.register(createGroupSimilarPhotosModule({ dbManager }));
        modules.register(createDetectSensitiveContentModule({ dbManager }));
        modules.register(createGenerateAiMetadataModule({ dbManager }));
        workflows.register(folderIngestWorkflowDefinition);

        const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        });

        const runId = await orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'recursive',
                aiMode: 'off',
            },
        });

        const run = store.getRunDetail(runId);
        assert.equal(
            run.milestones.find((milestone) => milestone.milestoneId === 'enrichment_complete')?.status,
            'completed'
        );
        assert.ok(run.steps.some((step) => step.nodeId === 'group-similar-photos'));

        const peopleCount = dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM people').get();
        const groupCount = dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM asset_groups WHERE type = 'people'").get();
        assert.equal(peopleCount.count, 0);
        assert.equal(groupCount.count, 0);
        const metadataCount = dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'embedded_metadata'").get();
        assert.equal(metadataCount.count, 2);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
