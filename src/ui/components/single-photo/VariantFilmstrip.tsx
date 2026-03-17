import type React from 'react';
import { useEffect, useState } from 'react';
import type { Asset } from '@contracts/core';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { buildVariantMemberActions, FILLED_STAR_SYMBOL, getVariantStarDisplayState, getVariantTileTitle, isVariantStarred, normalizeOrbitMembers } from './variantFilmstripModel';

interface VariantFilmstripProps {
    groupId: string;
    selectedAssetId: string;
    onGetGroupOrbit: (groupId: string) => Promise<Asset[]>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
}

function useOrbitMembers(groupId: string, onGetGroupOrbit: (groupId: string) => Promise<Asset[]>, onOrbitLoaded: (assets: Asset[]) => void) {
    const [members, setMembers] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        onGetGroupOrbit(groupId)
            .then((orbit) => {
                if (!mounted) {return;}
                const normalizedOrbit = normalizeOrbitMembers(groupId, orbit);
                setMembers(normalizedOrbit);
                onOrbitLoaded(normalizedOrbit);
            })
            .catch(console.error)
            .finally(() => {
                if (mounted) {setLoading(false);}
            });
        return () => { mounted = false; };
    }, [groupId, onGetGroupOrbit, onOrbitLoaded]);

    return { members, loading };
}

function getVariantTileOpacity(isCanonical: boolean): string {
    return isCanonical ? '1' : '0.6';
}

function updateTileOpacity(target: HTMLDivElement, isCanonical: boolean, opacity: string) {
    if (!isCanonical) {
        target.style.opacity = opacity;
    }
}

function getVariantTileStyle(isSelected: boolean) {
    return {
        width: 68,
        height: 68,
        flexShrink: 0,
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        border: isSelected ? '2px solid rgba(255, 248, 220, 0.96)' : '2px solid rgba(255, 255, 255, 0.08)',
        opacity: getVariantTileOpacity(isSelected),
        transition: 'all 0.2s',
        position: 'relative',
        background: '#17110f',
        boxShadow: isSelected ? '0 0 0 1px rgba(0, 0, 0, 0.65)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.38)'
    } as const;
}

function StarIndicator({ isStarred }: { isStarred: boolean }) {
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
                lineHeight: 1
            }}
        >
            {FILLED_STAR_SYMBOL}
        </div>
    );
}

function VariantMemberTile({
    member,
    isSelected,
    isStarred,
    onSelectAsset,
}: {
    member: Asset;
    isSelected: boolean;
    isStarred: boolean;
    onSelectAsset: (assetId: string) => void;
}) {
    const imgSrc = resolveImageUrl(member.preview_path ?? member.original_path) || '';
    const actions = buildVariantMemberActions({
        memberId: member.id,
        onSelectAsset,
    });

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        actions.selectMember();
    };
    const starDisplayState = getVariantStarDisplayState({ isStarred, isHovered: false });

    return (
        <div
            onClick={handleClick}
            style={getVariantTileStyle(isSelected)}
            onMouseEnter={(e) => updateTileOpacity(e.currentTarget, isSelected, '1')}
            onMouseLeave={(e) => updateTileOpacity(e.currentTarget, isSelected, '0.6')}
            title={getVariantTileTitle(isStarred)}
        >
            <img src={imgSrc} alt="Variant preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {starDisplayState === 'filled' && <StarIndicator isStarred />}
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

export const VariantFilmstrip: React.FC<VariantFilmstripProps> = ({ groupId, selectedAssetId, onGetGroupOrbit, onOrbitLoaded, onSelectAsset }) => {
    const { members, loading } = useOrbitMembers(groupId, onGetGroupOrbit, onOrbitLoaded);

    if (loading || members.length <= 1) {return null;}

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
            <div style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                padding: '6px 0',
                scrollbarWidth: 'thin',
            }}>
                {members.map((member) => (
                    <VariantMemberTile
                        key={member.id}
                        member={member}
                        isSelected={member.id === selectedAssetId}
                        isStarred={isVariantStarred(member)}
                        onSelectAsset={onSelectAsset}
                    />
                ))}
            </div>
        </div>
    );
};
