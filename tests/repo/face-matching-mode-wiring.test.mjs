import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('face matching mode wiring exposes strict balanced and loose options through settings', () => {
    const settingsModalSource = fs.readFileSync('src/ui/components/SettingsModal.tsx', 'utf8');

    assert.match(settingsModalSource, /job_face_matching_mode/);
    assert.match(settingsModalSource, /Face Matching Mode/);
    assert.match(settingsModalSource, /FACE_MATCHING_MODE_OPTIONS/);
    assert.match(settingsModalSource, /const faceMatchingMode = \(dbSettings\.job_face_matching_mode \|\| 'balanced'\) as FaceMatchingMode;/);
    assert.match(settingsModalSource, /value=\{faceMatchingMode\}/);
    assert.match(settingsModalSource, /value: 'strict'/);
    assert.match(settingsModalSource, /label: 'Strict'/);
    assert.match(settingsModalSource, /value: 'balanced'/);
    assert.match(settingsModalSource, /label: 'Balanced'/);
    assert.match(settingsModalSource, /value: 'loose'/);
    assert.match(settingsModalSource, /label: 'Loose'/);
});
