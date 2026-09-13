import type { DatabaseManager } from '../../data/db';
import { buildAssetDetailFragments, buildLatestDerivedResultJoin, type AssetDetailLevel } from '../../shared/sql/derivedResults';
import { createPhotoMetadataBundleLoader } from './assetPhotoMetadataLoader';
import { toAssetPayload, type AssetPayloadRow } from './assetPayloadModel';
import { attachInlinePreviewDataUrls } from './galleryInlinePreview';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type AssetPayload = ReturnType<typeof toAssetPayload>;

function buildRepresentativeRowsQuery(assetIds: readonly string[], detailLevel: AssetDetailLevel, includeEvidence: boolean) {
    const detail = buildAssetDetailFragments({
        detailLevel,
        includeEvidence,
        recAlias: 'fr',
        aiNewAlias: 'aim_new',
        aiLegacyAlias: 'aim_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });
    const placeholders = assetIds.map(() => '?').join(', ');
    return `
        SELECT
            a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
            a.binned_at, a.photo_created_at, a.photo_created_at_confidence,
            ${detail.projectionSelect}
            a.sensitivity_score, a.exif_datetime, a.metadata_timestamp_source,
            am.sensitivity_status,
            (SELECT data FROM derived_results WHERE asset_id = a.id AND task = 'frame_detection' LIMIT 1) AS frame_detection_data,
            (SELECT json_group_array(data) FROM asset_mask_metadata WHERE asset_id = a.id) AS mask_metadata_data,
            p.path AS preview_path,
            COALESCE(dr_new.data, dr_legacy.data) AS faces_data,
            ${detail.recSelect}
            ${detail.aiSelect}
            ${detail.photoDateEstimateSelect}
            ${detail.embeddedMetadataSelect}
            (
                SELECT json_group_array(json_object(
                    'face_index', fa.face_index,
                    'person_id', per.id,
                    'name', per.name,
                    'is_suggested', fa.is_suggested
                ))
                FROM face_assignments fa
                JOIN people per ON fa.person_id = per.id
                WHERE fa.asset_id = a.id
            ) AS people_data
        FROM assets a
        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
        ${detail.projectionJoin}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'dr_new', task: 'face_detection' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'dr_legacy', task: 'face_landmarks' })}
        ${detail.recJoin}
        ${detail.aiJoin}
        ${detail.photoDateEstimateJoin}
        ${detail.embeddedMetadataJoin}
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE a.id IN (${placeholders})
    `;
}

function orderAssets(assetIds: readonly string[], assets: readonly AssetPayload[]): AssetPayload[] {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return assetIds.flatMap((assetId) => {
        const asset = byId.get(assetId);
        return asset ? [asset] : [];
    });
}

export function loadRelationshipGalleryRepresentativeAssets(params: {
    dbManager: DatabaseManager;
    representativeAssetIds: string[];
    detailLevel: AssetDetailLevel;
    includeEvidence: boolean;
}): AssetPayload[] {
    const { dbManager, representativeAssetIds, detailLevel, includeEvidence } = params;
    if (representativeAssetIds.length === 0) {
        return [];
    }
    const db: DbHandle = dbManager.getDb();
    const rows = db.prepare(
        buildRepresentativeRowsQuery(representativeAssetIds, detailLevel, includeEvidence),
    ).all(...representativeAssetIds) as AssetPayloadRow[];
    const loadPhotoMetadata = includeEvidence ? createPhotoMetadataBundleLoader(dbManager) : undefined;
    const assets = rows.map((row) => {
        const asset = toAssetPayload(row);
        const photoMetadata = loadPhotoMetadata?.(row.id);
        if (photoMetadata) {
            asset.photo_metadata = photoMetadata;
        }
        return asset;
    });
    const responseAssets = detailLevel === 'gallery' ? attachInlinePreviewDataUrls(assets) : assets;
    return orderAssets(representativeAssetIds, responseAssets);
}
