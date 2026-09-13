import { isBinAlbumId } from './binAlbum';

type AssetQueryFilter = {
    personIds?: string[];
    type?: string;
    albumId?: string;
    value?: string;
};

function buildAlbumFilterSubquery(filter: AssetQueryFilter, params: (string | number)[]) {
    if (filter.type !== 'album' || !filter.albumId) {
        return null;
    }

    params.push(filter.albumId);
    if (isBinAlbumId(filter.albumId)) {
        return 'AND a.binned_at IS NOT NULL AND a.id IN (SELECT asset_id FROM album_items WHERE album_id = ?)';
    }

    return 'AND a.binned_at IS NULL AND a.id IN (SELECT asset_id FROM album_items WHERE album_id = ?)';
}

function buildTagFilterSubquery(filter: AssetQueryFilter, params: (string | number)[]) {
    if (filter.type !== 'tag' || !filter.value) {
        return null;
    }

    params.push(filter.value.trim());
    return `
        AND EXISTS (
            SELECT 1
            FROM asset_tag_assignments ata
            JOIN tag_definitions td ON td.id = ata.tag_definition_id
            WHERE ata.asset_id = a.id
              AND td.status = 'active'
              AND lower(td.canonical_label) = lower(?)
        )
    `;
}

function buildResolvedPersonIdsSubquery(personIds: string[], params: (string | number)[]): string {
    const values = personIds.map(() => '(?)').join(',');
    params.push(...personIds);
    return `
        WITH RECURSIVE requested_person(id) AS (VALUES ${values}),
        resolved_person(id) AS (
            SELECT id FROM requested_person
            UNION
            SELECT redirects.current_person_id
            FROM person_redirects redirects
            JOIN resolved_person resolved ON redirects.old_person_id = resolved.id
        )
        SELECT id FROM resolved_person
    `;
}

function buildPersonFilterSubquery(filter: AssetQueryFilter, params: (string | number)[]) {
    const personIds = filter.personIds || [];
    if (personIds.length === 0) {return null;}

    if (filter.type === 'person_any') {
        const resolvedIds = buildResolvedPersonIdsSubquery(personIds, params);
        return `AND a.id IN (SELECT asset_id FROM face_assignments WHERE person_id IN (${resolvedIds}))`;
    }
    if (filter.type === 'person_all') {
        const resolvedIds = buildResolvedPersonIdsSubquery(personIds, params);
        return `AND a.id IN (
            SELECT asset_id FROM face_assignments
            WHERE person_id IN (${resolvedIds})
            GROUP BY asset_id
            HAVING COUNT(DISTINCT person_id) = ${personIds.length}
        )`;
    }
    if (filter.type === 'person_only') {
        const includedIds = buildResolvedPersonIdsSubquery(personIds, params);
        const excludedIds = buildResolvedPersonIdsSubquery(personIds, params);
        return `AND a.id IN (
            SELECT asset_id FROM face_assignments
            GROUP BY asset_id
            HAVING COUNT(DISTINCT CASE WHEN person_id IN (${includedIds}) THEN person_id END) = ${personIds.length}
            AND COUNT(DISTINCT CASE WHEN person_id NOT IN (${excludedIds}) THEN person_id END) = 0
        )`;
    }

    return null;
}

export function buildFilterSubquery(
    filter: AssetQueryFilter | undefined,
    params: (string | number)[],
) {
    if (!filter) {return '';}

    const albumFilterSubquery = buildAlbumFilterSubquery(filter, params);
    if (albumFilterSubquery) {
        return albumFilterSubquery;
    }

    const visibilitySubquery = 'AND a.binned_at IS NULL';
    const filterBody = buildTagFilterSubquery(filter, params)
        ?? buildPersonFilterSubquery(filter, params)
        ?? '';

    return filterBody ? `${visibilitySubquery} ${filterBody}` : visibilitySubquery;
}
