const test = require('node:test');
const assert = require('node:assert/strict');

test('buildWorkflowSequenceMap groups nodes inside ordered stage boxes and preserves graph edges', async () => {
    const { buildWorkflowSequenceMap } = await import('../../src/ui/components/workflows/workflowSequenceMapModel.ts');

    const map = buildWorkflowSequenceMap({
        stages: [
            {
                id: 'discovery',
                label: 'Discovery',
                description: 'Scan the folder.',
                status: 'completed',
                nodeIds: ['scan-folder'],
                totalItems: 1,
                completedItems: 1,
                failedItems: 0,
                countNoun: { singular: 'folder', plural: 'folders' },
                aggregateCounts: [{ noun: { singular: 'folder', plural: 'folders' }, totalItems: 1, completedItems: 1, failedItems: 0 }],
            },
            {
                id: 'library-ready',
                label: 'Library Ready',
                description: 'Generate previews.',
                status: 'running',
                nodeIds: ['preview-each', 'generate-previews'],
                totalItems: 10,
                completedItems: 4,
                failedItems: 0,
                countNoun: { singular: 'image', plural: 'images' },
                aggregateCounts: [{ noun: { singular: 'image', plural: 'images' }, totalItems: 10, completedItems: 4, failedItems: 0 }],
            },
        ],
        nodes: [
            {
                id: 'scan-folder',
                label: 'Scan Folder',
                kind: 'module',
                status: 'completed',
                upstreamIds: [],
                downstreamIds: ['preview-each'],
                moduleId: 'scan-folder',
                countNoun: { singular: 'folder', plural: 'folders' },
                totalItems: 1,
                completedItems: 1,
                failedItems: 0,
            },
            {
                id: 'preview-each',
                label: 'Preview Each',
                kind: 'control',
                status: 'running',
                upstreamIds: ['scan-folder'],
                downstreamIds: ['generate-previews'],
                controlType: 'for-each',
                countNoun: { singular: 'image', plural: 'images' },
                totalItems: 10,
                completedItems: 4,
                failedItems: 0,
            },
            {
                id: 'generate-previews',
                label: 'Generate Previews',
                kind: 'module',
                status: 'running',
                upstreamIds: ['preview-each'],
                downstreamIds: [],
                moduleId: 'generate-previews',
                countNoun: { singular: 'image', plural: 'images' },
                totalItems: 10,
                completedItems: 4,
                failedItems: 0,
            },
        ],
        edges: [
            { id: 'scan-folder->preview-each', source: 'scan-folder', target: 'preview-each' },
            { id: 'preview-each->generate-previews', source: 'preview-each', target: 'generate-previews' },
        ],
    });

    assert.deepEqual(map.stageOrder, ['discovery', 'library-ready']);
    assert.equal(map.stageBoxes.length, 2);
    assert.equal(map.stageBoxes[1].label, 'Library Ready');
    assert.equal(map.stageBoxes[0].headerTop, 20);
    assert.equal(map.nodes.length, 3);
    assert.equal(map.nodes[0].stageId, 'discovery');
    assert.equal(map.nodes[1].stageId, 'library-ready');
    assert.ok(map.nodes[1].position.x > map.nodes[0].position.x);
    assert.ok(map.nodes[0].position.y >= map.stageBoxes[0].contentTop);
    assert.ok(map.nodes[2].position.y > map.nodes[1].position.y);
    assert.deepEqual(map.edges.map((edge) => edge.id), ['scan-folder->preview-each', 'preview-each->generate-previews']);
});

test('buildWorkflowSequenceMap fans out downstream nodes horizontally and widens the stage to fit them', async () => {
    const { buildWorkflowSequenceMap } = await import('../../src/ui/components/workflows/workflowSequenceMapModel.ts');

    const map = buildWorkflowSequenceMap({
        stages: [
            {
                id: 'enrichment',
                label: 'Enrichment',
                description: 'Branch to multiple downstream modules.',
                status: 'running',
                nodeIds: ['generate-face-vectors', 'collect-people', 'collect-similar'],
                totalItems: 18,
                completedItems: 10,
                failedItems: 0,
                countNoun: { singular: 'person', plural: 'people' },
                aggregateCounts: [{ noun: { singular: 'person', plural: 'people' }, totalItems: 18, completedItems: 10, failedItems: 0 }],
            },
        ],
        nodes: [
            {
                id: 'generate-face-vectors',
                label: 'Generate Face Vectors',
                kind: 'module',
                status: 'completed',
                upstreamIds: [],
                downstreamIds: ['collect-people', 'collect-similar'],
                moduleId: 'generate-face-vectors',
                countNoun: { singular: 'person', plural: 'people' },
                totalItems: 18,
                completedItems: 18,
                failedItems: 0,
            },
            {
                id: 'collect-people',
                label: 'Collect People',
                kind: 'module',
                status: 'running',
                upstreamIds: ['generate-face-vectors'],
                downstreamIds: [],
                moduleId: 'collect-people',
                countNoun: { singular: 'person', plural: 'people' },
                totalItems: 18,
                completedItems: 10,
                failedItems: 0,
            },
            {
                id: 'collect-similar',
                label: 'Collect Similar',
                kind: 'module',
                status: 'running',
                upstreamIds: ['generate-face-vectors'],
                downstreamIds: [],
                moduleId: 'collect-similar',
                countNoun: { singular: 'group', plural: 'groups' },
                totalItems: 18,
                completedItems: 7,
                failedItems: 0,
            },
        ],
        edges: [
            { id: 'generate-face-vectors->collect-people', source: 'generate-face-vectors', target: 'collect-people' },
            { id: 'generate-face-vectors->collect-similar', source: 'generate-face-vectors', target: 'collect-similar' },
        ],
    });

    assert.equal(map.stageBoxes.length, 1);
    assert.ok(map.stageBoxes[0].size.width > 320);
    const collectPeople = map.nodes.find((node) => node.id === 'collect-people');
    const collectSimilar = map.nodes.find((node) => node.id === 'collect-similar');
    assert.equal(collectPeople?.position.y, collectSimilar?.position.y);
    assert.ok((collectSimilar?.position.x ?? 0) > (collectPeople?.position.x ?? 0));
});
