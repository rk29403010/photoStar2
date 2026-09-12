const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const peopleViewPath = path.join(process.cwd(), 'src/ui/components/PeopleView.tsx');

function loadPeopleViewSource() {
    return fs.readFileSync(peopleViewPath, 'utf8');
}

test('WP12f People review UI reads stable candidate evidence separately from confirmed assignments', () => {
    const source = loadPeopleViewSource();
    assert.match(source, /command: 'get_person_face_assignments'/);
    assert.match(source, /command: 'get_person_face_candidates'/);
    assert.match(source, /confirmed\.assignments \|\| \[\]\)\.filter\(item => item\.is_suggested === 0\)/);
});

test('WP12f candidate actions carry stable Face and Person ids', () => {
    const source = loadPeopleViewSource();
    assert.match(source, /run\('confirm_face_person_candidate', \{ faceId, personId \}\)/);
    assert.match(source, /run\('reject_face_person_candidate', \{ faceId, personId \}\)/);
    assert.match(source, /run\('isolate_face', \{ faceId \}\)/);
});

test('WP12f candidate similarity is not presented as a calibrated percentage', () => {
    const source = loadPeopleViewSource();
    assert.match(source, /Similarity \{assignment\.confidence\.toFixed\(2\)\}/);
    assert.doesNotMatch(source, /assignment\.confidence \* 100/);
});
