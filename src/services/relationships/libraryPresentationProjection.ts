import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type LibraryPresentationOrder = 'default' | 'oldest_first' | 'previewed_first';
export type LibraryPresentationRelationshipKind = 'edit_lineage' | 'exact_copy' | null;

export type LibraryPresentationItem = {
    presentationKey: string;
    representativeAssetId: string;
    relationshipKind: LibraryPresentationRelationshipKind;
    stackCount: number;
    assetIds: string[];
    originalPath: string;
    photoCreatedAt: string | null;
    createdAt: string;
    previewPath: string | null;
};

type PresentationRow = {
    presentation_key: string;
    representative_asset_id: string;
    relationship_kind: LibraryPresentationRelationshipKind;
    stack_count: number;
    asset_ids_json: string;
    original_path: string;
    photo_created_at: string | null;
    created_at: string;
    preview_path: string | null;
};

const PIXEL_AREA_SQL = '(MAX(COALESCE(a.width, 0), 0) * MAX(COALESCE(a.height, 0), 0))';
const EXTENSION_QUALITY_SQL = `
    CASE
        WHEN lower(a.original_path) LIKE '%.avif' THEN 5
        WHEN lower(a.original_path) LIKE '%.heic' OR lower(a.original_path) LIKE '%.heif' THEN 4
        WHEN lower(a.original_path) LIKE '%.png'
          OR lower(a.original_path) LIKE '%.tif'
          OR lower(a.original_path) LIKE '%.tiff' THEN 3
        WHEN lower(a.original_path) LIKE '%.webp' THEN 2
        WHEN lower(a.original_path) LIKE '%.jpg' OR lower(a.original_path) LIKE '%.jpeg' THEN 1
        ELSE 0
    END
`;
const BYTES_PER_PIXEL_SQL = `
    CASE
        WHEN ${PIXEL_AREA_SQL} <= 0 THEN 0
        ELSE COALESCE(a.file_size, 0) * 1.0 / ${PIXEL_AREA_SQL}
    END
`;

const EXACT_COPY_PRESENTATION_CTE = `
    WITH RankedAssets AS (
        SELECT
            a.id,
            a.file_hash,
            COUNT(*) OVER (PARTITION BY a.file_hash) AS hash_count,
            ROW_NUMBER() OVER (
                PARTITION BY a.file_hash
                ORDER BY
                    ${PIXEL_AREA_SQL} DESC,
                    ${EXTENSION_QUALITY_SQL} DESC,
                    ${BYTES_PER_PIXEL_SQL} DESC,
                    COALESCE(a.file_size, 0) DESC,
                    a.id ASC
            ) AS exact_rank
        FROM assets a
    ),
    PresentationAssets AS (
        SELECT
            id AS representative_asset_id,
            file_hash,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN 'exact:' || file_hash
                ELSE 'asset:' || id
            END AS presentation_key,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN 'exact_copy'
                ELSE NULL
            END AS relationship_kind,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN hash_count
                ELSE 1
            END AS stack_count
        FROM RankedAssets
        WHERE file_hash IS NULL OR hash_count = 1 OR exact_rank = 1
    )
`;

const RELATIONSHIP_PRESENTATION_CTE = `
    WITH RECURSIVE
    PhotographRepresentations AS (
        SELECT
            r.id AS representation_id,
            r.subject_entity_id,
            r.representation_kind,
            r.derived_from_representation_id,
            r.created_at AS representation_created_at,
            (
                SELECT current_asset.id
                FROM assets current_asset
                WHERE current_asset.original_path = ai.original_path
                ORDER BY current_asset.created_at DESC, current_asset.id DESC
                LIMIT 1
            ) AS asset_id
        FROM archive_representations r
        JOIN asset_identities ai ON ai.guid = r.asset_identity_guid
        JOIN semantic_entities e ON e.id = r.subject_entity_id
        WHERE e.kind = 'photograph'
    ),
    RepresentationLineage(
        root_representation_id,
        representation_id,
        subject_entity_id,
        representation_kind,
        representation_created_at,
        asset_id,
        depth
    ) AS (
        SELECT
            representation_id,
            representation_id,
            subject_entity_id,
            representation_kind,
            representation_created_at,
            asset_id,
            0
        FROM PhotographRepresentations
        WHERE derived_from_representation_id IS NULL

        UNION ALL

        SELECT
            lineage.root_representation_id,
            child.representation_id,
            child.subject_entity_id,
            child.representation_kind,
            child.representation_created_at,
            child.asset_id,
            lineage.depth + 1
        FROM RepresentationLineage lineage
        JOIN PhotographRepresentations child
          ON child.derived_from_representation_id = lineage.representation_id
         AND child.subject_entity_id = lineage.subject_entity_id
    ),
    CandidateEditRoots AS (
        SELECT root_representation_id
        FROM RepresentationLineage
        GROUP BY root_representation_id
        HAVING MAX(CASE WHEN representation_kind = 'derived_edit' THEN 1 ELSE 0 END) = 1
           AND COUNT(DISTINCT asset_id) > 1
    ),
    CandidateEditMembers AS (
        SELECT DISTINCT lineage.root_representation_id, lineage.asset_id
        FROM RepresentationLineage lineage
        JOIN CandidateEditRoots roots
          ON roots.root_representation_id = lineage.root_representation_id
        WHERE lineage.asset_id IS NOT NULL
    ),
    AmbiguousEditAssets AS (
        SELECT asset_id
        FROM CandidateEditMembers
        GROUP BY asset_id
        HAVING COUNT(DISTINCT root_representation_id) > 1
    ),
    EligibleEditRoots AS (
        SELECT roots.root_representation_id
        FROM CandidateEditRoots roots
        WHERE NOT EXISTS (
            SELECT 1
            FROM CandidateEditMembers member
            JOIN AmbiguousEditAssets ambiguous ON ambiguous.asset_id = member.asset_id
            WHERE member.root_representation_id = roots.root_representation_id
        )
    ),
    EditMembers AS (
        SELECT member.root_representation_id, member.asset_id
        FROM CandidateEditMembers member
        JOIN EligibleEditRoots roots
          ON roots.root_representation_id = member.root_representation_id
    ),
    EditMemberCounts AS (
        SELECT root_representation_id, COUNT(*) AS stack_count
        FROM EditMembers
        GROUP BY root_representation_id
    ),
    RankedEditRepresentatives AS (
        SELECT
            lineage.root_representation_id,
            lineage.asset_id,
            ROW_NUMBER() OVER (
                PARTITION BY lineage.root_representation_id
                ORDER BY
                    CASE WHEN lineage.representation_kind = 'derived_edit' THEN 0 ELSE 1 END,
                    lineage.representation_created_at DESC,
                    lineage.depth DESC,
                    lineage.asset_id DESC
            ) AS representative_rank
        FROM RepresentationLineage lineage
        JOIN EligibleEditRoots roots
          ON roots.root_representation_id = lineage.root_representation_id
        WHERE lineage.asset_id IS NOT NULL
    ),
    EditRepresentatives AS (
        SELECT root_representation_id, asset_id AS representative_asset_id
        FROM RankedEditRepresentatives
        WHERE representative_rank = 1
    ),
    RemainingAssets AS (
        SELECT a.*
        FROM assets a
        WHERE NOT EXISTS (
            SELECT 1
            FROM EditMembers member
            WHERE member.asset_id = a.id
        )
    ),
    RankedRemainingAssets AS (
        SELECT
            a.id,
            a.file_hash,
            COUNT(*) OVER (PARTITION BY a.file_hash) AS hash_count,
            ROW_NUMBER() OVER (
                PARTITION BY a.file_hash
                ORDER BY
                    ${PIXEL_AREA_SQL} DESC,
                    ${EXTENSION_QUALITY_SQL} DESC,
                    ${BYTES_PER_PIXEL_SQL} DESC,
                    COALESCE(a.file_size, 0) DESC,
                    a.id ASC
            ) AS exact_rank
        FROM RemainingAssets a
    ),
    ExactOrIndividualAssets AS (
        SELECT
            id AS representative_asset_id,
            file_hash,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN 'exact:' || file_hash
                ELSE 'asset:' || id
            END AS presentation_key,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN 'exact_copy'
                ELSE NULL
            END AS relationship_kind,
            CASE
                WHEN file_hash IS NOT NULL AND hash_count > 1 THEN hash_count
                ELSE 1
            END AS stack_count
        FROM RankedRemainingAssets
        WHERE file_hash IS NULL OR hash_count = 1 OR exact_rank = 1
    ),
    PresentationAssets AS (
        SELECT
            'edit:' || representative.root_representation_id AS presentation_key,
            representative.representative_asset_id,
            'edit_lineage' AS relationship_kind,
            counts.stack_count,
            representative.root_representation_id AS edit_root_id,
            NULL AS file_hash
        FROM EditRepresentatives representative
        JOIN EditMemberCounts counts
          ON counts.root_representation_id = representative.root_representation_id

        UNION ALL

        SELECT
            remaining.presentation_key,
            remaining.representative_asset_id,
            remaining.relationship_kind,
            remaining.stack_count,
            NULL AS edit_root_id,
            remaining.file_hash
        FROM ExactOrIndividualAssets remaining
    )
`;

function buildPresentationOrderClause(order: LibraryPresentationOrder): string {
    const chronologicalDirection = order === 'oldest_first' ? 'ASC' : 'DESC';
    const photoDateOrder = `CASE WHEN a.photo_created_at IS NULL THEN 1 ELSE 0 END ASC, a.photo_created_at ${chronologicalDirection}, a.created_at ${chronologicalDirection}`;
    if (order === 'previewed_first') {
        return `CASE WHEN p.path IS NULL THEN 1 ELSE 0 END ASC, a.created_at ASC, ${photoDateOrder}, a.id ASC`;
    }
    return photoDateOrder;
}

function toPresentationItem(row: PresentationRow): LibraryPresentationItem {
    const assetIds = JSON.parse(row.asset_ids_json) as string[];
    assetIds.sort((left, right) => left.localeCompare(right));
    return {
        presentationKey: row.presentation_key,
        representativeAssetId: row.representative_asset_id,
        relationshipKind: row.relationship_kind,
        stackCount: row.stack_count,
        assetIds,
        originalPath: row.original_path,
        photoCreatedAt: row.photo_created_at,
        createdAt: row.created_at,
        previewPath: row.preview_path,
    };
}

export function getExactCopyPresentationPage(
    db: DbHandle,
    options: { limit: number; offset: number; order?: LibraryPresentationOrder },
): LibraryPresentationItem[] {
    const limit = Math.max(0, Math.trunc(options.limit));
    const offset = Math.max(0, Math.trunc(options.offset));
    const order = options.order ?? 'default';
    const rows = db.prepare(`
        ${EXACT_COPY_PRESENTATION_CTE}
        SELECT
            pa.presentation_key,
            pa.representative_asset_id,
            pa.relationship_kind,
            pa.stack_count,
            CASE
                WHEN pa.relationship_kind = 'exact_copy' THEN (
                    SELECT json_group_array(member.id)
                    FROM assets member
                    WHERE member.file_hash = pa.file_hash
                )
                ELSE json_array(a.id)
            END AS asset_ids_json,
            a.original_path,
            a.photo_created_at,
            a.created_at,
            p.path AS preview_path
        FROM PresentationAssets pa
        JOIN assets a ON a.id = pa.representative_asset_id
        LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
        WHERE a.binned_at IS NULL
        ORDER BY ${buildPresentationOrderClause(order)}
        LIMIT ? OFFSET ?
    `).all(limit, offset) as PresentationRow[];
    return rows.map(toPresentationItem);
}

export function countExactCopyPresentationItems(db: DbHandle): number {
    const row = db.prepare(`
        ${EXACT_COPY_PRESENTATION_CTE}
        SELECT COUNT(*) AS count
        FROM PresentationAssets pa
        JOIN assets a ON a.id = pa.representative_asset_id
        WHERE a.binned_at IS NULL
    `).get() as { count: number };
    return row.count;
}

export function getRelationshipPresentationPage(
    db: DbHandle,
    options: { limit: number; offset: number; order?: LibraryPresentationOrder },
): LibraryPresentationItem[] {
    const limit = Math.max(0, Math.trunc(options.limit));
    const offset = Math.max(0, Math.trunc(options.offset));
    const order = options.order ?? 'default';
    const rows = db.prepare(`
        ${RELATIONSHIP_PRESENTATION_CTE}
        SELECT
            pa.presentation_key,
            pa.representative_asset_id,
            pa.relationship_kind,
            pa.stack_count,
            CASE
                WHEN pa.relationship_kind = 'edit_lineage' THEN (
                    SELECT json_group_array(member.asset_id)
                    FROM EditMembers member
                    WHERE member.root_representation_id = pa.edit_root_id
                )
                WHEN pa.relationship_kind = 'exact_copy' THEN (
                    SELECT json_group_array(member.id)
                    FROM RemainingAssets member
                    WHERE member.file_hash = pa.file_hash
                )
                ELSE json_array(a.id)
            END AS asset_ids_json,
            a.original_path,
            a.photo_created_at,
            a.created_at,
            p.path AS preview_path
        FROM PresentationAssets pa
        JOIN assets a ON a.id = pa.representative_asset_id
        LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
        WHERE a.binned_at IS NULL
        ORDER BY ${buildPresentationOrderClause(order)}
        LIMIT ? OFFSET ?
    `).all(limit, offset) as PresentationRow[];
    return rows.map(toPresentationItem);
}

export function countRelationshipPresentationItems(db: DbHandle): number {
    const row = db.prepare(`
        ${RELATIONSHIP_PRESENTATION_CTE}
        SELECT COUNT(*) AS count
        FROM PresentationAssets pa
        JOIN assets a ON a.id = pa.representative_asset_id
        WHERE a.binned_at IS NULL
    `).get() as { count: number };
    return row.count;
}
