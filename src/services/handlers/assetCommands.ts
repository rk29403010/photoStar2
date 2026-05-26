import { v4 as uuidv4 } from 'uuid';
import type { GalleryTimelineSeek, PhotoMetadataBundle } from '../../boundary/contracts/core';
import { createPhotoMetadataBundleLoader } from './assetPhotoMetadataLoader';
import type { CommandHandlerMap } from './types';
import { toAssetPayload } from './assetPayloadModel';
import { buildOrderClause, getGalleryOrder, type AssetGalleryOrder } from './assetGalleryOrder';
import { buildAssetTimelineSeekClause, getAssetTimelineSeek, type AssetTimelineSeekClause } from './assetTimelineSeek';
import {
    buildGroupFieldFragments,
    GROUP_HIERARCHY_CTE,
    buildPrimaryGroupVisibilityPredicate,
} from './assetGroupingQueryFragments';
import { buildFilterSubquery } from './assetQueryFilters';
import { buildAssetDetailFragments, buildLatestDerivedResultJoin, type AssetDetailLevel } from '../../shared/sql/derivedResults';
import { attachInlinePreviewDataUrls } from './galleryInlinePreview';
type AssetRow = {
    id: string;
    original_path: string;
    width: number;
    height: number;
    file_size: number;
    created_at: string;
    binned_at: string | null;
    photo_created_at: string | null;
    photo_created_at_confidence: number | null;
    exif_datetime: string | null;
    metadata_timestamp_source: string | null;
    preview_path: string | null;
    faces_data: string | null;
    rec_data: string | null;
    ai_metadata_data: string | null;
    photo_date_estimate_data: string | null;
    embedded_metadata_data: string | null;
    people_data: string | null;
    type: string | null;
    type_source_kind: string | null;
    type_source_id: string | null;
    caption: string | null;
    caption_source_kind: string | null;
    caption_source_id: string | null;
    description: string | null;
    description_source_kind: string | null;
    description_source_id: string | null;
    location: string | null;
    location_source_kind: string | null;
    location_source_id: string | null;
    estimated_date_most_likely: string | null;
    estimated_date_min: string | null;
    estimated_date_max: string | null;
    estimated_date_display_label: string | null;
    estimated_date_rationale: string | null;
    estimated_date_source_kind: string | null;
    estimated_date_source_id: string | null;
    keywords_json: string | null;
    keywords_source_kind: string | null;
    keywords_source_id: string | null;
    emotional_impact: string | null;
    emotional_impact_source_kind: string | null;
    emotional_impact_source_id: string | null;
    quality_technical: number | null;
    quality_lighting: number | null;
    quality_composition: number | null;
    quality_emotional: number | null;
    quality_discard: number | null;
    quality_source_kind: string | null;
    quality_source_id: string | null;
    recommended_enhancements_json: string | null;
    recommended_enhancements_source_kind: string | null;
    recommended_enhancements_source_id: string | null;
    authenticity_score: number | null;
    authenticity_reasons_json: string | null;
    authenticity_source_kind: string | null;
    authenticity_source_id: string | null;
    subjects_json: string | null;
    subjects_source_kind: string | null;
    subjects_source_id: string | null;
    regions_of_interest_json: string | null;
    regions_of_interest_source_kind: string | null;
    regions_of_interest_source_id: string | null;
    sensitivity_score: number | null;
    sensitivity_status: string | null;
    member_group_id?: string | null;
    member_role?: string | null;
    member_rank?: number | null;
    member_match_evidence?: string | null;
    member_group_type?: string | null;
    stack_count?: number | null;
    group_memberships_json?: string | null;
};

type AssetFilter = { personIds?: string[]; type?: string; albumId?: string; tag?: string };
type AssetQueryPayload = {
    assetId?: string;
    offset?: number;
    limit?: number;
    withGroupCounts?: boolean;
    filter?: AssetFilter;
    detailLevel?: AssetDetailLevel;
    galleryOrder?: AssetGalleryOrder;
    gallerySeek?: GalleryTimelineSeek | null;
    includeEvidence?: boolean;
};

type AssetQueryParts = {
    sql: string;
    params: (string | number)[];
};
function getDetailLevel(payload: AssetQueryPayload | undefined): AssetDetailLevel {
    return payload?.detailLevel === 'gallery' ? 'gallery' : 'full';
}

function buildFilteredAssetsQuery(
    filterSubquery: string,
    timelineSeekClause: AssetTimelineSeekClause,
    params: (string | number)[],
    limit: number,
    offset: number,
    detailLevel: AssetDetailLevel,
    galleryOrder: AssetGalleryOrder,
    includeEvidence: boolean,
): AssetQueryParts {
    const detail = buildAssetDetailFragments({
        detailLevel,
        includeEvidence,
        recAlias: 'fr',
        aiNewAlias: 'aim_new',
        aiLegacyAlias: 'aim_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });
    const groupFields = buildGroupFieldFragments('a');
    const timelineSeekSql = timelineSeekClause.sql ? ` AND ${timelineSeekClause.sql}` : '';
    params.push(...timelineSeekClause.params);
    params.push(limit, offset);

    return {
        sql: `
            ${GROUP_HIERARCHY_CTE}
            SELECT a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.binned_at, a.photo_created_at, a.photo_created_at_confidence,
                ${detail.projectionSelect}
                a.sensitivity_score, a.exif_datetime, a.metadata_timestamp_source,
                am.sensitivity_status,
                p.path as preview_path,
                COALESCE(dr_new.data, dr_legacy.data) as faces_data,
                ${detail.recSelect}
                ${detail.aiSelect}
                ${detail.photoDateEstimateSelect}
                ${detail.embeddedMetadataSelect}
                (
                    SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name))
                    FROM face_assignments fa
                    JOIN people per ON fa.person_id = per.id
                    WHERE fa.asset_id = a.id
                ) as people_data,
                ${groupFields.memberGroupIdSelect}
                ${groupFields.memberRoleSelect}
                ${groupFields.memberRankSelect}
                ${groupFields.memberMatchEvidenceSelect}
                ${groupFields.memberGroupTypeSelect}
                ${groupFields.stackCountSelect}
                ${groupFields.groupMembershipsSelect}
                1 as _query_anchor
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
            WHERE 1=1 ${filterSubquery}${timelineSeekSql}
            ORDER BY ${buildOrderClause({ galleryOrder, defaultDirection: 'ASC' })}
            LIMIT ? OFFSET ?
        `,
        params,
    };
}

function buildGroupedAssetsQuery(
    limit: number,
    offset: number,
    timelineSeekClause: AssetTimelineSeekClause,
    detailLevel: AssetDetailLevel,
    galleryOrder: AssetGalleryOrder,
    includeEvidence: boolean,
): AssetQueryParts {
    const detail = buildAssetDetailFragments({
        detailLevel,
        includeEvidence,
        recAlias: 'r_rec',
        aiNewAlias: 'r_ai_new',
        aiLegacyAlias: 'r_ai_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });
    const groupFields = buildGroupFieldFragments('a');
    const evidenceGroupBy = detailLevel === 'full' && includeEvidence ? ', r_rec.data, r_ai_new.data, r_ai_legacy.data, r_date.data, r_meta.data' : '';
    const timelineSeekSql = timelineSeekClause.sql ? ` AND ${timelineSeekClause.sql}` : '';

    return {
        sql: `
            ${GROUP_HIERARCHY_CTE}
            SELECT
                a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.binned_at, a.photo_created_at, a.photo_created_at_confidence,
                ${detail.projectionSelect}
                a.sensitivity_score, a.exif_datetime, a.metadata_timestamp_source,
                null as sensitivity_status,
                p.path as preview_path,
                COALESCE(r_faces_new.data, r_faces_legacy.data) as faces_data,
                ${detail.recSelect}
                ${detail.aiSelect}
                ${detail.photoDateEstimateSelect}
                ${detail.embeddedMetadataSelect}
                json_group_array(json_object('face_index', fa.face_index, 'person_id', ppl.id, 'name', ppl.name)) as people_data,
                ${groupFields.memberGroupIdSelect}
                ${groupFields.memberRoleSelect}
                ${groupFields.memberRankSelect}
                ${groupFields.memberMatchEvidenceSelect}
                ${groupFields.memberGroupTypeSelect}
                ${groupFields.stackCountSelect}
                ${groupFields.groupMembershipsSelect}
                1 as _query_anchor
            FROM assets a
            LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            ${detail.projectionJoin}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_new', task: 'face_detection' })}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_legacy', task: 'face_landmarks' })}
            ${detail.recJoin}
            ${detail.aiJoin}
            ${detail.photoDateEstimateJoin}
            ${detail.embeddedMetadataJoin}
            LEFT JOIN face_assignments fa ON a.id = fa.asset_id
            LEFT JOIN people ppl ON fa.person_id = ppl.id
            WHERE ${buildPrimaryGroupVisibilityPredicate('a')} AND a.binned_at IS NULL${timelineSeekSql}
            GROUP BY a.id, p.path, r_faces_new.data, r_faces_legacy.data${evidenceGroupBy}
            ORDER BY ${buildOrderClause({ galleryOrder, defaultDirection: 'DESC' })}
            LIMIT ? OFFSET ?
        `,
        params: [...timelineSeekClause.params, limit, offset],
    };
}

function buildUngroupedAssetsQuery(
    limit: number,
    offset: number,
    timelineSeekClause: AssetTimelineSeekClause,
    detailLevel: AssetDetailLevel,
    galleryOrder: AssetGalleryOrder,
    includeEvidence: boolean,
): AssetQueryParts {
    const detail = buildAssetDetailFragments({
        detailLevel,
        includeEvidence,
        recAlias: 'r_rec',
        aiNewAlias: 'r_ai_new',
        aiLegacyAlias: 'r_ai_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });
    const groupFields = buildGroupFieldFragments('a');
    const evidenceGroupBy = detailLevel === 'full' && includeEvidence ? ', r_rec.data, r_ai_new.data, r_ai_legacy.data, r_date.data, r_meta.data' : '';
    const timelineSeekSql = timelineSeekClause.sql ? ` AND ${timelineSeekClause.sql}` : '';

    return {
        sql: `
            ${GROUP_HIERARCHY_CTE}
            SELECT
                a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.binned_at, a.photo_created_at, a.photo_created_at_confidence,
                ${detail.projectionSelect}
                a.sensitivity_score, a.exif_datetime, a.metadata_timestamp_source,
                null as sensitivity_status,
                p.path as preview_path,
                COALESCE(r_faces_new.data, r_faces_legacy.data) as faces_data,
                ${detail.recSelect}
                ${detail.aiSelect}
                ${detail.photoDateEstimateSelect}
                ${detail.embeddedMetadataSelect}
                json_group_array(json_object('face_index', fa.face_index, 'person_id', ppl.id, 'name', ppl.name)) as people_data,
                ${groupFields.memberGroupIdSelect}
                ${groupFields.memberRoleSelect}
                ${groupFields.memberRankSelect}
                ${groupFields.memberMatchEvidenceSelect}
                ${groupFields.memberGroupTypeSelect}
                ${groupFields.stackCountSelect}
                ${groupFields.groupMembershipsSelect}
                1 as _query_anchor
            FROM assets a
            LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            ${detail.projectionJoin}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_new', task: 'face_detection' })}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_legacy', task: 'face_landmarks' })}
            ${detail.recJoin}
            ${detail.aiJoin}
            ${detail.photoDateEstimateJoin}
            ${detail.embeddedMetadataJoin}
            LEFT JOIN face_assignments fa ON a.id = fa.asset_id
            LEFT JOIN people ppl ON fa.person_id = ppl.id
            WHERE 1=1 AND a.binned_at IS NULL${timelineSeekSql}
            GROUP BY a.id, p.path, r_faces_new.data, r_faces_legacy.data${evidenceGroupBy}
            ORDER BY ${buildOrderClause({ galleryOrder, defaultDirection: 'DESC' })}
            LIMIT ? OFFSET ?
        `,
        params: [...timelineSeekClause.params, limit, offset],
    };
}

function buildAssetDetailQuery(assetId: string, includeEvidence: boolean): AssetQueryParts {
    const groupFields = buildGroupFieldFragments('a');
    const detail = buildAssetDetailFragments({
        detailLevel: 'full',
        includeEvidence,
        recAlias: 'r_rec',
        aiNewAlias: 'r_ai_new',
        aiLegacyAlias: 'r_ai_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });

    return {
        sql: `
            ${GROUP_HIERARCHY_CTE}
            SELECT
                a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.binned_at, a.photo_created_at, a.photo_created_at_confidence, a.exif_datetime, a.metadata_timestamp_source,
                ${detail.projectionSelect}
                a.sensitivity_score,
                am.sensitivity_status,
                p.path as preview_path,
                COALESCE(r_faces_new.data, r_faces_legacy.data) as faces_data,
                ${detail.recSelect}
                ${detail.aiSelect}
                ${detail.photoDateEstimateSelect}
                ${detail.embeddedMetadataSelect}
                (
                    SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name))
                    FROM face_assignments fa
                    JOIN people per ON fa.person_id = per.id
                    WHERE fa.asset_id = a.id
                ) as people_data,
                ${groupFields.memberGroupIdSelect}
                ${groupFields.memberRoleSelect}
                ${groupFields.memberRankSelect}
                ${groupFields.memberMatchEvidenceSelect}
                ${groupFields.memberGroupTypeSelect}
                ${groupFields.stackCountSelect}
                ${groupFields.groupMembershipsSelect}
                1 as _query_anchor
            FROM assets a
            LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
            ${detail.projectionJoin}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_new', task: 'face_detection' })}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_legacy', task: 'face_landmarks' })}
            ${detail.recJoin}
            ${detail.aiJoin}
            ${detail.photoDateEstimateJoin}
            ${detail.embeddedMetadataJoin}
            LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
            LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
            WHERE a.id = ?
            LIMIT 1
        `,
        params: [assetId],
    };
}

function toAsset(row: AssetRow, photoMetadata?: PhotoMetadataBundle) {
    const asset = toAssetPayload(row);
    if (photoMetadata) {
        asset.photo_metadata = photoMetadata;
    }
    return asset;
}

function dedupeAssetsById(assets: ReturnType<typeof toAsset>[]) {
    const deduped = new Map<string, ReturnType<typeof toAsset>>();
    for (const asset of assets) {deduped.set(asset.id, asset);}
    return Array.from(deduped.values());
}

function getAssetsQuery(payload: AssetQueryPayload): AssetQueryParts {
    const offset = payload.offset || 0;
    const limit = payload.limit || 500;
    const withGroupCounts = payload.withGroupCounts ?? true;
    const detailLevel = getDetailLevel(payload);
    const galleryOrder = getGalleryOrder(payload);
    const timelineSeekClause = buildAssetTimelineSeekClause('a', galleryOrder, getAssetTimelineSeek(payload));
    const includeEvidence = payload.includeEvidence === true;
    const params: (string | number)[] = [];
    const filterSubquery = buildFilterSubquery(payload.filter, params);

    if (filterSubquery) {return buildFilteredAssetsQuery(filterSubquery, timelineSeekClause, params, limit, offset, detailLevel, galleryOrder, includeEvidence);}
    if (withGroupCounts) {return buildGroupedAssetsQuery(limit, offset, timelineSeekClause, detailLevel, galleryOrder, includeEvidence);}
    return buildUngroupedAssetsQuery(limit, offset, timelineSeekClause, detailLevel, galleryOrder, includeEvidence);
}

function respondAssetList(ctx: Parameters<CommandHandlerMap['get_assets']>[0]) {
    const { id, payload, originWs, dbManager, respond } = ctx;
    const requestPayload = (payload || {}) as AssetQueryPayload;
    const query = getAssetsQuery(requestPayload);
    const rows = dbManager.getDb().prepare(query.sql).all(...query.params) as AssetRow[];
    const loadPhotoMetadata = requestPayload.includeEvidence === true ? createPhotoMetadataBundleLoader(dbManager) : undefined;
    const assets = dedupeAssetsById(rows.map((row) => toAsset(row, loadPhotoMetadata?.(row.id))));
    const responseAssets = requestPayload.detailLevel === 'gallery'
        ? attachInlinePreviewDataUrls(assets)
        : assets;
    const limit = requestPayload.limit || 500;
    const offset = requestPayload.offset || 0;
    respond(id, 'ok', { assets: responseAssets, hasMore: rows.length === limit, limit, offset }, null, originWs);
}

function respondAssetDetail(ctx: Parameters<CommandHandlerMap['get_asset_detail']>[0]) {
    const { id, payload, originWs, dbManager, respond } = ctx;
    const requestPayload = (payload || {}) as AssetQueryPayload;
    if (!requestPayload.assetId) {
        throw new Error('assetId is required');
    }

    const query = buildAssetDetailQuery(requestPayload.assetId, requestPayload.includeEvidence === true);
    const row = dbManager.getDb().prepare(query.sql).get(...query.params) as AssetRow | undefined;
    if (!row) {
        throw new Error(`Asset ${requestPayload.assetId} not found`);
    }

    const loadPhotoMetadata = requestPayload.includeEvidence === true ? createPhotoMetadataBundleLoader(dbManager) : undefined;
    respond(id, 'ok', { asset: toAsset(row, loadPhotoMetadata?.(row.id)) }, null, originWs);
}

export const assetCommandHandlers: CommandHandlerMap = {
    get_ai_calls_log: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { assetId } = payload as { assetId: string };
            if (!assetId) {
                throw new Error('assetId is required');
            }
            const rows = dbManager.getDiagnosticsDb().prepare(`
                SELECT id, call_type, model_name, created_at, (error_message IS NOT NULL) AS has_error
                FROM ai_calls_log
                WHERE asset_id = ?
                ORDER BY created_at DESC
            `).all(assetId) as {
                id: string;
                call_type: string;
                model_name: string;
                created_at: string;
                has_error: number;
            }[];
            const logs = rows.map((r) => ({
                id: r.id,
                call_type: r.call_type,
                model_name: r.model_name,
                created_at: r.created_at,
                has_error: Boolean(r.has_error),
            }));
            respond(id, 'ok', { logs }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_ai_call_log_detail: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { logId } = payload as { logId: string };
            if (!logId) {
                throw new Error('logId is required');
            }
            const log = dbManager.getDiagnosticsDb().prepare(`
                SELECT id, asset_id, call_type, model_name, prompt, result, error_message, created_at
                FROM ai_calls_log
                WHERE id = ?
            `).get(logId) as {
                id: string;
                asset_id: string;
                call_type: string;
                model_name: string;
                prompt: string;
                result: string | null;
                error_message: string | null;
                created_at: string;
            } | undefined;
            if (!log) {
                throw new Error(`AI Call Log detail for ${logId} not found`);
            }
            respond(id, 'ok', { log }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_assets: (ctx) => {
        try {
            respondAssetList(ctx);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    get_asset_detail: (ctx) => {
        try {
            respondAssetDetail(ctx);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    get_sensitivity: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { assetId } = payload as { assetId: string };
            const row = dbManager.getDb().prepare(`
                SELECT a.sensitivity_score, am.sensitivity_status
                FROM assets a
                LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
                LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
                WHERE a.id = ?
            `).get(assetId) as { sensitivity_score: number | null; sensitivity_status: string | null } | undefined;
            respond(id, 'ok', row || { sensitivity_score: null, sensitivity_status: null }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    set_sensitivity: (ctx) => {
        const { id, payload, originWs, dbManager, eventBus, respond } = ctx;
        try {
            const { assetId, status } = payload as { assetId: string; status: string | null };
            const db = dbManager.getDb();

            db.transaction(() => {
                const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as { original_path: string } | undefined;
                if (!asset) {throw new Error(`Asset ${assetId} not found`);}

                let identity = db.prepare('SELECT guid FROM asset_identities WHERE original_path = ?').get(asset.original_path) as { guid: string } | undefined;
                if (!identity) {
                    const guid = uuidv4();
                    db.prepare('INSERT INTO asset_identities (guid, original_path) VALUES (?, ?)').run(guid, asset.original_path);
                    identity = { guid };
                }

                if (status === null) {
                    db.prepare('DELETE FROM assets_manual WHERE identity_guid = ?').run(identity.guid);
                } else {
                    db.prepare(`
                        INSERT INTO assets_manual (identity_guid, sensitivity_status, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(identity_guid) DO UPDATE SET
                            sensitivity_status = excluded.sensitivity_status,
                            updated_at = excluded.updated_at
                    `).run(identity.guid, status, new Date().toISOString());
                }
            })();

            respond(id, 'ok', { message: 'Sensitivity override saved' }, null, originWs);
            eventBus.emit({ type: 'JobCompleted', jobId: 'set-sensitivity', pipelineStage: 'manual' });
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
