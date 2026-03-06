import React, { useEffect, useState } from 'react';
import { resolveImageUrl } from '../../config/backend';

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

export const VariantFilmstrip: React.FC<VariantFilmstripProps> = ({ groupId, canonicalAssetId, onGetGroupOrbit, onSetCanonical, onExplodeGroup }) => {
    const [members, setMembers] = useState<OrbitMember[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        onGetGroupOrbit(groupId)
            .then((orbit: unknown[]) => {
                if (mounted) setMembers(orbit as OrbitMember[]);
            })
            .catch(console.error)
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [groupId, onGetGroupOrbit]);

    if (loading || members.length <= 1) return null;

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#aaa', fontSize: '0.75rem', fontWeight: 600 }}>Similar Photos ({members.length})</span>
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
            
            <div style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
            }}>
                {members.map((m) => {
                    const isCanonical = m.id === canonicalAssetId || m.role === 'canonical';
                    const imgSrc = resolveImageUrl(m.preview_path || m.original_path) || '';
                    return (
                        <div
                            key={m.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isCanonical) onSetCanonical(groupId, m.id);
                            }}
                            style={{
                                width: 60,
                                height: 60,
                                flexShrink: 0,
                                borderRadius: 4,
                                overflow: 'hidden',
                                cursor: isCanonical ? 'default' : 'pointer',
                                border: isCanonical ? '2px solid #3b82f6' : '1px solid transparent',
                                opacity: isCanonical ? 1 : 0.6,
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                            onMouseEnter={(e) => { if (!isCanonical) e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { if (!isCanonical) e.currentTarget.style.opacity = '0.6'; }}
                            title={isCanonical ? 'Canonical Image' : 'Click to set as canonical overview image'}
                        >
                            <img src={imgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            {isCanonical && (
                                <div style={{
                                    position: 'absolute', top: 2, right: 2,
                                    background: '#3b82f6', color: 'white',
                                    borderRadius: '50%', width: 14, height: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 8, fontWeight: 'bold'
                                }}>
                                    ✓
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
