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

test('analysis completion guard only resolves a successful run once per asset', async () => {
    const { shouldCompleteAnalysisRun } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisTracking.ts');

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            hasAiMetadata: true,
            completedAssetId: null,
        }),
        true,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-1',
            hasAiMetadata: true,
            completedAssetId: 'asset-1',
        }),
        false,
    );

    assert.equal(
        shouldCompleteAnalysisRun({
            analyzingAssetId: 'asset-1',
            currentAssetId: 'asset-2',
            hasAiMetadata: true,
            completedAssetId: null,
        }),
        false,
    );
});
