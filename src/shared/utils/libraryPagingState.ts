export function isAssetPageResponseId(id: string | undefined) {
    return typeof id === 'string' && id.startsWith('get_assets_page_');
}

export function isPreservedPagingAssetRefreshId(id: string | undefined) {
    return typeof id === 'string' && id.startsWith('get_assets-preserve_');
}

export function isAssetResponseId(id: string | undefined) {
    return typeof id === 'string' && (
        id === 'assets-init'
        || id.startsWith('get_assets-')
        || isAssetPageResponseId(id)
    );
}

export function shouldUpdatePagingStateFromAssetResponse(id: string | undefined) {
    return isAssetResponseId(id) && !isPreservedPagingAssetRefreshId(id);
}

export function isReplacementAssetRefreshId(id: string | undefined) {
    return isAssetResponseId(id)
        && !isAssetPageResponseId(id)
        && !isPreservedPagingAssetRefreshId(id);
}
