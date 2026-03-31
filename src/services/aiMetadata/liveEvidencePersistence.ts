import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { PhotoMetadataProjectionInput, PhotoMetadataProjectionRow } from '../photoMetadata/repository';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { PhotoMetadataBlock } from '../photoMetadata/types';
import { normalizePhotoMetadataBlockBoxes } from '../photoMetadata/coordinateNormalization';

type MetadataSourceKind = 'gemini_flash_scout' | 'gemini_pro_refined';
type MetadataSourceRank = 0 | 1 | 2;
const PROJECTION_SOURCE_KIND_FIELDS = [
    'caption_source_kind',
    'type_source_kind',
    'description_source_kind',
    'location_source_kind',
    'estimated_date_source_kind',
    'keywords_source_kind',
    'emotional_impact_source_kind',
    'quality_source_kind',
    'recommended_enhancements_source_kind',
    'authenticity_source_kind',
    'subjects_source_kind',
    'regions_of_interest_source_kind',
] as const;

function resolveSourceRank(sourceKind: string | null | undefined): MetadataSourceRank {
    if (sourceKind === 'gemini_pro_refined') {
        return 2;
    }
    if (sourceKind === 'gemini_flash_scout') {
        return 1;
    }
    return 0;
}

function getProjectionSourceKind(projection: PhotoMetadataProjectionRow): string | null {
    return PROJECTION_SOURCE_KIND_FIELDS
        .map((field) => projection[field])
        .find((sourceKind): sourceKind is string => sourceKind !== null)
        ?? null;
}

function shouldReplaceProjection(existing: PhotoMetadataProjectionRow | null, nextSourceKind: MetadataSourceKind): boolean {
    if (!existing) {
        return true;
    }
    return resolveSourceRank(nextSourceKind) >= resolveSourceRank(getProjectionSourceKind(existing));
}

function toProjectionSource(sourceKind: string, sourceId: string) {
    return { sourceKind, sourceId };
}

function buildProjectionInput(params: {
    assetId: string;
    metadataBlock: PhotoMetadataBlock;
    metadataSourceKind: MetadataSourceKind;
    sourceId: string;
}): PhotoMetadataProjectionInput {
    const { metadataBlock, metadataSourceKind, sourceId } = params;
    const source = toProjectionSource(metadataSourceKind, sourceId);
    return {
        assetId: params.assetId,
        type: metadataBlock.type,
        caption: metadataBlock.caption,
        description: metadataBlock.description,
        location: metadataBlock.location,
        estimatedDate: metadataBlock.estimated_date,
        keywords: metadataBlock.keywords,
        emotionalImpact: metadataBlock.emotional_impact,
        quality: metadataBlock.quality,
        recommendedEnhancements: metadataBlock.recommended_enhancements,
        authenticity: metadataBlock.authenticity,
        subjects: metadataBlock.subjects,
        regionsOfInterest: metadataBlock.regions_of_interest,
        provenance: {
            type: source,
            caption: source,
            description: source,
            location: source,
            estimatedDate: source,
            keywords: source,
            emotionalImpact: source,
            quality: source,
            recommendedEnhancements: source,
            authenticity: source,
            subjects: source,
            regionsOfInterest: source,
        },
    };
}

export function persistPhotoMetadataEvidence(params: {
    dbManager: DatabaseManager;
    assetId: string;
    sourceKind: MetadataSourceKind;
    provider: string;
    modelVersion: string;
    metadataBlock: PhotoMetadataBlock;
}): string {
    const repository = createPhotoMetadataRepository({ dbManager: params.dbManager });
    const normalizedMetadataBlock = normalizePhotoMetadataBlockBoxes(params.metadataBlock);
    const blockId = repository.insertMetadataBlock({
        assetId: params.assetId,
        sourceKind: params.sourceKind,
        provider: params.provider,
        modelVersion: params.modelVersion,
        schemaVersion: 1,
        block: normalizedMetadataBlock,
    });
    if (shouldReplaceProjection(repository.loadProjection(params.assetId), params.sourceKind)) {
        repository.saveProjection(buildProjectionInput({
            assetId: params.assetId,
            metadataBlock: normalizedMetadataBlock,
            metadataSourceKind: params.sourceKind,
            sourceId: blockId,
        }));
    }
    return blockId;
}

export function persistAiMetadataResult(params: {
    dbManager: DatabaseManager;
    assetId: string;
    provider: string;
    modelVersion: string;
    data: unknown;
}): void {
    params.dbManager.getDb().prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'ai_metadata', ?, ?, ?)
    `).run(uuidv4(), params.assetId, params.provider, params.modelVersion, JSON.stringify(params.data));
}
