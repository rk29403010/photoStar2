import type React from 'react';
import { useEffect, useState } from 'react';
import { resolveImageUrl } from '@boundary/runtime/backend';

export interface OrbitMember {
    id: string;
    original_path: string;
    preview_path: string | null;
    role: string;
    rank: number | null;
    match_evidence: string | null;
}

interface VariantFilmstripProps {
    groupId: string;
    canonicalAssetId: string;
    onGetGroupOrbit: (groupId: string) => Promise<unknown[]>;
    onSetCanonical: (groupId: string, newCanonicalId: string) => void;
    onExplodeGroup: (groupId: string) => void;
}

function useOrbitMembers(groupId: string, onGetGroupOrbit: (groupId: string) => Promise<unknown[]>) {
    const [members, setMembers] = useState<OrbitMember[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        onGetGroupOrbit(groupId)
            .then((orbit: unknown[]) => {
                if (mounted) {setMembers(orbit as OrbitMember[]);}
            })
            .catch(console.error)
            .finally(() => {
                if (mounted) {setLoading(false);}
            });
        return () => { mounted = false; };
    }, [groupId, onGetGroupOrbit]);

    return { members, loading };
}

function getVariantTileOpacity(isCanonical: boolean): string {
    return isCanonical ? '1' : '0.6';
}

function getVariantTileTitle(isCanonical: boolean): string {
    return isCanonical ? 'Canonical Image' : 'Click to set as canonical overview image';
}

function updateTileOpacity(target: HTMLDivElement, isCanonical: boolean, opacity: string) {
    if (!isCanonical) {
        target.style.opacity = opacity;
    }
}

function CanonicalBadge() {
    return (
        <div style={{
            position: 'absolute', top: 2, right: 2,
            background: '#3b82f6', color: 'white', borderRadius: '50%', width: 14, height: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 'bold'
        }}>
            ✓
        </div>
    );
}

function VariantMemberTile({
    member,
    groupId,
    isCanonical,
    onSetCanonical
}: {
    member: OrbitMember;
    groupId: string;
    isCanonical: boolean;
    onSetCanonical: (groupId: string, newCanonicalId: string) => void;
}) {
    const imgSrc = resolveImageUrl(member.preview_path || member.original_path) || '';
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!isCanonical) {
            onSetCanonical(groupId, member.id);
        }
    };

    return (
        <div
            onClick={handleClick}
            style={{
                width: 60,
                height: 60,
                flexShrink: 0,
                borderRadius: 4,
                overflow: 'hidden',
                cursor: isCanonical ? 'default' : 'pointer',
                border: isCanonical ? '2px solid #3b82f6' : '1px solid transparent',
                opacity: getVariantTileOpacity(isCanonical),
                transition: 'all 0.2s',
                position: 'relative'
            }}
            onMouseEnter={(e) => updateTileOpacity(e.currentTarget, isCanonical, '1')}
            onMouseLeave={(e) => updateTileOpacity(e.currentTarget, isCanonical, '0.6')}
            title={getVariantTileTitle(isCanonical)}
        >
            <img src={imgSrc} alt="Variant preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {isCanonical && <CanonicalBadge />}
        </div>
    );
}

function FilmstripHeader({ count, groupId, onExplodeGroup }: { count: number; groupId: string; onExplodeGroup: (groupId: string) => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#d1d5db', fontSize: '0.75rem', fontWeight: 600 }}>Similar Photos ({count})</span>
            <button
                onClick={(e) => { e.stopPropagation(); onExplodeGroup(groupId); }}
                style={{
                    background: 'transparent', color: '#f87171', border: '1px solid #ef444455',
                    borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer'
                }}
            >
                Explode Group
            </button>
        </div>
    );
}

export const VariantFilmstrip: React.FC<VariantFilmstripProps> = ({ groupId, canonicalAssetId, onGetGroupOrbit, onSetCanonical, onExplodeGroup }) => {
    const { members, loading } = useOrbitMembers(groupId, onGetGroupOrbit);

    if (loading || members.length <= 1) {return null;}

    return (
        <div style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20, 20, 20, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 100,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            maxWidth: '90vw',
        }}>
            <FilmstripHeader count={members.length} groupId={groupId} onExplodeGroup={onExplodeGroup} />

            <div style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
            }}>
                {members.map((member) => (
                    <VariantMemberTile
                        key={member.id}
                        member={member}
                        groupId={groupId}
                        isCanonical={member.id === canonicalAssetId || member.role === 'canonical'}
                        onSetCanonical={onSetCanonical}
                    />
                ))}
            </div>
        </div>
    );
};