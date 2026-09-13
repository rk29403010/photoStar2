export type IdentityReviewKind =
    | 'definite_identification'
    | 'tentative_identification'
    | 'possible_identification'
    | 'reject_candidate'
    | 'unsure_between_candidates'
    | 'unknown_no_clue'
    | 'recognise_cannot_name'
    | 'abstain';

export type IdentityCandidatePerson = {
    personId: string;
    name: string;
};

export type IdentityReviewChoice = {
    kind: IdentityReviewKind;
    label: string;
};

const BASE_CHOICES: readonly IdentityReviewChoice[] = [
    { kind: 'definite_identification', label: 'Definitely this person' },
    { kind: 'tentative_identification', label: 'Probably this person' },
    { kind: 'possible_identification', label: 'Possibly this person' },
    { kind: 'reject_candidate', label: 'Definitely not this person' },
    { kind: 'unknown_no_clue', label: "I don't know" },
    { kind: 'recognise_cannot_name', label: 'I recognise them but cannot name them' },
    { kind: 'abstain', label: 'Skip this question' },
];

export function buildIdentityReviewChoices(
    candidatePeople: readonly IdentityCandidatePerson[],
): IdentityReviewChoice[] {
    const choices = [...BASE_CHOICES];
    if (candidatePeople.length > 1) {
        choices.splice(4, 0, {
            kind: 'unsure_between_candidates',
            label: `Unsure between ${candidatePeople.map((person) => person.name).join(' or ')}`,
        });
    }
    return choices;
}
