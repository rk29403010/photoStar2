import React from 'react';
import type { Person } from '../types/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface PeopleViewProps {
    people: Person[];
}

export const PeopleView: React.FC<PeopleViewProps> = ({ people }) => {
    if (people.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>No people found.</div>;
    }

    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    const getSafeImgSrc = (path: string | undefined): string | null => {
        if (!path) return null;
        if (isTauri) return convertFileSrc(path);
        // Browser Fallback (development mode)
        return `http://localhost:5174/image?path=${encodeURIComponent(path)}`;
    };

    return (
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24, background: '#0a0a0a' }}>
            {people.map(person => {
                const coverSrc = getSafeImgSrc(person.cover_image);
                return (
                    <div
                        key={person.id}
                        style={{
                            background: '#111',
                            borderRadius: 16,
                            padding: 20,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            border: '1px solid #222',
                            transition: 'transform 0.2s',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        {/* Circular Avatar */}
                        <div style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: '#222',
                            marginBottom: 16,
                            border: '3px solid #333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {coverSrc ? (
                                <img
                                    src={coverSrc}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                    }}
                                />
                            ) : (
                                <span style={{ fontSize: '2rem', opacity: 0.3 }}>👤</span>
                            )}
                        </div>

                        <div style={{ fontWeight: '600', color: '#fff', fontSize: '1rem', marginBottom: 4 }}>
                            {person.name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', fontWeight: '500' }}>
                            {person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
