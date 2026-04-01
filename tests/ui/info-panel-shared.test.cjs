const test = require('node:test');
const assert = require('node:assert/strict');

test('normalizeRatingPercent supports fractional quality scores from metadata projection', async () => {
    const { normalizeRatingPercent } = await import('../../src/ui/components/single-photo/info-panel/ratingScale.ts');

    assert.equal(normalizeRatingPercent(0.8), 80);
    assert.equal(normalizeRatingPercent(0.95), 95);
    assert.equal(normalizeRatingPercent(7), 70);
    assert.equal(normalizeRatingPercent(9), 90);
    assert.equal(normalizeRatingPercent(80), 80);
    assert.equal(normalizeRatingPercent(0), 0);
});
