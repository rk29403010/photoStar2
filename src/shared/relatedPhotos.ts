import { z } from 'zod';

export const linkFeatureKindSchema = z.enum(['scene', 'clothing', 'building', 'vehicle', 'decoration', 'object', 'season', 'print', 'person', 'folder', 'album', 'sequence', 'timestamp']);
export const linkFeatureSchema = z.strictObject({
    kind: linkFeatureKindSchema, key: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(180), confidence: z.enum(['high', 'medium', 'low', 'unknown']),
});
export type LinkFeature = z.infer<typeof linkFeatureSchema>;
export type IndexedLinkFeature = LinkFeature & { assetId: string; sourceId: string };
export type LinkEvidence = {
    kind: LinkFeature['kind'] | 'visual_similarity'; text: string;
    sourceIds: string[]; confidence: LinkFeature['confidence'];
};
export type MembershipAssessment = {
    role: 'strong' | 'possible'; confidence: LinkFeature['confidence']; evidence: LinkEvidence[];
};
export type NetworkImpact = {
    id: string; cause: string; assetId: string; kind: 'progress' | 'discovery' | 'opportunity';
    field: string | null; before: unknown; after: unknown; rootClaimIds: string[];
};
