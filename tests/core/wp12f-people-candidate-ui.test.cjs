const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const identityReviewDataPath = path.join(process.cwd(), 'src/ui/components/people/identityReviewData.ts');
const identityReviewSectionPath = path.join(process.cwd(), 'src/ui/components/people/IdentityReviewSection.tsx');

function loadSource(sourcePath) {
    return fs.readFileSync(sourcePath, 'utf8');
}

test('WP12f People review UI reads stable candidate evidence separately from confirmed assignments', () => {
    const source = loadSource(identityReviewDataPath);
    assert.match(source, /command: 'get_person_face_assignments'/);
    assert.match(source, /command: 'get_person_face_candidates'/);
    assert.match(source, /confirmed\.assignments \|\| \[\]\)\.filter\(\(item\) => item\.is_suggested === 0\)/);
});

test('WP12f candidate actions carry stable Face and Person ids', () => {
    const source = loadSource(identityReviewDataPath);
    assert.match(source, /run\('record_face_identity_review_response', \{/);
    assert.match(source, /faceId, personId, kind, rawWording: wording/);
    assert.match(source, /run\('isolate_face', \{ faceId \}\)/);
});

test('WP12f candidate similarity is not presented as a calibrated percentage', () => {
    const source = loadSource(identityReviewSectionPath);
    assert.match(source, /Similarity \{props\.assignment\.confidence\.toFixed\(2\)\}/);
    assert.doesNotMatch(source, /props\.assignment\.confidence \* 100/);
});
