import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const identityReviewData = readFileSync('src/ui/components/people/identityReviewData.ts', 'utf8');
const candidateHandlers = readFileSync('src/services/handlers/peopleCandidateCommands.ts', 'utf8');
const runtimeActions = readFileSync('src/boundary/runtime/usePhotoLibrary.actions.ts', 'utf8');

test('WP10g People UI actions retain stable faceId payloads after WP13d review cutover', () => {
    assert.match(identityReviewData, /face_id:\s*string/);
    assert.match(identityReviewData, /run\('record_face_identity_review_response'/);
    assert.match(identityReviewData, /run\('isolate_face', \{ faceId \}\)/);
    assert.match(candidateHandlers, /input\.kind === 'definite_identification' \? 'accepted' : 'rejected'/);
    assert.doesNotMatch(identityReviewData, /face_index:\s*number/);
});

test('WP10g runtime isolate action exposes stable faceId', () => {
    assert.match(runtimeActions, /isolateFace:\s*\(faceId:\s*string\)/);
    assert.match(runtimeActions, /sendCommand\('isolate_face', \{ faceId \}\)/);
});
