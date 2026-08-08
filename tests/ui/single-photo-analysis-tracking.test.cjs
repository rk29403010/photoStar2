const test = require('node:test');
const assert = require('node:assert/strict');

test('analysis workflow tracking returns failed step error messages for the dialog', async () => {
    const { getAnalysisWorkflowFailureMessage } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    const message = getAnalysisWorkflowFailureMessage({
        summary: { status: 'failed' },
        steps: [
            {
                nodeId: 'generate-ai-metadata',
                status: 'failed',
                totalItems: 1,
                completedItems: 0,
                errorMessage: 'fetch failed',
            },
        ],
    });

    assert.equal(message, 'fetch failed');
});

test('analysis workflow tracking falls back to the failed step label when no error is present', async () => {
    const { getAnalysisWorkflowFailureMessage } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    const message = getAnalysisWorkflowFailureMessage({
        summary: { status: 'failed' },
        steps: [
            {
                nodeId: 'generate-ai-metadata',
                status: 'failed',
                totalItems: 1,
                completedItems: 0,
            },
        ],
    });

    assert.equal(message, 'Generate ai metadata failed.');
});

test('analysis workflow tracking ignores non-failed runs', async () => {
    const { getAnalysisWorkflowFailureMessage } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    assert.equal(
        getAnalysisWorkflowFailureMessage({
            summary: { status: 'running' },
            steps: [
                {
                    nodeId: 'generate-ai-metadata',
                    status: 'running',
                    totalItems: 1,
                    completedItems: 0,
                },
            ],
        }),
        null,
    );
});

test('analysis workflow tracking retries a transient workflow-detail timeout', async () => {
    const { isTransientWorkflowDetailError } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    assert.equal(isTransientWorkflowDetailError(new Error('Timeout for get_workflow_run_detail')), true);
});

test('object analysis actions remain available after an analysis error', async () => {
    const { canStartObjectAnalysis } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    assert.equal(canStartObjectAnalysis('error'), true);
    assert.equal(canStartObjectAnalysis('analyzing'), false);
    assert.equal(canStartObjectAnalysis('cancelling'), false);
});

test('analysis completion guard only resolves a successful run once per asset', async () => {
    const { shouldCompleteAnalysisRun } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');
    const firstResult = { summary: 'first' };
    const refreshedResult = { summary: 'second' };

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            currentAiMetadata: refreshedResult,
            runStartAiMetadata: undefined,
            completedAssetId: null,
        }),
        true,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            currentAiMetadata: refreshedResult,
            runStartAiMetadata: undefined,
            completedAssetId: 'asset-1',
        }),
        false,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-2',
            currentAiMetadata: refreshedResult,
            runStartAiMetadata: undefined,
            completedAssetId: null,
        }),
        false,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            currentAiMetadata: firstResult,
            runStartAiMetadata: firstResult,
            completedAssetId: null,
        }),
        false,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            currentAiMetadata: refreshedResult,
            runStartAiMetadata: firstResult,
            completedAssetId: null,
        }),
        true,
    );
});
