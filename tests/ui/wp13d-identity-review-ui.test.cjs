const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('WP13d identity review exposes every uncertainty response with accessible wording', () => {
    const source = readSource('src/ui/components/people/identityReviewChoices.ts');
    for (const wording of [
        'Definitely this person',
        'Probably this person',
        'Possibly this person',
        'Definitely not this person',
        'Unsure between',
        "I don't know",
        'I recognise them but cannot name them',
        'Skip this question',
    ]) {
        assert.match(source, new RegExp(wording.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    const controlSource = readSource('src/ui/components/people/IdentityReviewControl.tsx');
    assert.ok(controlSource.includes('aria-label={`Identity certainty for ${props.candidateName}`}'));
});

test('WP13d identity review declares inline feedback, retry, and a local error boundary', () => {
    const controlSource = readSource('src/ui/components/people/IdentityReviewControl.tsx');
    const sectionSource = readSource('src/ui/components/people/IdentityReviewSection.tsx');
    const dataSource = readSource('src/ui/components/people/identityReviewData.ts');
    assert.match(controlSource, /class IdentityReviewErrorBoundary/);
    assert.match(controlSource, /mode="inline"/);
    assert.match(controlSource, /Try again/);
    assert.match(sectionSource, /state="pending" message="Loading identity suggestions…"/);
    assert.match(dataSource, /Identity response saved\./);
    assert.match(sectionSource, /actions\.feedback\.state === 'error'/);
});
