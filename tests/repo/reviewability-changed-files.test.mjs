import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyReviewability,
    countSourceLines,
} from '../../tooling/scripts/repo/reviewability-changed-files.mjs';

test('source line counting ignores a final newline', () => {
    assert.equal(countSourceLines(''), 0);
    assert.equal(countSourceLines('one'), 1);
    assert.equal(countSourceLines('one\ntwo\n'), 2);
    assert.equal(countSourceLines('one\r\ntwo\r\n'), 2);
});

test('reviewability allows ordinary and shrinking legacy files', () => {
    assert.equal(classifyReviewability({ currentLines: 799, baselineLines: 790 }), 'ok');
    assert.equal(classifyReviewability({ currentLines: 900, baselineLines: 950 }), 'legacy-not-growing');
    assert.equal(classifyReviewability({ currentLines: 900, baselineLines: 900 }), 'legacy-not-growing');
});

test('reviewability blocks new growth above the advisory threshold', () => {
    assert.equal(classifyReviewability({ currentLines: 801, baselineLines: 0 }), 'growth-over-advisory');
    assert.equal(classifyReviewability({ currentLines: 801, baselineLines: 799 }), 'growth-over-advisory');
    assert.equal(classifyReviewability({ currentLines: 901, baselineLines: 900 }), 'growth-over-advisory');
});

test('reviewability hard limit wins regardless of baseline', () => {
    assert.equal(classifyReviewability({ currentLines: 1201, baselineLines: 1300 }), 'hard-limit');
});
