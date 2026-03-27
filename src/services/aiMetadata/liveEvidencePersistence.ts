import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { PhotoMetadataProjectionInput } from '../photoMetadata/repository';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { PhotoMetadataBlock } from '../photoMetadata/types';

type MetadataSourceKind = 'gemini_flash_scout' | 'gemini_pro_refined';

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
    const blockId = repository.insertMetadataBlock({
        assetId: params.assetId,
        sourceKind: params.sourceKind,
        provider: params.provider,
        modelVersion: params.modelVersion,
        schemaVersion: 1,
        block: params.metadataBlock,
    });
    repository.saveProjection(buildProjectionInput({
        assetId: params.assetId,
        metadataBlock: params.metadataBlock,
        metadataSourceKind: params.sourceKind,
        sourceId: blockId,
    }));
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
