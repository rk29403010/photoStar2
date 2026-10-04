import type { Asset, PhotoMetadataSourceSummary } from '../boundary/contracts/core';

export type LibraryReadinessAppearance = 'ready' | 'safe_enhancement' | 'manual_restoration' | 'limited_recovery' | 'unknown';
export type LibraryReadinessMetadata = 'ready' | 'easy_refinement' | 'needs_investigation' | 'unknown_or_conflicted';
export type LibraryReadinessView = 'ready_now' | 'quick_wins' | 'worth_investigating' | 'needs_hands_on';
export type LibraryNextAction = 'no_action' | 'review_enhancement' | 'refine_date' | 'investigate_location' | 'review_person_candidate' | 'examine_inscription' | 'manual_restoration';
export type LibraryAttentionKind = 'problem' | 'opportunity';

export type LibraryReadiness = {
    appearance: LibraryReadinessAppearance;
    metadata: LibraryReadinessMetadata;
    assessmentConfidence: 'high' | 'medium' | 'low' | 'unknown';
    attention: Array<{ kind: LibraryAttentionKind; code: string }>;
    nextAction: LibraryNextAction;
    views: LibraryReadinessView[];
    provenance: Record<'date' | 'location' | 'appearance', string | null>;
};

export type LibraryReadinessSummary = {
    assessedCount: number;
    readinessPercent: number | null;
    appearance: Record<LibraryReadinessAppearance, number>;
    metadata: Record<LibraryReadinessMetadata, number>;
    views: Record<LibraryReadinessView, number>;
};

type ReadinessInput = Pick<Asset, 'faces' | 'pending_review_items' | 'photo_metadata'>;

const UNKNOWN_LOCATION_VALUES = new Set(['', 'unknown', 'unknown location', 'not known']);
const RISK_KEYWORDS = ['face', 'handwriting', 'inscription', 'sign', 'medal', 'badge', 'text'];

function hasKnownValue(value: string | null | undefined) {
    return Boolean(value && !UNKNOWN_LOCATION_VALUES.has(value.trim().toLowerCase()));
}

function hasRiskBearingRegion(regions: unknown[]) {
    return regions.some((region) => {
        if (!region || typeof region !== 'object') {return false;}
        const values = Object.values(region)
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
            .toLowerCase();
        return RISK_KEYWORDS.some((keyword) => values.includes(keyword));
    });
}

function sourceKind(source: PhotoMetadataSourceSummary | undefined) {
    return source?.sourceKind ?? null;
}

function hasResolvedDate(input: ReadinessInput) {
    const date = input.photo_metadata?.projection.estimatedDate;
    return hasKnownValue(date?.display_label) || hasKnownValue(date?.most_likely_date);
}

function hasPendingReview(input: ReadinessInput) {
    return (input.pending_review_items?.length ?? 0) > 0;
}

function hasUnidentifiedPeople(input: ReadinessInput, subjectCount: number) {
    return (input.faces?.length ?? 0) > 0 && subjectCount === 0;
}

function buildAttention(input: ReadinessInput) {
    const projection = input.photo_metadata?.projection;
    if (!projection) {return [{ kind: 'problem' as const, code: 'metadata_unassessed' }];}

    const attention: LibraryReadiness['attention'] = [];
    if (!hasResolvedDate(input)) {attention.push({ kind: 'problem', code: 'date_unknown' });}
    if (!hasKnownValue(projection.location)) {attention.push({ kind: 'problem', code: 'location_unknown' });}
    if (hasUnidentifiedPeople(input, projection.subjects.length)) {attention.push({ kind: 'problem', code: 'people_unidentified' });}
    if (hasPendingReview(input)) {attention.push({ kind: 'problem', code: 'review_pending' });}
    if (hasRiskBearingRegion(projection.regionsOfInterest)) {attention.push({ kind: 'opportunity', code: 'detail_worth_examining' });}
    return attention;
}

function buildAppearance(input: ReadinessInput): LibraryReadinessAppearance {
    const projection = input.photo_metadata?.projection;
    if (!projection) {return 'unknown';}
    if (projection.quality.discard === true) {return 'limited_recovery';}
    if (projection.recommendedEnhancements.length === 0) {
        return projection.quality.technical === null ? 'unknown' : 'ready';
    }
    return hasRiskBearingRegion(projection.regionsOfInterest) || (input.faces?.length ?? 0) > 0
        ? 'manual_restoration'
        : 'safe_enhancement';
}

function buildMetadata(input: ReadinessInput, attention: LibraryReadiness['attention']): LibraryReadinessMetadata {
    const projection = input.photo_metadata?.projection;
    if (!projection) {return 'unknown_or_conflicted';}
    const hasDate = hasResolvedDate(input);
    const hasLocation = hasKnownValue(projection.location);
    if (hasDate && hasLocation && attention.every((item) => item.kind !== 'problem')) {return 'ready';}
    if (hasDate !== hasLocation) {return 'easy_refinement';}
    return 'needs_investigation';
}

function buildNextAction(params: { appearance: LibraryReadinessAppearance; attention: LibraryReadiness['attention'] }) : LibraryNextAction {
    if (params.appearance === 'limited_recovery' || params.appearance === 'manual_restoration') {return 'manual_restoration';}
    if (params.attention.some((item) => item.code === 'detail_worth_examining')) {return 'examine_inscription';}
    if (params.attention.some((item) => item.code === 'people_unidentified')) {return 'review_person_candidate';}
    if (params.attention.some((item) => item.code === 'location_unknown')) {return 'investigate_location';}
    if (params.attention.some((item) => item.code === 'date_unknown')) {return 'refine_date';}
    if (params.appearance === 'safe_enhancement') {return 'review_enhancement';}
    return 'no_action';
}

export function deriveLibraryReadiness(input: ReadinessInput): LibraryReadiness {
    const attention = buildAttention(input);
    const appearance = buildAppearance(input);
    const metadata = buildMetadata(input, attention);
    const provenance = input.photo_metadata?.provenance;
    const views: LibraryReadinessView[] = [];
    const isReadyNow = appearance === 'ready' && metadata === 'ready';
    if (isReadyNow) {views.push('ready_now');}
    if (isReadyNow || appearance === 'safe_enhancement' || metadata === 'easy_refinement') {views.push('quick_wins');}
    if (metadata === 'needs_investigation' || attention.some((item) => item.kind === 'opportunity')) {views.push('worth_investigating');}
    if (appearance === 'manual_restoration' || appearance === 'limited_recovery') {views.push('needs_hands_on');}
    return {
        appearance,
        metadata,
        // Quality observations currently lack a persisted calibration contract, so readiness never
        // promotes their presence into a made-up confidence level.
        assessmentConfidence: 'unknown',
        attention,
        nextAction: buildNextAction({ appearance, attention }),
        views,
        provenance: {
            date: sourceKind(provenance?.estimatedDate),
            location: sourceKind(provenance?.location),
            appearance: sourceKind(provenance?.quality),
        },
    };
}

export function summarizeLibraryReadiness(items: ReadinessInput[]): LibraryReadinessSummary {
    const appearance: LibraryReadinessSummary['appearance'] = { ready: 0, safe_enhancement: 0, manual_restoration: 0, limited_recovery: 0, unknown: 0 };
    const metadata: LibraryReadinessSummary['metadata'] = { ready: 0, easy_refinement: 0, needs_investigation: 0, unknown_or_conflicted: 0 };
    const views: LibraryReadinessSummary['views'] = { ready_now: 0, quick_wins: 0, worth_investigating: 0, needs_hands_on: 0 };
    let assessedCount = 0;
    let readyDimensions = 0;
    for (const item of items) {
        const readiness = deriveLibraryReadiness(item);
        appearance[readiness.appearance] += 1;
        metadata[readiness.metadata] += 1;
        readiness.views.forEach((view) => { views[view] += 1; });
        if (readiness.appearance !== 'unknown' || readiness.metadata !== 'unknown_or_conflicted') {assessedCount += 1;}
        if (readiness.appearance === 'ready') {readyDimensions += 1;}
        if (readiness.metadata === 'ready') {readyDimensions += 1;}
    }
    return {
        assessedCount,
        readinessPercent: assessedCount === 0 ? null : Math.round((readyDimensions / (assessedCount * 2)) * 100),
        appearance,
        metadata,
        views,
    };
}
