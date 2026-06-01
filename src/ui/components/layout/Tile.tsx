import { useCallback, useState } from 'react';
import type { Asset, TileIntent } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { TileOverlays, type SensitivityBadge } from './TileOverlays';

type TileProps = {
    asset: Asset;
    intent?: TileIntent;
    debug?: boolean;
    selected?: boolean;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onHoverAssetChange?: (asset: Asset | null) => void;
    imageLoading?: 'eager' | 'lazy';
    imageFetchPriority?: 'high' | 'auto';
    isGroupRepresentative?: boolean;
    showGroupIds?: boolean;
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    isScrollSettled?: boolean;
}

type TileMediaProps = {
    imgSrc: string | null;
    loadingMode: 'eager' | 'lazy';
    fetchPriority: 'high' | 'auto';
    onImageVisibleChange: (visible: boolean) => void;
}

const TILE_FADE_IN_KEYFRAMES = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
const DEFAULT_TILE_PROPS = {
    intent: 'normal' as TileIntent,
    debug: false,
    selected: false,
    showFaces: false,
    imageLoading: 'lazy' as const,
    imageFetchPriority: 'auto' as const,
    isGroupRepresentative: false,
    showGroupIds: false,
    isScrollSettled: true,
};

function getSensitivityDisplay(asset: Asset): SensitivityBadge | null {
    const manualStatus = asset.sensitivity_status;
    if (manualStatus === 'unsafe') {return { label: '🔞 Unsafe', tone: 'error' };}
    if (manualStatus === 'review') {return { label: '⚠ Review', tone: 'warning' };}
    if (manualStatus === 'safe') {return null;}

    const score = asset.sensitivity_score;
    if (score == null) {return null;}
    if (score >= 75) {return { label: `🔞 ${score}%`, tone: 'error' };}
    if (score >= 25) {return { label: `⚠ ${score}%`, tone: 'warning' };}
    return null;
}

function getBorderClass(selected: boolean): string {
    return selected ? 'border-2 border-brand-accent' : 'border-2 border-transparent';
}

function useTileHoverState(asset: Asset, onHoverAssetChange?: (asset: Asset | null) => void) {
    const [isHovered, setIsHovered] = useState(false);
    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
        onHoverAssetChange?.(asset);
    }, [asset, onHoverAssetChange]);
    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        onHoverAssetChange?.(null);
    }, [onHoverAssetChange]);

    return { isHovered, handleMouseEnter, handleMouseLeave };
}

function getTileProps(props: TileProps) {
    return {
        ...DEFAULT_TILE_PROPS,
        ...props,
        hoveredGroupId: props.hoveredGroupId ?? null,
    };
}

const LoadedTileImage: React.FC<{
    imgSrc: string;
    loadingMode: 'eager' | 'lazy';
    fetchPriority: 'high' | 'auto';
    onImageVisibleChange: (visible: boolean) => void;
}> = ({ imgSrc, loadingMode, fetchPriority, onImageVisibleChange }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const markLoaded = useCallback(() => {
        setIsLoaded(true);
        onImageVisibleChange(true);
    }, [onImageVisibleChange]);
    const handleImageRef = useCallback((image: HTMLImageElement | null) => {
        if (image && image.complete && image.naturalWidth > 0) {
            markLoaded();
        }
    }, [markLoaded]);

    return (
        <div className="w-full h-full relative bg-surface-secondary">
            {!isLoaded && (
                <div className="absolute inset-0 bg-gradient-to-br from-surface-secondary to-surface/85" />
            )}
            <img
                ref={handleImageRef}
                src={imgSrc}
                loading={loadingMode}
                fetchPriority={fetchPriority}
                decoding="async"
                onLoad={markLoaded}
                onError={() => {
                    setIsLoaded(true);
                    onImageVisibleChange(false);
                }}
                className="w-full h-full object-contain block transition-opacity duration-200 ease-out"
                style={{ opacity: isLoaded ? 1 : 0 }}
            />
        </div>
    );
};

const TileMedia: React.FC<TileMediaProps> = ({ imgSrc, loadingMode, fetchPriority, onImageVisibleChange }) => {
    if (!imgSrc) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-content-secondary text-xs">
                <span>🖼️</span>
                <span className="text-[10px] mt-1">Processing...</span>
            </div>
        );
    }

    return <LoadedTileImage key={imgSrc} imgSrc={imgSrc} loadingMode={loadingMode} fetchPriority={fetchPriority} onImageVisibleChange={onImageVisibleChange} />;
};

export const Tile: React.FC<TileProps> = (props) => {
    const {
        asset,
        intent,
        debug,
        selected,
        activeFilter,
        showFaces,
        onUntagAsset,
        onHoverAssetChange,
        imageLoading,
        imageFetchPriority,
        isGroupRepresentative,
        showGroupIds,
        hoveredGroupId,
        onHoveredGroupIdChange,
        isScrollSettled,
    } = getTileProps(props);
    const imgSrc = asset.preview_data_url ?? resolveImageUrl(asset.preview_path);
    const sensitivityBadge = getSensitivityDisplay(asset);
    const { isHovered, handleMouseEnter, handleMouseLeave } = useTileHoverState(asset, onHoverAssetChange);
    const [visibleImageSrc, setVisibleImageSrc] = useState<string | null>(null);
    const isImageVisible = visibleImageSrc === imgSrc;

    return (
        <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`w-full h-full bg-surface-secondary overflow-hidden relative rounded-[4px] box-border cursor-pointer transition-all duration-200 ease-out ${getBorderClass(selected)}`}
        >
            <TileMedia imgSrc={imgSrc} loadingMode={imageLoading} fetchPriority={imageFetchPriority} onImageVisibleChange={(visible) => setVisibleImageSrc(visible ? imgSrc : null)} />
            <TileOverlays
                selected={selected}
                sensitivityBadge={sensitivityBadge}
                stackCount={asset.stack_count}
                isGroupRepresentative={isGroupRepresentative}
                groupMemberships={asset.group_memberships}
                showGroupIds={showGroupIds}
                hoveredGroupId={hoveredGroupId}
                onHoveredGroupIdChange={onHoveredGroupIdChange}
                isHovered={isHovered}
                caption={asset.caption}
                activeFilter={activeFilter}
                assetId={asset.id}
                onUntagAsset={onUntagAsset}
                asset={asset}
                showFaces={showFaces}
                debug={debug}
                intent={intent}
                isImageVisible={isImageVisible}
                isScrollSettled={isScrollSettled}
            />
            <style>{TILE_FADE_IN_KEYFRAMES}</style>
        </div>
    );
};
