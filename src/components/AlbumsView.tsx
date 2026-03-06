import React, { useState, useEffect } from 'react';
import { resolveImageUrl } from '../config/backend';

import type { Album } from '../../shared/types/core';

interface AlbumsViewProps {
    onOpenAlbum: (albumId: string, albumTitle: string) => void;
    getAlbums: () => Promise<Album[]>;
    createAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
    deleteAlbum: (albumId: string) => Promise<void>;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({ onOpenAlbum, getAlbums, createAlbum, deleteAlbum }) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');

    const fetchAlbums = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAlbums();
            setAlbums(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to get albums');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        try {
            await createAlbum(newTitle.trim(), newDescription.trim() || undefined);
            setIsCreating(false);
            setNewTitle('');
            setNewDescription('');
            fetchAlbums();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to create album');
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete album "${title}"?`)) {
            try {
                await deleteAlbum(id);
                fetchAlbums();
            } catch (err: unknown) {
                alert(err instanceof Error ? err.message : 'Failed to delete album');
            }
        }
    };

    return (
        <div style={{ padding: 20, height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2>Albums</h2>
                <button 
                    onClick={() => setIsCreating(true)}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
                >
                    + New Album
                </button>
            </div>

            {error && <div style={{ color: '#ef4444', marginBottom: 20 }}>Error: {error}</div>}

            {isCreating && (
                <div style={{ background: '#1f2937', padding: 20, borderRadius: 8, marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0 }}>Create New Album</h3>
                    <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input 
                            autoFocus
                            placeholder="Album Title" 
                            value={newTitle} 
                            onChange={e => setNewTitle(e.target.value)}
                            style={{ padding: 8, borderRadius: 4, border: '1px solid #4b5563', background: '#374151', color: '#fff' }}
                        />
                        <input 
                            placeholder="Description (Optional)" 
                            value={newDescription} 
                            onChange={e => setNewDescription(e.target.value)}
                            style={{ padding: 8, borderRadius: 4, border: '1px solid #4b5563', background: '#374151', color: '#fff' }}
                        />
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                            <button type="button" onClick={() => setIsCreating(false)} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" disabled={!newTitle.trim()} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}>Create</button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div>Loading albums...</div>
            ) : albums.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                    No albums yet. Create one to get started!
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
                    {albums.map(album => {
                        const coverUrl = resolveImageUrl(album.cover_preview_path);
                        
                        return (
                            <div 
                                key={album.id}
                                onClick={() => onOpenAlbum(album.id, album.title)}
                                style={{
                                    background: '#1f2937',
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                    transition: 'transform 0.2s',
                                    position: 'relative'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ height: 200, background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {coverUrl ? (
                                        <img src={coverUrl} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ color: '#9ca3af', fontSize: '2rem' }}>📁</div>
                                    )}
                                </div>
                                <div style={{ padding: 12 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {album.title}
                                    </div>
                                    <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                        {album.item_count} items
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={(e) => handleDelete(e, album.id, album.title)}
                                    title="Delete Album"
                                    style={{
                                        position: 'absolute',
                                        top: 8, right: 8,
                                        background: 'rgba(0,0,0,0.5)',
                                        color: '#ef4444',
                                        border: 'none',
                                        width: 24, height: 24,
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                        opacity: 0.8
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
