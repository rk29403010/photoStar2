import type { DatabaseManager } from '../../data/db';
import type {
    ReviewItemStatus,
    ReviewItemType,
    TagDefinitionStatus,
} from './tagTypes';
import type {
    AssignTagToAssetParams,
    CreateReviewItemParams,
    CreateTagAliasParams,
    CreateTagDefinitionParams,
    MergeTagDefinitionsParams,
    RemoveTagAssignmentParams,
    RenameTagDefinitionParams,
    ReviewItemRecord,
    TagAliasRecord,
    TagAssignmentRecord,
    TagDefinitionRecord,
    TaggedAssetRecord,
} from './tagRepositoryModels';
import {
    buildListDefinitionsQuery,
    buildReviewItemWhereClause,
    createId,
    mapTagDefinitionRow,
    normalizeLabel,
} from './tagRepositoryHelpers';
import {
    deleteTagAlias as deleteTagAliasQuery,
    findExistingAliasId,
    findLabelOwner,
    getTagAlias as getTagAliasQuery,
    listTagAliases as listTagAliasesQuery,
} from './tagRepositoryAliasQueries';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export class TagRepository {
    constructor(private readonly dbManager: DatabaseManager) {}

    private get db(): DbHandle {
        return this.dbManager.getDb();
    }

    private findLabelOwner(params: {
        label: string;
        excludedTagDefinitionId?: string;
    }): { tagDefinitionId: string; aliasId: string | null; matchKind: 'canonical' | 'alias' } | null {
        return findLabelOwner(this.db, {
            label: normalizeLabel(params.label),
            excludedTagDefinitionId: params.excludedTagDefinitionId,
        });
    }

    private ensureTagExists(tagDefinitionId: string) {
        const definition = this.getTagDefinition(tagDefinitionId);
        if (!definition) {
            throw new Error(`Tag ${tagDefinitionId} not found`);
        }
        return definition;
    }

    private ensureAlias(params: {
        tagDefinitionId: string;
        aliasLabel: string;
        id?: string;
    }) {
        const normalizedAlias = normalizeLabel(params.aliasLabel);
        if (this.ensureTagExists(params.tagDefinitionId).canonicalLabel.localeCompare(normalizedAlias, undefined, { sensitivity: 'base' }) === 0) {
            return null;
        }

        const owner = this.findLabelOwner({
            label: normalizedAlias,
            excludedTagDefinitionId: params.tagDefinitionId,
        });
        if (owner) {
            throw new Error(`Tag label ${normalizedAlias} already belongs to another tag`);
        }

        const existingAliasId = findExistingAliasId(this.db, params.tagDefinitionId, normalizedAlias);
        if (existingAliasId) {
            return existingAliasId;
        }

        const aliasId = createId(params.id);
        this.db.prepare(`
            INSERT INTO tag_aliases (
                id, tag_definition_id, alias_label
            ) VALUES (
                @id, @tag_definition_id, @alias_label
            )
        `).run({
            id: aliasId,
            tag_definition_id: params.tagDefinitionId,
            alias_label: normalizedAlias,
        });

        return aliasId;
    }

    createTagDefinition(params: CreateTagDefinitionParams) {
        const id = createId(params.id);
        const normalizedLabel = normalizeLabel(params.canonicalLabel);
        const existingOwner = this.findLabelOwner({ label: normalizedLabel });
        if (existingOwner) {
            throw new Error(`Tag label ${normalizedLabel} already exists`);
        }
        this.db.prepare(`
            INSERT INTO tag_definitions (
                id, canonical_label, description, status, category
            ) VALUES (
                @id, @canonical_label, @description, @status, @category
            )
        `).run({
            id,
            canonical_label: normalizedLabel,
            description: params.description ?? null,
            status: params.status ?? 'active',
            category: params.category ?? null,
        });

        return id;
    }

    createTagAlias(params: CreateTagAliasParams) {
        return this.ensureAlias(params);
    }

    getTagDefinition(tagDefinitionId: string): TagDefinitionRecord | null {
        const row = this.db.prepare(`
            SELECT
                id,
                canonical_label AS canonicalLabel,
                description,
                status,
                category,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM tag_definitions
            WHERE id = ?
            LIMIT 1
        `).get(tagDefinitionId) as Record<string, unknown> | undefined;

        return row ? mapTagDefinitionRow(row) : null;
    }

    findTagDefinitionByLabel(label: string): TagDefinitionRecord | null {
        const normalizedLabel = normalizeLabel(label);
        const row = this.db.prepare(`
            SELECT
                td.id,
                td.canonical_label AS canonicalLabel,
                td.description,
                td.status,
                td.category,
                td.created_at AS createdAt,
                td.updated_at AS updatedAt
            FROM tag_definitions td
            LEFT JOIN tag_aliases ta ON ta.tag_definition_id = td.id
            WHERE lower(td.canonical_label) = lower(?)
               OR lower(ta.alias_label) = lower(?)
            ORDER BY CASE WHEN lower(td.canonical_label) = lower(?) THEN 0 ELSE 1 END ASC
            LIMIT 1
        `).get(normalizedLabel, normalizedLabel, normalizedLabel) as Record<string, unknown> | undefined;

        return row ? mapTagDefinitionRow(row) : null;
    }

    listTagDefinitions(filters: {
        status?: TagDefinitionStatus;
        includeAssignmentCounts?: boolean;
    } = {}): TagDefinitionRecord[] {
        const query = buildListDefinitionsQuery(filters);
        const rows = this.db.prepare(query.sql).all(...query.params) as Record<string, unknown>[];

        return rows.map(mapTagDefinitionRow);
    }

    listTagAliases(tagDefinitionId: string): TagAliasRecord[] {
        return listTagAliasesQuery(this.db, tagDefinitionId);
    }

    getTagAlias(tagAliasId: string): TagAliasRecord | null {
        return getTagAliasQuery(this.db, tagAliasId);
    }

    deleteTagAlias(tagAliasId: string) {
        deleteTagAliasQuery(this.db, tagAliasId);
    }

    renameTagDefinition(params: RenameTagDefinitionParams) {
        const definition = this.ensureTagExists(params.tagDefinitionId);
        const nextLabel = normalizeLabel(params.canonicalLabel);
        const owner = this.findLabelOwner({
            label: nextLabel,
            excludedTagDefinitionId: params.tagDefinitionId,
        });
        if (owner) {
            throw new Error(`Tag label ${nextLabel} already belongs to another tag`);
        }

        this.db.prepare(`
            UPDATE tag_definitions
            SET
                canonical_label = @canonical_label,
                description = COALESCE(@description, description),
                category = COALESCE(@category, category),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @tag_definition_id
        `).run({
            tag_definition_id: params.tagDefinitionId,
            canonical_label: nextLabel,
            description: params.description ?? null,
            category: params.category ?? null,
        });

        if (definition.canonicalLabel.localeCompare(nextLabel, undefined, { sensitivity: 'base' }) !== 0) {
            this.ensureAlias({
                tagDefinitionId: params.tagDefinitionId,
                aliasLabel: definition.canonicalLabel,
            });
        }
    }

    mergeTagDefinitions(params: MergeTagDefinitionsParams) {
        if (params.sourceTagDefinitionId === params.targetTagDefinitionId) {
            throw new Error('Source and target tags must be different');
        }

        const sourceDefinition = this.ensureTagExists(params.sourceTagDefinitionId);
        const targetDefinition = this.ensureTagExists(params.targetTagDefinitionId);
        const aliasLabels = [
            sourceDefinition.canonicalLabel,
            ...this.listTagAliases(params.sourceTagDefinitionId).map((alias) => alias.aliasLabel),
        ];

        this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO asset_tag_assignments (
                    asset_id,
                    tag_definition_id,
                    source_kind,
                    source_record_id,
                    confidence
                )
                SELECT
                    asset_id,
                    @target_tag_definition_id,
                    source_kind,
                    source_record_id,
                    confidence
                FROM asset_tag_assignments
                WHERE tag_definition_id = @source_tag_definition_id
                ON CONFLICT(asset_id, tag_definition_id, source_kind) DO UPDATE SET
                    source_record_id = excluded.source_record_id,
                    confidence = excluded.confidence,
                    updated_at = CURRENT_TIMESTAMP
            `).run({
                source_tag_definition_id: params.sourceTagDefinitionId,
                target_tag_definition_id: params.targetTagDefinitionId,
            });

            this.db.prepare(`
                DELETE FROM tag_definitions
                WHERE id = ?
            `).run(params.sourceTagDefinitionId);

            for (const aliasLabel of aliasLabels) {
                if (targetDefinition.canonicalLabel.localeCompare(aliasLabel, undefined, { sensitivity: 'base' }) === 0) {
                    continue;
                }
                this.ensureAlias({
                    tagDefinitionId: params.targetTagDefinitionId,
                    aliasLabel,
                });
            }

            this.db.prepare(`
                UPDATE tag_definitions
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(params.targetTagDefinitionId);
        })();
    }

    assignTagToAsset(params: AssignTagToAssetParams) {
        this.db.prepare(`
            INSERT INTO asset_tag_assignments (
                asset_id, tag_definition_id, source_kind, source_record_id, confidence
            ) VALUES (
                @asset_id, @tag_definition_id, @source_kind, @source_record_id, @confidence
            )
            ON CONFLICT(asset_id, tag_definition_id, source_kind) DO UPDATE SET
                source_record_id = excluded.source_record_id,
                confidence = excluded.confidence,
                updated_at = CURRENT_TIMESTAMP
        `).run({
            asset_id: params.assetId,
            tag_definition_id: params.tagDefinitionId,
            source_kind: params.sourceKind,
            source_record_id: params.sourceRecordId ?? null,
            confidence: params.confidence ?? null,
        });
    }

    removeTagAssignment(params: RemoveTagAssignmentParams) {
        if (params.sourceKind) {
            this.db.prepare(`
                DELETE FROM asset_tag_assignments
                WHERE asset_id = ? AND tag_definition_id = ? AND source_kind = ?
            `).run(params.assetId, params.tagDefinitionId, params.sourceKind);
            return;
        }

        this.db.prepare(`
            DELETE FROM asset_tag_assignments
            WHERE asset_id = ? AND tag_definition_id = ?
        `).run(params.assetId, params.tagDefinitionId);
    }

    listTagsForAsset(assetId: string): TagAssignmentRecord[] {
        return this.db.prepare(`
            SELECT
                td.id AS tagDefinitionId,
                td.canonical_label AS canonicalLabel,
                td.description AS description,
                td.status AS status,
                td.category AS category,
                ata.source_kind AS sourceKind,
                ata.source_record_id AS sourceRecordId,
                ata.confidence AS confidence,
                ata.created_at AS createdAt,
                ata.updated_at AS updatedAt
            FROM asset_tag_assignments ata
            JOIN tag_definitions td ON td.id = ata.tag_definition_id
            WHERE ata.asset_id = ?
            ORDER BY td.canonical_label COLLATE NOCASE ASC, ata.created_at ASC
        `).all(assetId) as TagAssignmentRecord[];
    }

    listAssetsForTag(tagDefinitionId: string): TaggedAssetRecord[] {
        return this.db.prepare(`
            SELECT
                asset_id AS assetId,
                source_kind AS sourceKind,
                source_record_id AS sourceRecordId,
                confidence AS confidence,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM asset_tag_assignments
            WHERE tag_definition_id = ?
            ORDER BY created_at ASC, asset_id ASC
        `).all(tagDefinitionId) as TaggedAssetRecord[];
    }

    createReviewItem(params: CreateReviewItemParams) {
        const id = createId(params.id);
        this.db.prepare(`
            INSERT INTO review_items (
                id,
                review_item_type,
                subject_type,
                subject_id,
                payload_json,
                status,
                reviewer_id,
                review_note,
                reviewed_at
            ) VALUES (
                @id,
                @review_item_type,
                @subject_type,
                @subject_id,
                @payload_json,
                @status,
                @reviewer_id,
                @review_note,
                @reviewed_at
            )
        `).run({
            id,
            review_item_type: params.reviewItemType,
            subject_type: params.subjectType,
            subject_id: params.subjectId,
            payload_json: params.payloadJson,
            status: params.status ?? 'pending',
            reviewer_id: params.reviewerId ?? null,
            review_note: params.reviewNote ?? null,
            reviewed_at: params.reviewedAt ?? null,
        });

        return id;
    }

    getReviewItem(reviewItemId: string): ReviewItemRecord | null {
        const row = this.db.prepare(`
            SELECT
                id,
                review_item_type AS reviewItemType,
                subject_type AS subjectType,
                subject_id AS subjectId,
                payload_json AS payloadJson,
                status,
                reviewer_id AS reviewerId,
                review_note AS reviewNote,
                reviewed_at AS reviewedAt,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM review_items
            WHERE id = ?
            LIMIT 1
        `).get(reviewItemId) as ReviewItemRecord | undefined;

        return row ?? null;
    }

    updateReviewItem(params: {
        reviewItemId: string;
        status: ReviewItemStatus;
        reviewerId?: string | null;
        reviewNote?: string | null;
        reviewedAt?: string | null;
    }) {
        this.db.prepare(`
            UPDATE review_items
            SET
                status = @status,
                reviewer_id = @reviewer_id,
                review_note = @review_note,
                reviewed_at = @reviewed_at,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @review_item_id
        `).run({
            review_item_id: params.reviewItemId,
            status: params.status,
            reviewer_id: params.reviewerId ?? null,
            review_note: params.reviewNote ?? null,
            reviewed_at: params.reviewedAt ?? new Date().toISOString(),
        });
    }

    listReviewItems(filters: {
        status?: ReviewItemStatus;
        reviewItemType?: ReviewItemType;
        subjectType?: string;
        subjectId?: string;
    } = {}): ReviewItemRecord[] {
        const { whereClause, params } = buildReviewItemWhereClause(filters);
        return this.db.prepare(`
            SELECT
                id,
                review_item_type AS reviewItemType,
                subject_type AS subjectType,
                subject_id AS subjectId,
                payload_json AS payloadJson,
                status,
                reviewer_id AS reviewerId,
                review_note AS reviewNote,
                reviewed_at AS reviewedAt,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM review_items
            ${whereClause}
            ORDER BY created_at ASC, id ASC
        `).all(...params) as ReviewItemRecord[];
    }
}

export function createTagRepository(options: { dbManager: DatabaseManager }) {
    return new TagRepository(options.dbManager);
}
