import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/services/handlers/peopleCommands.ts', 'utf8');

test('WP10e People manual actions no longer write durable path plus face-index compatibility records', () => {
    assert.match(source, /recordManualFacePersonDecision/);
    assert.match(source, /acceptCurrentAssignmentsForPerson/);
    assert.doesNotMatch(source, /INSERT\s+OR\s+REPLACE\s+INTO\s+manual_face_names/i);
    assert.doesNotMatch(source, /INSERT\s+OR\s+REPLACE\s+INTO\s+manual_face_isolations/i);
});
