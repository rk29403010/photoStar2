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
    return 'AND a.id IN (SELECT asset_id FROM album_items WHERE album_id = ?)';
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

function buildPersonFilterSubquery(filter: AssetQueryFilter, params: (string | number)[]) {
    const personIds = filter.personIds || [];
    if (personIds.length === 0) {return null;}

    const placeholders = personIds.map(() => '?').join(',');
    if (filter.type === 'person_any') {
        params.push(...personIds);
        return `AND a.id IN (SELECT asset_id FROM face_assignments WHERE person_id IN (${placeholders}))`;
    }
    if (filter.type === 'person_all') {
        params.push(...personIds);
        return `AND a.id IN (
            SELECT asset_id FROM face_assignments
            WHERE person_id IN (${placeholders})
            GROUP BY asset_id
            HAVING COUNT(DISTINCT person_id) = ${personIds.length}
        )`;
    }
    if (filter.type === 'person_only') {
        params.push(...personIds, ...personIds);
        return `AND a.id IN (
            SELECT asset_id FROM face_assignments
            GROUP BY asset_id
            HAVING COUNT(DISTINCT CASE WHEN person_id IN (${placeholders}) THEN person_id END) = ${personIds.length}
            AND COUNT(DISTINCT CASE WHEN person_id NOT IN (${placeholders}) THEN person_id END) = 0
        )`;
    }

    return null;
}

export function buildFilterSubquery(
    filter: AssetQueryFilter | undefined,
    params: (string | number)[],
) {
    if (!filter) {return '';}

    return buildAlbumFilterSubquery(filter, params)
        ?? buildTagFilterSubquery(filter, params)
        ?? buildPersonFilterSubquery(filter, params)
        ?? '';
}
