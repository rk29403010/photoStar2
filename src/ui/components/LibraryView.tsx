import { useCallback, useEffect, useMemo, useRef, type UIEvent } from 'react';
import type { Asset } from '@contracts/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import { LayoutEngine } from './layout/LayoutEngine';

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
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    librarySelection?: Set<string>;
    onLibrarySelectionChange?: (selection: Set<string>) => void;
    declusteredAssets?: Set<string>;
    showRejected?: boolean;
    rejectedAssets?: Asset[];
}

function LoadingState({ backendStatus, backendReady }: { backendStatus: string; backendReady: boolean }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 16 }}>
            <div className="animate-pulse" style={{ fontSize: '2rem' }}>⌛</div>
            <div style={{ textAlign: 'center' }}>
                <div>{backendStatus.includes('Error') ? backendStatus : 'Initialising photo library...'}</div>
                {!backendReady && !backendStatus.includes('Error') && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>Establishing connection to sidecar...</div>}
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
                    onSetSensitivity={undefined}
                    librarySelection={undefined}
                    onLibrarySelectionChange={undefined}
                    declusteredAssets={undefined}
                />
            </div>
        </div>
    );
}

function LoadMoreState({ hasMoreAssets, isLoadingMoreAssets }: { hasMoreAssets?: boolean; isLoadingMoreAssets?: boolean }) {
    if (isLoadingMoreAssets) {
        return <div style={{ padding: '18px 24px 28px', color: '#64748b', textAlign: 'center', fontSize: '0.85rem' }}>Loading more photos...</div>;
    }
    if (hasMoreAssets === false) {
        return <div style={{ padding: '18px 24px 28px', color: '#475569', textAlign: 'center', fontSize: '0.8rem' }}>End of loaded library results.</div>;
    }
    return null;
}

function shouldLoadMore(element: HTMLDivElement) {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining < 720;
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

function useDisplayAssets(assets: Asset[], declusteredAssets?: Set<string>) {
    return useMemo(() => {
        if (!declusteredAssets || declusteredAssets.size === 0) {return assets;}

        const normalAssets = assets.filter((asset) => !declusteredAssets.has(asset.id));
        const trailingAssets = assets.filter((asset) => declusteredAssets.has(asset.id));
        return [...normalAssets, ...trailingAssets];
    }, [assets, declusteredAssets]);
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
        if (!active || !hasMoreAssets || isLoadingMoreAssets || !onLoadMoreAssets) {return;}
        void onLoadMoreAssets();
    }, [active, hasMoreAssets, isLoadingMoreAssets, onLoadMoreAssets]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        if (shouldLoadMore(event.currentTarget)) {
            requestMoreAssets();
        }
    }, [requestMoreAssets]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!active || !container || displayAssetCount === 0) {return;}
        if (shouldLoadMore(container)) {
            requestMoreAssets();
        }
    }, [active, displayAssetCount, requestMoreAssets]);

    return { scrollRef, handleScroll };
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
    onSetSensitivity,
    librarySelection,
    onLibrarySelectionChange,
    declusteredAssets,
    showRejected,
    rejectedAssets,
}: LibraryViewProps) {
    const displayAssets = useDisplayAssets(assets, declusteredAssets);
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
            <LayoutEngine
                assets={displayAssets}
                debug={false}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
                activeFilter={activeFilter}
                showFaces={showFaces}
                onUntagAsset={onUntagAsset}
                onSetSensitivity={onSetSensitivity}
                librarySelection={librarySelection}
                onLibrarySelectionChange={onLibrarySelectionChange}
                declusteredAssets={declusteredAssets}
            />
            <LoadMoreState hasMoreAssets={hasMoreAssets} isLoadingMoreAssets={isLoadingMoreAssets} />
            <RejectedSection
                showRejected={showRejected}
                rejectedAssets={rejectedAssets}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
            />
        </div>
    );
}
