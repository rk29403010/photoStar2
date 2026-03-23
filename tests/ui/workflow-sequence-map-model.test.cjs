const test = require('node:test');
const assert = require('node:assert/strict');

function createBranchingEnrichmentMapInput() {
    return {
        stages: [createBranchingEnrichmentStage()],
        nodes: createBranchingEnrichmentNodes(),
        edges: [
            { id: 'detect-faces->generate-face-vectors', source: 'detect-faces', target: 'generate-face-vectors' },
            { id: 'collect-similar->group-similar-photos', source: 'collect-similar', target: 'group-similar-photos' },
            { id: 'detect-sensitive-content->generate-ai-metadata', source: 'detect-sensitive-content', target: 'generate-ai-metadata' },
        ],
    };
}

function createBranchingEnrichmentStage() {
    return {
        id: 'enrichment',
        label: 'Enrichment',
        description: 'Branch to multiple downstream modules.',
        status: 'running',
        nodeIds: ['extract-embedded-metadata', 'detect-faces', 'collect-similar', 'detect-sensitive-content', 'generate-face-vectors', 'group-similar-photos', 'generate-ai-metadata'],
        totalItems: 18,
        completedItems: 10,
        failedItems: 0,
        countNoun: { singular: 'person', plural: 'people' },
        aggregateCounts: [{ noun: { singular: 'person', plural: 'people' }, totalItems: 18, completedItems: 10, failedItems: 0 }],
    };
}

function createBranchingEnrichmentNodes() {
    return [
        createBranchingNode({
            id: 'extract-embedded-metadata',
            label: 'Extract Embedded Metadata',
            status: 'completed',
            countNoun: { singular: 'image', plural: 'images' },
            completedItems: 18,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'detect-faces',
            label: 'Detect Faces',
            status: 'completed',
            downstreamIds: ['generate-face-vectors'],
            countNoun: { singular: 'image', plural: 'images' },
            completedItems: 18,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'collect-similar',
            label: 'Collect Similar',
            status: 'running',
            downstreamIds: ['group-similar-photos'],
            countNoun: { singular: 'group', plural: 'groups' },
            completedItems: 7,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'detect-sensitive-content',
            label: 'Detect Sensitive Content',
            status: 'running',
            downstreamIds: ['generate-ai-metadata'],
            countNoun: { singular: 'image', plural: 'images' },
            completedItems: 6,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'generate-face-vectors',
            label: 'Generate Face Vectors',
            status: 'completed',
            upstreamIds: ['detect-faces'],
            countNoun: { singular: 'person', plural: 'people' },
            completedItems: 18,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'group-similar-photos',
            label: 'Group Similar Photos',
            status: 'running',
            upstreamIds: ['collect-similar'],
            countNoun: { singular: 'group', plural: 'groups' },
            completedItems: 7,
            totalItems: 18,
        }),
        createBranchingNode({
            id: 'generate-ai-metadata',
            label: 'Generate AI Metadata',
            status: 'running',
            upstreamIds: ['detect-sensitive-content'],
            countNoun: { singular: 'image', plural: 'images' },
            completedItems: 6,
            totalItems: 18,
        }),
    ];
}

function createBranchingNode(overrides) {
    return {
        kind: 'module',
        upstreamIds: [],
        downstreamIds: [],
        failedItems: 0,
        moduleId: overrides.id,
        ...overrides,
    };
}

function assertBranchAlignment(map) {
    const detectFaces = map.nodes.find((node) => node.id === 'detect-faces');
    const generateFaceVectors = map.nodes.find((node) => node.id === 'generate-face-vectors');
    const collectSimilar = map.nodes.find((node) => node.id === 'collect-similar');
    const groupSimilar = map.nodes.find((node) => node.id === 'group-similar-photos');
    const detectSensitive = map.nodes.find((node) => node.id === 'detect-sensitive-content');
    const generateAi = map.nodes.find((node) => node.id === 'generate-ai-metadata');
    assert.equal(detectFaces?.position.x, generateFaceVectors?.position.x);
    assert.equal(collectSimilar?.position.x, groupSimilar?.position.x);
    assert.equal(detectSensitive?.position.x, generateAi?.position.x);
    assert.ok((generateAi?.position.x ?? 0) > (generateFaceVectors?.position.x ?? 0));
}

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
                label: 'Ingest',
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
    assert.equal(map.stageBoxes[1].label, 'Ingest');
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

    const map = buildWorkflowSequenceMap(createBranchingEnrichmentMapInput());

    assert.equal(map.stageBoxes.length, 1);
    assert.ok(map.stageBoxes[0].size.width > 320);
    assertBranchAlignment(map);
});

test('buildWorkflowSequenceMap compacts node cards in definition-only mode', async () => {
    const { buildWorkflowSequenceMap } = await import('../../src/ui/components/workflows/workflowSequenceMapModel.ts');

    const map = buildWorkflowSequenceMap({
        stages: [{
            id: 'enrichment',
            label: 'Enrichment',
            description: 'Branch',
            status: 'idle',
            nodeIds: ['detect-faces'],
            totalItems: 0,
            completedItems: 0,
            failedItems: 0,
            countNoun: { singular: 'image', plural: 'images' },
            aggregateCounts: [],
        }],
        nodes: [{
            id: 'detect-faces',
            label: 'Detect Faces',
            kind: 'module',
            status: 'idle',
            upstreamIds: [],
            downstreamIds: [],
            moduleId: 'detect-faces',
            countNoun: { singular: 'image', plural: 'images' },
            totalItems: 0,
            completedItems: 0,
            failedItems: 0,
        }],
        edges: [],
        showRuntimeDetails: false,
    });

    assert.equal(map.nodes[0].size.height, 96);
});

test('buildWorkflowSequenceMap widens node cards to fit runtime summaries', async () => {
    const { buildWorkflowSequenceMap } = await import('../../src/ui/components/workflows/workflowSequenceMapModel.ts');

    const baseInput = {
        stages: [{
            id: 'enrichment',
            label: 'Enrichment',
            description: 'Branch',
            status: 'completed',
            nodeIds: ['detect-sensitive-content'],
            totalItems: 418,
            completedItems: 418,
            failedItems: 0,
            countNoun: { singular: 'image', plural: 'images' },
            aggregateCounts: [],
        }],
        nodes: [{
            id: 'detect-sensitive-content',
            label: 'Detect Sensitive Content',
            kind: 'module',
            status: 'completed',
            upstreamIds: [],
            downstreamIds: [],
            moduleId: 'detect-sensitive-content',
            countNoun: { singular: 'image', plural: 'images' },
            totalItems: 418,
            completedItems: 418,
            failedItems: 0,
        }],
        edges: [],
    };

    const runtimeMap = buildWorkflowSequenceMap(baseInput);
    const definitionMap = buildWorkflowSequenceMap({
        ...baseInput,
        showRuntimeDetails: false,
    });

    assert.ok(runtimeMap.nodes[0].size.width > definitionMap.nodes[0].size.width);
    assert.ok(runtimeMap.stageBoxes[0].size.width >= definitionMap.stageBoxes[0].size.width);
});
