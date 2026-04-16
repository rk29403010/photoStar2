export type LibraryViewState = 'loading' | 'empty' | 'content';

export function getLibraryViewState(params: {
    assetCount: number;
    rejectedAssetCount: number;
    loading: boolean;
    backendReady: boolean;
    isRefreshingLibrary: boolean;
}): LibraryViewState {
    const { assetCount, rejectedAssetCount, loading, backendReady, isRefreshingLibrary } = params;

    if (assetCount > 0 || rejectedAssetCount > 0) {
        return 'content';
    }

    if (loading || !backendReady || isRefreshingLibrary) {
        return 'loading';
    }

    return 'empty';
}
