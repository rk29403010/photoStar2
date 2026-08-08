const test = require('node:test');
const assert = require('node:assert/strict');

test('auto segmentation falls back to another verified provider when the fast provider is unavailable', async () => {
    const { resolveSegmentationProvider } = await import('../../dist/core/src/services/segmentation/segmentationService.js');
    const unavailableFastSam = { id: 'fastsam', isAvailable: () => false };
    const availableEfficientSam = { id: 'efficientsam', isAvailable: () => true };

    const resolution = resolveSegmentationProvider({
        provider: 'auto',
        profile: 'fast',
        providers: [unavailableFastSam, availableEfficientSam],
    });

    assert.equal(resolution.used.id, 'efficientsam');
});
