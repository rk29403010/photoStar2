import { randomUUID } from 'node:crypto';
import type { TagDefinitionStatus } from './tagTypes';
import type {
    ReviewItemFilterParams,
    TagAliasRecord,
    TagDefinitionRecord,
} from './tagRepositoryModels';

export function createId(value?: string) {
    return value ?? randomUUID();
}

export function normalizeLabel(label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
        throw new Error('Tag labels must be non-empty');
    }
    return trimmed;
}

export function buildReviewItemWhereClause(filters: ReviewItemFilterParams) {
    const clauses: string[] = [];
    const params: string[] = [];

    if (filters.status) {
        clauses.push('status = ?');
        params.push(filters.status);
    }
    if (filters.reviewItemType) {
        clauses.push('review_item_type = ?');
        params.push(filters.reviewItemType);
    }
    if (filters.subjectType) {
        clauses.push('subject_type = ?');
        params.push(filters.subjectType);
    }
    if (filters.subjectId) {
        clauses.push('subject_id = ?');
        params.push(filters.subjectId);
    }

    return {
        whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
        params,
    };
}

export function mapTagDefinitionRow(row: Record<string, unknown>): TagDefinitionRecord {
    return {
        id: String(row.id),
        canonicalLabel: String(row.canonicalLabel),
        description: typeof row.description === 'string' ? row.description : null,
        status: row.status as TagDefinitionStatus,
        category: typeof row.category === 'string' ? row.category : null,
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
        assignmentCount: typeof row.assignmentCount === 'number' ? row.assignmentCount : undefined,
    };
}

export function mapTagAliasRow(row: Record<string, unknown>): TagAliasRecord {
    return {
        id: String(row.id),
        tagDefinitionId: String(row.tagDefinitionId),
        aliasLabel: String(row.aliasLabel),
        createdAt: String(row.createdAt),
    };
}

export function buildListDefinitionsQuery(filters: {
    status?: TagDefinitionStatus;
    includeAssignmentCounts?: boolean;
}) {
    const whereClause = filters.status ? 'WHERE td.status = ?' : '';
    const countSelect = filters.includeAssignmentCounts === true
        ? 'COUNT(DISTINCT ata.asset_id) AS assignmentCount'
        : '0 AS assignmentCount';

    return {
        sql: `
            SELECT
                td.id,
                td.canonical_label AS canonicalLabel,
                td.description,
                td.status,
                td.category,
                td.created_at AS createdAt,
                td.updated_at AS updatedAt,
                ${countSelect}
            FROM tag_definitions td
            LEFT JOIN asset_tag_assignments ata ON ata.tag_definition_id = td.id
            ${whereClause}
            GROUP BY td.id
            ORDER BY td.canonical_label COLLATE NOCASE ASC
        `,
        params: filters.status ? [filters.status] : [],
    };
}
