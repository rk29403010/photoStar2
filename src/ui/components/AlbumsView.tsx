import React, { useState, useEffect } from 'react';
import { resolveImageUrl } from '@boundary/runtime/backend';
import type { Album } from '@contracts/core';
import { isSystemAlbum, sortAlbumsForDisplay } from './albums/albumsViewModel';

interface AlbumsViewProps {
    onOpenAlbum: (albumId: string, albumTitle: string) => void;
    getAlbums: () => Promise<Album[]>;
    createAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
    deleteAlbum: (albumId: string) => Promise<void>;
}

interface AlbumCreationState {
    title: string;
    description: string;
}

function CreateAlbumForm({
    title,
    description,
    setTitle,
    setDescription,
    onCreate,
    onCancel
}: {
    title: string;
    description: string;
    setTitle: (v: string) => void;
    setDescription: (v: string) => void;
    onCreate: (e: React.FormEvent) => void;
    onCancel: () => void;
}) {
    return (
        <div style={{ background: '#1f2937', padding: 20, borderRadius: 8, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Create New Album</h3>
            <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                    autoFocus
                    placeholder="Album Title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{ padding: 8, borderRadius: 4, border: '1px solid #4b5563', background: '#374151', color: '#fff' }}
                />
                <input
                    placeholder="Description (Optional)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    style={{ padding: 8, borderRadius: 4, border: '1px solid #4b5563', background: '#374151', color: '#fff' }}
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button type="button" onClick={onCancel} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    <button type="submit" disabled={!title.trim()} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}>Create</button>
                </div>
            </form>
        </div>
    );
}

function AlbumsHeader({ onCreate }: { onCreate: () => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2>Albums</h2>
            <button
                onClick={onCreate}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
            >
                + New Album
            </button>
        </div>
    );
}

function AlbumCard({
    album,
    onOpenAlbum,
    onDelete
}: {
    album: Album;
    onOpenAlbum: (albumId: string, albumTitle: string) => void;
    onDelete: (e: React.MouseEvent, id: string, title: string) => void;
}) {
    const coverUrl = resolveImageUrl(album.cover_preview_path);
    return (
        <div
            key={album.id}
            onClick={() => onOpenAlbum(album.id, album.title)}
            style={{
                background: '#1f2937', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', transition: 'transform 0.2s', position: 'relative'
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
                {isSystemAlbum(album) && (
                    <div style={{ color: '#93c5fd', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
                        System Album
                    </div>
                )}
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{album.item_count} items</div>
            </div>

            {!isSystemAlbum(album) && (
                <button
                    onClick={(e) => onDelete(e, album.id, album.title)}
                    title="Delete Album"
                    style={{
                        position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#ef4444',
                        border: 'none', width: 24, height: 24, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.8
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                >
                    ×
                </button>
            )}
        </div>
    );
}

function AlbumsContent({
    loading,
    albums,
    onOpenAlbum,
    onDelete
}: {
    loading: boolean;
    albums: Album[];
    onOpenAlbum: (albumId: string, albumTitle: string) => void;
    onDelete: (e: React.MouseEvent, id: string, title: string) => void;
}) {
    const sortedAlbums = sortAlbumsForDisplay(albums);

    if (loading) {
        return <div>Loading albums...</div>;
    }

    if (sortedAlbums.length === 0) {
        return <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>No albums yet. Create one to get started!</div>;
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            {sortedAlbums.map(album => (
                <AlbumCard key={album.id} album={album} onOpenAlbum={onOpenAlbum} onDelete={onDelete} />
            ))}
        </div>
    );
}

function useAlbums(getAlbums: AlbumsViewProps['getAlbums']) {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAlbums = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setAlbums(await getAlbums());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to get albums');
        } finally {
            setLoading(false);
        }
    }, [getAlbums]);

    useEffect(() => {
        void fetchAlbums();
    }, [fetchAlbums]);

    return {
        albums,
        error,
        loading,
        fetchAlbums
    };
}

function useAlbumCreation(
    createAlbum: AlbumsViewProps['createAlbum'],
    refreshAlbums: () => Promise<void>
) {
    const [isCreating, setIsCreating] = useState(false);
    const [creationState, setCreationState] = useState<AlbumCreationState>({ title: '', description: '' });

    const updateCreationState = React.useCallback((key: keyof AlbumCreationState, value: string) => {
        setCreationState(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetCreationState = React.useCallback(() => {
        setCreationState({ title: '', description: '' });
        setIsCreating(false);
    }, []);

    const handleCreate = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const title = creationState.title.trim();

        if (!title) {
            return;
        }

        try {
            await createAlbum(title, creationState.description.trim() || undefined);
            resetCreationState();
            await refreshAlbums();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to create album');
        }
    }, [createAlbum, creationState.description, creationState.title, refreshAlbums, resetCreationState]);

    return {
        creationState,
        handleCreate,
        isCreating,
        openCreateForm: () => setIsCreating(true),
        closeCreateForm: () => setIsCreating(false),
        setDescription: (value: string) => updateCreationState('description', value),
        setTitle: (value: string) => updateCreationState('title', value)
    };
}

function useAlbumDeletion(
    deleteAlbum: AlbumsViewProps['deleteAlbum'],
    refreshAlbums: () => Promise<void>
) {
    return React.useCallback(async (e: React.MouseEvent, id: string, title: string) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete album "${title}"?`)) {
            return;
        }

        try {
            await deleteAlbum(id);
            await refreshAlbums();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to delete album');
        }
    }, [deleteAlbum, refreshAlbums]);
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({ onOpenAlbum, getAlbums, createAlbum, deleteAlbum }) => {
    const { albums, error, loading, fetchAlbums } = useAlbums(getAlbums);
    const {
        creationState,
        handleCreate,
        isCreating,
        openCreateForm,
        closeCreateForm,
        setDescription,
        setTitle
    } = useAlbumCreation(createAlbum, fetchAlbums);
    const handleDelete = useAlbumDeletion(deleteAlbum, fetchAlbums);

    return (
        <div style={{ padding: 20, height: '100%', overflowY: 'auto' }}>
            <AlbumsHeader onCreate={openCreateForm} />

            {error && <div style={{ color: '#ef4444', marginBottom: 20 }}>Error: {error}</div>}
            {isCreating && (
                <CreateAlbumForm
                    title={creationState.title}
                    description={creationState.description}
                    setTitle={setTitle}
                    setDescription={setDescription}
                    onCreate={handleCreate}
                    onCancel={closeCreateForm}
                />
            )}

            <AlbumsContent loading={loading} albums={albums} onOpenAlbum={onOpenAlbum} onDelete={handleDelete} />
        </div>
    );
};
