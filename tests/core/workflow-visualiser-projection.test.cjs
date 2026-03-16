const test = require('node:test');
const assert = require('node:assert/strict');

test('buildWorkflowVisualiserModel maps folder_ingest_v1 into overview, progression, graph, and text sections', async () => {
    const { buildWorkflowVisualiserModel } = await import('../../dist/core/src/services/handlers/systemWorkflowVisualiser.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const model = buildWorkflowVisualiserModel({
        workflowDefinition: folderIngestWorkflowDefinition,
        runDetail: null,
        availableRuns: [],
    });

    assert.equal(model.workflowId, 'folder_ingest_v1');
    assert.equal(model.tabs.progression.stages[0].id, 'discovery');
    assert.equal(model.tabs.progression.stages[0].countNoun.singular, 'folder');
    assert.ok(model.tabs.graph.nodes.some((node) => node.id === 'scan-folder'));
    assert.ok(model.tabs.overview.aggregateCounts.some((entry) => entry.noun.singular === 'folder'));
    assert.ok(model.tabs.overview.aggregateCounts.some((entry) => entry.noun.singular === 'image'));
    assert.ok(model.tabs.text.sections.some((section) => section.id === 'milestones'));
});
