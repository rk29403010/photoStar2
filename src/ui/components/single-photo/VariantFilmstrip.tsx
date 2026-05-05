import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Asset, SimilarityOrbit, SimilarityOrbitItem } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import {
    buildVariantMemberActions,
    FILLED_STAR_SYMBOL,
    getVariantStarDisplayState,
    getVariantTileTitle,
    isOrbitItemSelected,
    isVariantStarred,
} from './variantFilmstripModel';

type VariantFilmstripProps = {
    readonly groupId: string;
    readonly selectedAsset: Asset;
    readonly onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onActiveGroupChange?: (groupId: string) => void;
}

function useOrbit(groupId: string, onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>, onOrbitLoaded: (assets: Asset[]) => void) {
    const [orbit, setOrbit] = useState<SimilarityOrbit | null>(null);
    const onGetGroupOrbitRef = useRef(onGetGroupOrbit);
    const onOrbitLoadedRef = useRef(onOrbitLoaded);

    useEffect(() => {
        onGetGroupOrbitRef.current = onGetGroupOrbit;
    }, [onGetGroupOrbit]);

    useEffect(() => {
        onOrbitLoadedRef.current = onOrbitLoaded;
    }, [onOrbitLoaded]);

    useEffect(() => {
        let mounted = true;
        onGetGroupOrbitRef.current(groupId)
            .then((nextOrbit) => {
                if (!mounted) {
                    return;
                }

                setOrbit(nextOrbit);
                onOrbitLoadedRef.current(nextOrbit.items.map((item) => item.asset));
            })
            .catch(console.error)
            .finally(() => {});

        return () => {
            mounted = false;
        };
    }, [groupId]);

    return { orbit, loading: orbit === null };
}

function getVariantTileOpacity(isSelected: boolean): string {
    return isSelected ? '1' : '0.6';
}

function updateTileOpacity(target: HTMLDivElement, isSelected: boolean, opacity: string) {
    if (!isSelected) {
        target.style.opacity = opacity;
    }
}

function getVariantTileStyle(isSelected: boolean) {
    return {
        width: 72,
        height: 78,
        flexShrink: 0,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: isSelected ? '2px solid rgba(255, 248, 220, 0.96)' : '2px solid rgba(255, 255, 255, 0.08)',
        opacity: getVariantTileOpacity(isSelected),
        transition: 'all 0.2s',
        position: 'relative',
        background: '#17110f',
        boxShadow: isSelected ? '0 0 0 1px rgba(0, 0, 0, 0.65)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.38)',
        display: 'flex',
        flexDirection: 'column',
    } as const;
}

function StarIndicator({ isStarred }: { readonly isStarred: boolean }) {
    return (
        <div
            aria-hidden
            style={{
                position: 'absolute',
                top: 4,
                right: 4,
                zIndex: 2,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '999px',
                background: 'rgba(0, 0, 0, 0.82)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.58)',
                color: isStarred ? '#facc15' : '#111111',
                fontSize: 15,
                lineHeight: 1,
            }}
        >
            {FILLED_STAR_SYMBOL}
        </div>
    );
}

function GroupBadge({ item }: { readonly item: SimilarityOrbitItem }) {
    if (item.kind !== 'group') {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            left: 4,
            top: 4,
            zIndex: 2,
            borderRadius: 999,
            background: 'rgba(10, 10, 10, 0.84)',
            color: '#d1d5db',
            fontSize: 10,
            padding: '2px 6px',
            textTransform: 'capitalize',
        }}>
            {item.group_type?.replace('_', ' ') ?? 'group'}
        </div>
    );
}

function TileFooter({ item }: { readonly item: SimilarityOrbitItem }) {
    return (
        <div style={{
            padding: '4px 6px 5px',
            background: 'rgba(11, 8, 7, 0.92)',
            color: '#d6d3d1',
            fontSize: 10,
            lineHeight: 1.1,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 6,
        }}>
            <span>{item.kind === 'group' ? 'Open' : 'Photo'}</span>
            <span>{item.stack_count ?? 1}</span>
        </div>
    );
}

function VariantMemberTile(props: {
    readonly item: SimilarityOrbitItem;
    readonly selectedAsset: Asset;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onOpenGroup: (groupId: string) => void;
}) {
    const { item, selectedAsset, onSelectAsset, onOpenGroup } = props;
    const imgSrc = resolveImageUrl(item.asset.preview_path ?? item.asset.original_path) || '';
    const actions = buildVariantMemberActions({ item, onSelectAsset, onOpenGroup });
    const isSelected = isOrbitItemSelected(item, selectedAsset);
    const isStarred = isVariantStarred(item.asset);
    const starDisplayState = getVariantStarDisplayState({ isStarred, isHovered: false });

    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (item.kind === 'group' && actions.openGroup) {
            actions.openGroup();
            return;
        }

        actions.selectMember();
    };

    return (
        <div
            onClick={handleClick}
            style={getVariantTileStyle(isSelected)}
            onMouseEnter={(event) => updateTileOpacity(event.currentTarget, isSelected, '1')}
            onMouseLeave={(event) => updateTileOpacity(event.currentTarget, isSelected, '0.6')}
            title={getVariantTileTitle(isStarred)}
        >
            <div style={{ position: 'relative', width: '100%', height: 52 }}>
                <img src={imgSrc} alt="Variant preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <GroupBadge item={item} />
                {starDisplayState === 'filled' && <StarIndicator isStarred />}
            </div>
            <TileFooter item={item} />
        </div>
    );
}

function FilmStripSprockets() {
    return (
        <>
            <div style={{ position: 'absolute', top: 8, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {Array.from({ length: 10 }).map((_, index) => (
                    <span key={`top-${index}`} style={{ width: 10, height: 6, borderRadius: 999, background: 'rgba(245, 222, 179, 0.22)' }} />
                ))}
            </div>
            <div style={{ position: 'absolute', bottom: 8, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {Array.from({ length: 10 }).map((_, index) => (
                    <span key={`bottom-${index}`} style={{ width: 10, height: 6, borderRadius: 999, background: 'rgba(245, 222, 179, 0.22)' }} />
                ))}
            </div>
        </>
    );
}

function OrbitHeader(props: {
    readonly orbit: SimilarityOrbit;
    readonly onOpenParent: (groupId: string) => void;
}) {
    const { orbit, onOpenParent } = props;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 12,
            color: '#e7e5e4',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
        }}>
            <div>{orbit.group_type?.replace('_', ' ') ?? 'group'}</div>
            {orbit.parent_group_id ? (
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpenParent(orbit.parent_group_id!);
                    }}
                    style={{
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#f5f5f4',
                        borderRadius: 999,
                        padding: '3px 9px',
                        fontSize: 10,
                        cursor: 'pointer',
                    }}
                >
                    Back Up
                </button>
            ) : null}
        </div>
    );
}

export const VariantFilmstrip: React.FC<VariantFilmstripProps> = ({
    groupId,
    selectedAsset,
    onGetGroupOrbit,
    onOrbitLoaded,
    onSelectAsset,
    onActiveGroupChange,
}) => {
    const [activeGroupId, setActiveGroupId] = useState(groupId);

    return (
        <VariantFilmstripOrbit
            key={activeGroupId}
            activeGroupId={activeGroupId}
            selectedAsset={selectedAsset}
            onGetGroupOrbit={onGetGroupOrbit}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onActiveGroupChange={onActiveGroupChange}
            onOpenGroup={setActiveGroupId}
        />
    );
};

function VariantFilmstripOrbit(props: {
    readonly activeGroupId: string;
    readonly selectedAsset: Asset;
    readonly onGetGroupOrbit: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onActiveGroupChange?: (groupId: string) => void;
    readonly onOpenGroup: (groupId: string) => void;
}) {
    const { orbit, loading } = useOrbit(props.activeGroupId, props.onGetGroupOrbit, props.onOrbitLoaded);
    const lastReportedGroupIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!orbit || !props.onActiveGroupChange || lastReportedGroupIdRef.current === orbit.group_id) {
            return;
        }

        lastReportedGroupIdRef.current = orbit.group_id;
        props.onActiveGroupChange(orbit.group_id);
    }, [orbit, props]);

    if (loading || !orbit || orbit.items.length <= 1) {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            bottom: 92,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, rgba(55, 41, 34, 0.94) 0%, rgba(20, 15, 13, 0.96) 100%)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            padding: '18px 18px',
            zIndex: 100,
            border: '1px solid rgba(255, 240, 220, 0.12)',
            boxShadow: '0 16px 32px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)',
            maxWidth: '90vw',
            overflow: 'hidden',
        }}>
            <FilmStripSprockets />
            <OrbitHeader orbit={orbit} onOpenParent={props.onOpenGroup} />
            <div style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                padding: '6px 0',
                scrollbarWidth: 'thin',
            }}>
                {orbit.items.map((item) => (
                    <VariantMemberTile
                        key={`${item.kind}:${item.group_id}:${item.asset.id}`}
                        item={item}
                        selectedAsset={props.selectedAsset}
                        onSelectAsset={props.onSelectAsset}
                        onOpenGroup={props.onOpenGroup}
                    />
                ))}
            </div>
        </div>
    );
}
