export function buildFilterSubquery(
    filter: { personIds?: string[]; type?: string; albumId?: string } | undefined,
    params: (string | number)[],
) {
    if (!filter) {return '';}

    if (filter.type === 'album' && filter.albumId) {
        params.push(filter.albumId);
        return 'AND a.id IN (SELECT asset_id FROM album_items WHERE album_id = ?)';
    }

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
