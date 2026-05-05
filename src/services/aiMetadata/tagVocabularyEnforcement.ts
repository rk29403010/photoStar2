export type SplitAiTagsAgainstVocabularyParams = {
    keywords: string[];
    tagProposals?: string[];
    approvedTagVocabulary: string[];
}

export type SplitAiTagsAgainstVocabularyResult = {
    approvedKeywords: string[];
    tagProposals: string[];
}

function normalizeTagLabel(label: string) {
    return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function addUniqueLabel(collection: string[], seenLabels: Set<string>, label: string) {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {return;}
    const normalizedLabel = normalizeTagLabel(trimmedLabel);
    if (seenLabels.has(normalizedLabel)) {return;}
    seenLabels.add(normalizedLabel);
    collection.push(trimmedLabel);
}

function buildApprovedVocabularyMap(approvedTagVocabulary: string[]) {
    const vocabularyMap = new Map<string, string>();
    for (const canonicalLabel of approvedTagVocabulary) {
        const normalizedLabel = normalizeTagLabel(canonicalLabel);
        if (!normalizedLabel || vocabularyMap.has(normalizedLabel)) {continue;}
        vocabularyMap.set(normalizedLabel, canonicalLabel.trim());
    }
    return vocabularyMap;
}

export function splitAiTagsAgainstVocabulary(params: SplitAiTagsAgainstVocabularyParams): SplitAiTagsAgainstVocabularyResult {
    const approvedVocabularyMap = buildApprovedVocabularyMap(params.approvedTagVocabulary);
    const approvedKeywords: string[] = [];
    const approvedKeywordSet = new Set<string>();
    const tagProposals: string[] = [];
    const tagProposalSet = new Set<string>();

    for (const keyword of params.keywords) {
        const normalizedKeyword = normalizeTagLabel(keyword);
        if (!normalizedKeyword) {continue;}
        const canonicalKeyword = approvedVocabularyMap.get(normalizedKeyword);
        if (canonicalKeyword) {
            addUniqueLabel(approvedKeywords, approvedKeywordSet, canonicalKeyword);
            continue;
        }
        addUniqueLabel(tagProposals, tagProposalSet, keyword);
    }

    for (const proposal of params.tagProposals ?? []) {
        const normalizedProposal = normalizeTagLabel(proposal);
        if (!normalizedProposal || approvedVocabularyMap.has(normalizedProposal)) {continue;}
        addUniqueLabel(tagProposals, tagProposalSet, proposal);
    }

    return { approvedKeywords, tagProposals };
}
