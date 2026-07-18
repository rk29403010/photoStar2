import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMainProtectionPolicy } from '../../tooling/scripts/repo/configure-main-protection.js';

test('main protection requires PR integration and the canonical quality check', () => {
    const policy = buildMainProtectionPolicy();
    assert.deepEqual(policy.required_status_checks, {
        strict: true,
        contexts: ['quality-gate'],
    });
    assert.equal(policy.required_pull_request_reviews.required_approving_review_count, 0);
    assert.equal(policy.enforce_admins, true);
    assert.equal(policy.allow_force_pushes, false);
    assert.equal(policy.allow_deletions, false);
});
