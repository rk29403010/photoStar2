export type AssetGalleryOrder = 'default' | 'oldest_first' | 'previewed_first';

export function getGalleryOrder(payload: { galleryOrder?: AssetGalleryOrder } | undefined): AssetGalleryOrder {
    if (payload?.galleryOrder === 'previewed_first') {
        return 'previewed_first';
    }
    if (payload?.galleryOrder === 'oldest_first') {
        return 'oldest_first';
    }
    return 'default';
}

export function buildOrderClause(params: { galleryOrder: AssetGalleryOrder; defaultDirection: 'ASC' | 'DESC' }) {
    const { galleryOrder, defaultDirection } = params;
    const chronologicalDirection = galleryOrder === 'oldest_first' ? 'ASC' : defaultDirection;
    const photoDateOrder = `CASE WHEN a.photo_created_at IS NULL THEN 1 ELSE 0 END ASC, a.photo_created_at ${chronologicalDirection}, a.created_at ${chronologicalDirection}`;
    if (galleryOrder === 'previewed_first') {
        return `CASE WHEN p.path IS NULL THEN 1 ELSE 0 END ASC, ${photoDateOrder}`;
    }

    return photoDateOrder;
}
