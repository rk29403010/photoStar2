import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const peopleView = readFileSync('src/ui/components/PeopleView.tsx', 'utf8');
const runtimeActions = readFileSync('src/boundary/runtime/usePhotoLibrary.actions.ts', 'utf8');

test('WP10g People UI actions use stable faceId payloads', () => {
    assert.match(peopleView, /face_id:\s*string/);
    assert.match(peopleView, /run\('confirm_face_assignment', \{ faceId \}\)/);
    assert.match(peopleView, /run\('reject_face_assignment', \{ faceId, personId \}\)/);
    assert.match(peopleView, /run\('isolate_face', \{ faceId \}\)/);
    assert.doesNotMatch(peopleView, /face_index:\s*number/);
});

test('WP10g runtime isolate action exposes stable faceId', () => {
    assert.match(runtimeActions, /isolateFace:\s*\(faceId:\s*string\)/);
    assert.match(runtimeActions, /sendCommand\('isolate_face', \{ faceId \}\)/);
});
