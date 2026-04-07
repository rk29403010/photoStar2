import type { DatabaseManager } from '../../data/db';
import type { GeminiResponse } from './geminiTypes';
import { splitAiTagsAgainstVocabulary } from './tagVocabularyEnforcement';

export type MetadataSourceKind = 'gemini_flash_scout' | 'gemini_pro_refined';

export function loadApprovedTagVocabulary(dbManager: DatabaseManager): string[] {
    return dbManager.getDb().prepare(`
        SELECT canonical_label
        FROM tag_definitions
        WHERE status = 'active'
        ORDER BY canonical_label COLLATE NOCASE ASC
    `).all().map((row) => (row as { canonical_label: string }).canonical_label);
}

export function resolveGeminiMetadataSourceKind(response: GeminiResponse): MetadataSourceKind {
    return response._analysis_tier === 'pro' ? 'gemini_pro_refined' : 'gemini_flash_scout';
}

export function sanitizeGeminiResponseTags(response: GeminiResponse, approvedTagVocabulary: string[]) {
    const tagSplit = splitAiTagsAgainstVocabulary({
        keywords: response.keywords,
        tagProposals: response.tag_proposals,
        approvedTagVocabulary,
    });

    return {
        approvedKeywords: tagSplit.approvedKeywords,
        tagProposals: tagSplit.tagProposals,
        storedResponse: {
            ...response,
            keywords: tagSplit.approvedKeywords,
            tag_proposals: tagSplit.tagProposals,
        } as Record<string, unknown>,
    };
}
