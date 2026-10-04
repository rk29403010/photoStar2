import { z } from 'zod';
import { linkFeatureSchema } from '../relatedPhotos';

export const confidenceSchema = z.enum(['high', 'medium', 'low', 'unknown']);
export const analysisStageSchema = z.enum(['local', 'perception', 'scout', 'context', 'refine', 'user']);
const concise = z.string().trim().min(1).max(180);
const id = z.string().min(1).max(200);
export const evidenceItemSchema = z.strictObject({ text: concise, sourceIds: z.array(id).min(1).max(3) });
export const dateValueSchema = z.strictObject({
    start: z.iso.date().nullable(), end: z.iso.date().nullable(), label: concise,
}).refine(value => !value.start || !value.end || value.start <= value.end, 'Date range must be ordered');
export const appearanceValueSchema = z.strictObject({
    apparentAge: z.strictObject({ min: z.number().int().min(0).max(120), max: z.number().int().min(0).max(120) }).nullable(),
    presentation: concise.nullable(), expression: concise.nullable(), clothing: concise.nullable(),
}).refine(value => !value.apparentAge || value.apparentAge.min <= value.apparentAge.max, 'Age range must be ordered');
const band = z.enum(['poor', 'fair', 'good', 'unknown']);
const benefit = z.enum(['high', 'medium', 'low', 'unknown']);
const risk = z.enum(['high', 'medium', 'low', 'unknown']);
export const qualityValueSchema = z.strictObject({
    technical: band, composition: band, engagement: band, historicalInterest: benefit,
    familyInterest: benefit, enhancementPotential: benefit, assessmentConfidence: confidenceSchema, enhancementRisk: risk,
});
export const enhancementTargetSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('whole_image') }),
    z.strictObject({ kind: z.literal('faces'), faceIds: z.array(id).min(1).max(20) }),
    z.strictObject({ kind: z.literal('regions'), regionIds: z.array(id).min(1).max(20) }),
]);
export const enhancementRecommendationSchema = z.strictObject({
    action: z.enum(['tonal_recovery', 'colour_cast', 'dust_scratches', 'contrast_exposure', 'face_restoration', 'text_preservation']),
    target: enhancementTargetSchema, expectedBenefit: benefit, confidence: confidenceSchema, risk,
    reason: concise, protectedFaceIds: z.array(id).max(20), protectedRegionIds: z.array(id).max(20),
    generative: z.boolean(),
});
const fieldSchemas = {
    caption: concise.nullable(), description: z.string().max(4000).nullable(), classification: z.array(concise).max(8), tags: z.array(concise).max(20),
    date: dateValueSchema.nullable(), location: z.strictObject({ label: concise, country: concise.nullable(), locality: concise.nullable() }).nullable(),
    appearance: appearanceValueSchema, identity: z.strictObject({ personId: id.nullable() }),
    archive_clue: concise, text: z.strictObject({ transcription: z.string().max(1200), language: concise.nullable() }),
    clue_interpretation: concise.nullable(), quality: qualityValueSchema,
    enhancements: z.array(enhancementRecommendationSchema).max(10),
    local_metadata: z.record(z.string(), z.json()),
    link_features: z.array(linkFeatureSchema).max(24),
};
const analysisFields = [
    'caption', 'description', 'classification', 'tags', 'date', 'location', 'appearance',
    'identity', 'archive_clue', 'text', 'clue_interpretation', 'quality', 'enhancements', 'local_metadata', 'link_features',
] as const;
export const analysisFieldSchema = z.enum(analysisFields);
const claimCommon = {
    subjectId: id.nullable(), confidence: confidenceSchema,
    kind: z.enum(['observation', 'known_fact', 'hypothesis', 'inferred_conclusion', 'user_confirmed']),
    evidence: z.array(evidenceItemSchema).max(3), contradictions: z.array(evidenceItemSchema).max(2),
    sourceIds: z.array(id).min(1).max(6), supersedesId: id.nullable(),
};
function fieldClaim<K extends keyof typeof fieldSchemas>(field: K) {
    return z.strictObject({ ...claimCommon, field: z.literal(field), value: fieldSchemas[field] });
}
export const analysisClaimSchema = z.discriminatedUnion('field', [
    fieldClaim('caption'), fieldClaim('description'), fieldClaim('classification'), fieldClaim('tags'), fieldClaim('date'), fieldClaim('location'),
    fieldClaim('appearance'), fieldClaim('identity'), fieldClaim('archive_clue'), fieldClaim('text'),
    fieldClaim('clue_interpretation'), fieldClaim('quality'), fieldClaim('enhancements'), fieldClaim('local_metadata'), fieldClaim('link_features'),
]);
export const refinementTargetSchema = z.strictObject({
    field: analysisFieldSchema, subjectId: id.nullable(), question: concise,
    concern: z.enum(['date', 'location', 'identity', 'historical_clue', 'transcription', 'contradiction', 'enhancement']),
});
export const refinementOpportunitySchema = refinementTargetSchema.extend({ expectedValue: benefit, reason: concise });
export const modelBoxSchema = z.strictObject({
    left: z.number().min(0).max(1000), top: z.number().min(0).max(1000),
    right: z.number().min(0).max(1000), bottom: z.number().min(0).max(1000),
}).refine(box => box.left < box.right && box.top < box.bottom, 'Box must have positive area');
export const analysisRegionSchema = z.strictObject({
    id, sourceImageId: id, box: modelBoxSchema,
    kind: z.enum(['sign', 'inscription', 'badge', 'vehicle', 'building', 'object', 'damage', 'protected_text']),
    observation: concise, confidence: confidenceSchema,
});
export const analysisResultSchema = z.strictObject({
    claims: z.array(analysisClaimSchema).max(100), regions: z.array(analysisRegionSchema).max(30),
    refinementOpportunities: z.array(refinementOpportunitySchema).max(12),
});
export type AnalysisStage = z.infer<typeof analysisStageSchema>;
export type AnalysisField = keyof typeof fieldSchemas;
export type AnalysisClaim = z.infer<typeof analysisClaimSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type AnalysisRegion = z.infer<typeof analysisRegionSchema>;
export type RefinementTarget = z.infer<typeof refinementTargetSchema>;
export type EnhancementRecommendation = z.infer<typeof enhancementRecommendationSchema>;
export type AnalysisSource = {
    id: string; assetId: string; kind: 'image' | 'local' | 'person' | 'related_photo' | 'relationship' | 'user' | 'claim';
    refId: string; imageId?: string; text: string;
    rootClaimIds?: string[];
    evidenceConfidence?: AnalysisClaim['confidence'];
    memberships?: Array<{ eventId: string; assetId: string; revision: number }>;
};
export type StoredAnalysisClaim = AnalysisClaim & {
    id: string; assetId: string; runId: string; stage: AnalysisStage;
    state: 'active' | 'rejected' | 'superseded'; provider: string; modelVersion: string | null;
};
export type AnalysisSnapshot = {
    claims: StoredAnalysisClaim[]; winners: StoredAnalysisClaim[]; sources: AnalysisSource[];
    refinementOpportunities: AnalysisResult['refinementOpportunities']; enhancementRecommendations: EnhancementRecommendation[];
};

/** Safety is derived by the host, never a model's unqualified yes/no. */
export function isSafeAutomaticEnhancement(recommendation: EnhancementRecommendation): boolean {
    return recommendation.expectedBenefit === 'high' && recommendation.confidence === 'high'
        && recommendation.risk === 'low' && !recommendation.generative
        && recommendation.action !== 'face_restoration' && recommendation.action !== 'text_preservation';
}
