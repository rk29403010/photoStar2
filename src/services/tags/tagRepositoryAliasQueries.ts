import type { DatabaseManager } from '../../data/db';
import type { TagAliasRecord } from './tagRepositoryModels';
import { mapTagAliasRow } from './tagRepositoryHelpers';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type LabelOwnerMatch = {
    tagDefinitionId: string;
    aliasId: string | null;
    matchKind: 'canonical' | 'alias';
};

export function findLabelOwner(
    db: DbHandle,
    params: { label: string; excludedTagDefinitionId?: string },
): LabelOwnerMatch | null {
    const row = db.prepare(`
        SELECT
            td.id AS tagDefinitionId,
            CAST(NULL AS TEXT) AS aliasId,
            'canonical' AS matchKind
        FROM tag_definitions td
        WHERE lower(td.canonical_label) = lower(@label)
          AND (@excluded_tag_definition_id IS NULL OR td.id != @excluded_tag_definition_id)
        UNION ALL
        SELECT
            ta.tag_definition_id AS tagDefinitionId,
            ta.id AS aliasId,
            'alias' AS matchKind
        FROM tag_aliases ta
        WHERE lower(ta.alias_label) = lower(@label)
          AND (@excluded_tag_definition_id IS NULL OR ta.tag_definition_id != @excluded_tag_definition_id)
        LIMIT 1
    `).get({
        label: params.label,
        excluded_tag_definition_id: params.excludedTagDefinitionId ?? null,
    });

    if (!row || typeof row !== 'object') {
        return null;
    }
    const record = row as Record<string, unknown>;

    return {
        tagDefinitionId: String(record.tagDefinitionId),
        aliasId: typeof record.aliasId === 'string' ? record.aliasId : null,
        matchKind: record.matchKind === 'alias' ? 'alias' : 'canonical',
    };
}

export function findExistingAliasId(
    db: DbHandle,
    tagDefinitionId: string,
    aliasLabel: string,
) {
    const row = db.prepare(`
        SELECT
            id,
            tag_definition_id AS tagDefinitionId,
            alias_label AS aliasLabel,
            created_at AS createdAt
        FROM tag_aliases
        WHERE tag_definition_id = ? AND lower(alias_label) = lower(?)
        LIMIT 1
    `).get(tagDefinitionId, aliasLabel);

    return row && typeof row === 'object' ? mapTagAliasRow(row as Record<string, unknown>).id : null;
}

export function listTagAliases(db: DbHandle, tagDefinitionId: string): TagAliasRecord[] {
    return db.prepare(`
        SELECT
            id,
            tag_definition_id AS tagDefinitionId,
            alias_label AS aliasLabel,
            created_at AS createdAt
        FROM tag_aliases
        WHERE tag_definition_id = ?
        ORDER BY alias_label COLLATE NOCASE ASC, id ASC
    `).all(tagDefinitionId).map((row) => mapTagAliasRow(row as Record<string, unknown>));
}

export function getTagAlias(db: DbHandle, tagAliasId: string): TagAliasRecord | null {
    const row = db.prepare(`
        SELECT
            id,
            tag_definition_id AS tagDefinitionId,
            alias_label AS aliasLabel,
            created_at AS createdAt
        FROM tag_aliases
        WHERE id = ?
        LIMIT 1
    `).get(tagAliasId);

    return row && typeof row === 'object' ? mapTagAliasRow(row as Record<string, unknown>) : null;
}

export function deleteTagAlias(db: DbHandle, tagAliasId: string) {
    db.prepare(`
        DELETE FROM tag_aliases
        WHERE id = ?
    `).run(tagAliasId);
}
