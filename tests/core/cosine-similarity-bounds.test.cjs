const test = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../../dist/core/src/services/math-utils.js');

test('cosine roundoff stays within the valid storage domain', () => {
    const vector = [1.2, 0.3, 0.7];
    assert.equal(cosineSimilarity(vector, vector), 1);
    assert.equal(cosineSimilarity(vector, vector.map(value => -value)), -1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.ok(Number.isNaN(cosineSimilarity([0, 0], [0, 0])));
    assert.throws(() => cosineSimilarity([1], [1, 2]), /length mismatch/);
});
