const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-runtime-'));
}

test('folder ingest contracts support folder subjects, parameters, labels, and milestones', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const workflowDefinition = {
        id: 'folder_ingest_v1',
        version: 1,
        inputs: ['folder'],
        parameters: [
            { id: 'folderPath', valueType: 'string', required: true },
            { id: 'traversalMode', valueType: 'enum', required: true, options: ['folder_only', 'recursive'] },
            { id: 'aiMode', valueType: 'enum', required: true, options: ['mock', 'live', 'off'] },
        ],
        presentation: {
            defaultRunLabel: 'Folder ingest',
            milestones: [
                { id: 'library_ready', label: 'Library ready' },
                { id: 'enrichment_complete', label: 'Enrichment complete' },
            ],
        },
        nodes: [
            { id: 'scan-folder', kind: 'module', moduleId: 'runtime.scan_folder', outputsTo: ['preview-each'] },
            { id: 'preview-each', kind: 'control', controlType: 'for_each' },
        ],
    };

    assert.doesNotThrow(() => runtime.validateSubjectType({
        id: 'folder',
        version: 1,
        durable: false,
        summary: { titleField: 'path', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'folder', plural: 'folders' },
    }));

    assert.doesNotThrow(() => runtime.validateWorkflowDefinition(workflowDefinition));

    assert.throws(
        () => runtime.validateSubjectType({
            id: 'folder',
            version: 1,
            durable: false,
            summary: { titleField: 'path', thumbnailStrategy: 'none' },
            progressSemantics: 'aggregate',
            relations: [],
            ui: { detailSections: ['overview'] },
            labels: { singular: '', plural: 'folders' },
        }),
        /labels/i
    );

    assert.throws(
        () => runtime.validateWorkflowDefinition({
            ...workflowDefinition,
            parameters: [{ id: 'traversalMode', valueType: 'enum', required: true, options: [] }],
        }),
        /options/i
    );
});

test('execution store persists parameters and milestones for folder ingest runs', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { ExecutionStore } = await import('../../dist/core/src/services/workflowRuntime/executionStore.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const store = new ExecutionStore(dbManager);

        const runId = store.createWorkflowRun({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: 'folder-1' }],
            parameters: {
                folderPath: 'C:/photos',
                traversalMode: 'recursive',
                aiMode: 'mock',
            },
        });

        store.updateMilestoneState(runId, {
            milestoneId: 'library_ready',
            label: 'Library ready',
            status: 'completed',
        });

        const detail = store.getRunDetail(runId);
        assert.equal(detail.parameters.aiMode, 'mock');
        assert.deepEqual(detail.milestones, [
            {
                milestoneId: 'library_ready',
                label: 'Library ready',
                status: 'completed',
            },
        ]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('folder ingest workflow gates enrichment behind preview batch completion', async () => {
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const previewStep = folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'generate-previews');
    const previewCollect = folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'collect-previewed-assets');
    const enrichmentFanout = folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'enrichment-each');
    const detectFaces = folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'detect-faces');

    assert.ok(previewStep);
    assert.deepEqual(previewStep.outputsTo, ['collect-previewed-assets']);
    assert.ok(previewCollect);
    assert.equal(previewCollect.kind, 'control');
    assert.equal(previewCollect.controlType, 'collect');
    assert.deepEqual(previewCollect.outputsTo, ['enrichment-each']);
    assert.ok(enrichmentFanout);
    assert.equal(enrichmentFanout.kind, 'control');
    assert.equal(enrichmentFanout.controlType, 'for_each');
    assert.deepEqual(enrichmentFanout.outputsTo, ['detect-faces']);
    assert.ok(detectFaces);
});
