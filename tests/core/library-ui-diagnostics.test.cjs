const test = require('node:test');
const assert = require('node:assert/strict');

test('buildWorkflowPollDetail includes the failed step and error message', async () => {
    const { buildWorkflowPollDetail } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    const detail = buildWorkflowPollDetail({
        summary: { status: 'failed' },
        steps: [
            {
                nodeId: 'generate-previews',
                status: 'completed',
                totalItems: 4,
                completedItems: 4,
            },
            {
                nodeId: 'generate-ai-metadata',
                status: 'failed',
                totalItems: 4,
                completedItems: 0,
                errorMessage: 'Live AI metadata requires a configured Gemini API key.',
            },
        ],
    });

    assert.equal(
        detail,
        'run=failed; failedStep=generate-ai-metadata; error=Live AI metadata requires a configured Gemini API key.',
    );
});

test('buildIngestStatusMessage reports the actual failed step instead of blaming previews', async () => {
    const { buildIngestStatusMessage } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    const message = buildIngestStatusMessage({
        summary: { status: 'failed' },
        steps: [
            {
                nodeId: 'generate-previews',
                status: 'completed',
                totalItems: 4,
                completedItems: 4,
            },
            {
                nodeId: 'generate-ai-metadata',
                status: 'failed',
                totalItems: 4,
                completedItems: 0,
                errorMessage: 'Live AI metadata requires a configured Gemini API key.',
            },
        ],
    });

    assert.equal(
        message,
        'Generate ai metadata failed: Live AI metadata requires a configured Gemini API key.',
    );
});

test('asset update diagnostics shorten long ids for logs and event details', async () => {
    const {
        buildEventFeedDetail,
        shortenDiagnosticId,
    } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    assert.equal(shortenDiagnosticId('789cd4b2-2d25-41b2-ad9b-eaa2fd686fa9'), '789c--6fa9');
    assert.equal(
        buildEventFeedDetail({
            type: 'AssetUpdated',
            asset: {
                id: '789cd4b2-2d25-41b2-ad9b-eaa2fd686fa9',
                original_path: 'C:\\photos\\family\\beach-day.jpg',
            },
        }),
        'refreshed asset=789c--6fa9 (beach-day.jpg)',
    );
});
