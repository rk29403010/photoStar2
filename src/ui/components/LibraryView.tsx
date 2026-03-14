import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import type { Asset } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import { LayoutEngine } from './layout/LayoutEngine';
import { sortAssetsForGallery, type LibrarySortMode } from '@shared/utils/libraryGallery';

interface LibraryViewProps {
    assets: Asset[];
    loading: boolean;
    active: boolean;
    backendReady: boolean;
    backendStatus: string;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    librarySelection?: Set<string>;
    onLibrarySelectionChange?: (selection: Set<string>) => void;
    declusteredAssets?: Set<string>;
    showRejected?: boolean;
    rejectedAssets?: Asset[];
    onHoverAssetChange?: (asset: Asset | null) => void;
}

function LoadingState({ backendStatus, backendReady }: { backendStatus: string; backendReady: boolean }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 16 }}>
            <div className="animate-pulse" style={{ fontSize: '2rem' }}>⌛</div>
            <div style={{ textAlign: 'center' }}>
                <div>{backendStatus.includes('Error') ? backendStatus : 'Initialising photo library...'}</div>
                {!backendReady && !backendStatus.includes('Error') && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>Establishing connection to backend service...</div>}
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 16 }}>
            <div style={{ fontSize: '3rem', opacity: 0.3 }}>📂</div>
            <div style={{ fontWeight: 500 }}>No photos found in library.</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Click &quot;Actions &gt; Scan Folder&quot; to import photos.</div>
        </div>
    );
}

function RejectedSection({
    showRejected,
    rejectedAssets,
    onAssetClick,
    selectedAssetId,
}: {
    showRejected?: boolean;
    rejectedAssets?: Asset[];
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
}) {
    if (!showRejected || !rejectedAssets || rejectedAssets.length === 0) {return null;}

    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderTop: '1px solid #1f1f1f',
                color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase'
            }}>
                <span style={{ color: '#ef4444', opacity: 0.7 }}>🚫</span>
                <span>Rejected - {rejectedAssets.length} photo{rejectedAssets.length !== 1 ? 's' : ''} removed from this person</span>
                <div style={{ flex: 1, height: 1, background: '#1f1f1f' }} />
            </div>
            <div style={{ opacity: 0.45, filter: 'grayscale(40%)' }}>
                <LayoutEngine
                    assets={rejectedAssets}
                    debug={false}
                    onAssetClick={onAssetClick}
                    selectedAssetId={selectedAssetId}
                    activeFilter={undefined}
                    showFaces={false}
                    onUntagAsset={undefined}
                    librarySelection={undefined}
                    onLibrarySelectionChange={undefined}
                    declusteredAssets={undefined}
                />
            </div>
        </div>
    );
}

function shouldLoadMore(element: HTMLDivElement) {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining < 720;
}

function canRequestMoreAssets(params: {
    active: boolean;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    return Boolean(
        params.active
        && params.hasMoreAssets
        && !params.isLoadingMoreAssets
        && params.onLoadMoreAssets
    );
}

function shouldAutoRequestMoreAssets(params: {
    active: boolean;
    container: HTMLDivElement | null;
    displayAssetCount: number;
}) {
    return Boolean(
        params.active
        && params.container
        && params.displayAssetCount > 0
        && shouldLoadMore(params.container)
    );
}

function getRejectedAssetCount(showRejected?: boolean, rejectedAssets?: Asset[]) {
    return showRejected && rejectedAssets ? rejectedAssets.length : 0;
}

function shouldShowLoadingState(params: { loading: boolean; backendReady: boolean; assetCount: number }) {
    const { loading, backendReady, assetCount } = params;
    return assetCount === 0 && (loading || !backendReady);
}

function shouldShowEmptyState(assetCount: number, rejectedAssetCount: number) {
    return assetCount === 0 && rejectedAssetCount === 0;
}

function useDisplayAssets(assets: Asset[], declusteredAssets: Set<string> | undefined, sortMode: LibrarySortMode) {
    return useMemo(() => {
        if (!declusteredAssets || declusteredAssets.size === 0) {
            return sortAssetsForGallery(assets, sortMode);
        }

        const normalAssets = assets.filter((asset) => !declusteredAssets.has(asset.id));
        const trailingAssets = assets.filter((asset) => declusteredAssets.has(asset.id));
        return [
            ...sortAssetsForGallery(normalAssets, sortMode),
            ...sortAssetsForGallery(trailingAssets, sortMode),
        ];
    }, [assets, declusteredAssets, sortMode]);
}

function useLibraryPaging(params: {
    active: boolean;
    displayAssetCount: number;
    hasMoreAssets?: boolean;
    isLoadingMoreAssets?: boolean;
    onLoadMoreAssets?: () => Promise<void>;
}) {
    const { active, displayAssetCount, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets } = params;
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const requestMoreAssets = useCallback(() => {
        if (!canRequestMoreAssets({ active, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets })) {return;}
        void onLoadMoreAssets?.();
    }, [active, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        if (shouldLoadMore(event.currentTarget)) {
            requestMoreAssets();
        }
    }, [requestMoreAssets]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!shouldAutoRequestMoreAssets({ active, container, displayAssetCount })) {return;}
        requestMoreAssets();
    }, [active, displayAssetCount, requestMoreAssets]);

    return { scrollRef, handleScroll };
}

function LibraryToolbar({
    sortMode,
    onSortModeChange,
}: {
    sortMode: LibrarySortMode;
    onSortModeChange: (mode: LibrarySortMode) => void;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'linear-gradient(180deg, rgba(18,18,18,0.92), rgba(10,10,10,0.92))' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <span>Sort</span>
                <select
                    aria-label="Sort gallery"
                    value={sortMode}
                    onChange={(event) => onSortModeChange(event.target.value as LibrarySortMode)}
                    style={{ background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 999, padding: '6px 10px', fontSize: '0.78rem', outline: 'none' }}
                >
                    <option value="date">Date</option>
                    <option value="filename">Filename</option>
                </select>
            </label>
        </div>
    );
}

export function LibraryView({
    assets,
    loading,
    active,
    backendReady,
    backendStatus,
    hasMoreAssets,
    isLoadingMoreAssets,
    onLoadMoreAssets,
    onAssetClick,
    selectedAssetId,
    activeFilter,
    showFaces,
    onUntagAsset,
    librarySelection,
    onLibrarySelectionChange,
    declusteredAssets,
    showRejected,
    rejectedAssets,
    onHoverAssetChange,
}: LibraryViewProps) {
    const [sortMode, setSortMode] = useState<LibrarySortMode>('date');
    const displayAssets = useDisplayAssets(assets, declusteredAssets, sortMode);
    const rejectedAssetCount = getRejectedAssetCount(showRejected, rejectedAssets);
    const { scrollRef, handleScroll } = useLibraryPaging({
        active,
        displayAssetCount: displayAssets.length,
        hasMoreAssets,
        isLoadingMoreAssets,
        onLoadMoreAssets,
    });

    if (shouldShowLoadingState({ loading, backendReady, assetCount: assets.length })) {
        return <LoadingState backendStatus={backendStatus} backendReady={backendReady} />;
    }
    if (shouldShowEmptyState(assets.length, rejectedAssetCount)) {
        return <EmptyState />;
    }

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#0a0a0a' }}
        >
            <LibraryToolbar sortMode={sortMode} onSortModeChange={setSortMode} />
            <LayoutEngine
                assets={displayAssets}
                debug={false}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
                activeFilter={activeFilter}
                showFaces={showFaces}
                onUntagAsset={onUntagAsset}
                librarySelection={librarySelection}
                onLibrarySelectionChange={onLibrarySelectionChange}
                declusteredAssets={declusteredAssets}
                onHoverAssetChange={onHoverAssetChange}
            />
            <RejectedSection
                showRejected={showRejected}
                rejectedAssets={rejectedAssets}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
            />
        </div>
    );
}
