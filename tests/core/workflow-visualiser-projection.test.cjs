const test = require('node:test');
const assert = require('node:assert/strict');

test('buildWorkflowVisualiserModel maps folder_ingest_v1 into overview, progression, graph, and text sections', async () => {
    const { buildWorkflowVisualiserModel } = await import('../../dist/core/src/services/handlers/systemWorkflowVisualiser.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const model = buildWorkflowVisualiserModel({
        workflowDefinition: folderIngestWorkflowDefinition,
        runDetail: null,
        availableRuns: [],
        allRuns: [],
    });

    assert.equal(model.workflowId, 'folder_ingest_v1');
    assert.equal(model.tabs.progression.stages[0].id, 'discovery');
    assert.equal(model.tabs.progression.stages[0].countNoun.singular, 'folder');
    assert.equal(model.tabs.progression.stages[1].label, 'Ingest');
    assert.ok(model.tabs.graph.nodes.some((node) => node.id === 'scan-folder'));
    assert.ok(
        model.tabs.progression.stages
            .find((stage) => stage.id === 'enrichment')
            ?.nodeIds.includes('extract-embedded-metadata')
    );
    assert.ok(
        model.tabs.progression.stages
            .find((stage) => stage.id === 'enrichment')
            ?.nodeIds.includes('estimate-photo-date-from-embedded')
    );
    assert.ok(
        model.tabs.progression.stages
            .find((stage) => stage.id === 'enrichment')
            ?.nodeIds.includes('estimate-photo-date-from-ai')
    );
    assert.ok(model.tabs.overview.aggregateCounts.some((entry) => entry.noun.singular === 'folder'));
    assert.ok(model.tabs.overview.aggregateCounts.some((entry) => entry.noun.singular === 'image'));
    assert.ok(model.tabs.text.sections.some((section) => section.id === 'milestones'));
});

test('buildWorkflowVisualiserModel links recovery runs back to the failed folder ingest run', async () => {
    const { buildWorkflowVisualiserModel } = await import('../../dist/core/src/services/handlers/systemWorkflowVisualiser.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const model = buildWorkflowVisualiserModel({
        workflowDefinition: folderIngestWorkflowDefinition,
        runDetail: {
            summary: {
                runId: 'folder-run-1',
                status: 'failed',
                totalItems: 418,
                completedItems: 217,
                failedItems: 0,
            },
            parameters: {
                folderPath: 'C:/photos',
            },
            milestones: [],
            steps: [],
        },
        availableRuns: [{
            runId: 'folder-run-1',
            workflowId: 'folder_ingest_v1',
            displayName: 'Folder ingest',
            status: 'failed',
            createdAt: '2026-03-28T09:57:19.817Z',
            parameters: { folderPath: 'C:/photos' },
            totalItems: 418,
            completedItems: 217,
            failedItems: 0,
            milestones: [],
            stepSummaries: [],
        }],
        allRuns: [
            {
                runId: 'folder-run-1',
                workflowId: 'folder_ingest_v1',
                displayName: 'Folder ingest',
                status: 'failed',
                createdAt: '2026-03-28T09:57:19.817Z',
                parameters: { folderPath: 'C:/photos' },
                totalItems: 418,
                completedItems: 217,
                failedItems: 0,
                milestones: [],
                stepSummaries: [],
            },
            {
                runId: 'recovery-run-1',
                workflowId: 'selected_subject_metadata_v1',
                displayName: 'selected_subject_metadata_v1',
                status: 'completed',
                createdAt: '2026-03-30T09:07:05.945Z',
                parameters: { sourceFolderRunId: 'folder-run-1' },
                totalItems: 201,
                completedItems: 201,
                failedItems: 0,
                milestones: [],
                stepSummaries: [],
            },
        ],
    });

    assert.deepEqual(model.selectedRun?.linkedRuns, [{
        runId: 'recovery-run-1',
        workflowId: 'selected_subject_metadata_v1',
        displayName: 'selected_subject_metadata_v1',
        status: 'completed',
        createdAt: '2026-03-30T09:07:05.945Z',
        relationship: 'recovery',
        totalItems: 201,
        completedItems: 201,
        failedItems: 0,
    }]);
});
