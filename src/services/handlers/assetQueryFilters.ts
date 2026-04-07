function buildTagFilterSubquery(tag: string, params: (string | number)[]) {
    params.push(tag, tag);
    return `AND (
        EXISTS (
            SELECT 1
            FROM photo_metadata_projection pmp
            JOIN json_each(COALESCE(pmp.keywords_json, '[]')) keyword
            WHERE pmp.asset_id = a.id
              AND LOWER(TRIM(CAST(keyword.value AS TEXT))) = LOWER(TRIM(?))
        )
        OR EXISTS (
            SELECT 1
            FROM derived_results dr
            JOIN json_each(COALESCE(json_extract(dr.data, '$.tags'), '[]')) ai_tag
            WHERE dr.id = (
                SELECT latest.id
                FROM derived_results latest
                WHERE latest.asset_id = a.id
                  AND latest.task = 'ai_metadata'
                ORDER BY datetime(latest.created_at) DESC, latest.created_at DESC, latest.id DESC
                LIMIT 1
            )
              AND LOWER(TRIM(CAST(ai_tag.value AS TEXT))) = LOWER(TRIM(?))
        )
    )`;
}

function buildPersonFilterSubquery(
    filter: { personIds?: string[]; type?: string },
    params: (string | number)[],
) {
    const personIds = filter.personIds || [];
    if (personIds.length === 0) {return '';}

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

    return '';
}

export function buildFilterSubquery(
    filter: { personIds?: string[]; type?: string; albumId?: string; tag?: string } | undefined,
    params: (string | number)[],
) {
    if (!filter) {return '';}

    if (filter.type === 'album' && filter.albumId) {
        params.push(filter.albumId);
        return 'AND a.id IN (SELECT asset_id FROM album_items WHERE album_id = ?)';
    }

    if (filter.type === 'tag' && filter.tag) {
        return buildTagFilterSubquery(filter.tag, params);
    }

    return buildPersonFilterSubquery(filter, params);
}
