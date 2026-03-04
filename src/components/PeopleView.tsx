import React, { useState, useRef } from 'react';
import type { Person } from '../types/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';

interface PeopleViewProps {
    people: Person[];
    onFilter?: (filter: LibraryFilter) => void;
    onSelectionChange?: (count: number) => void;
    onRename?: (personId: string, newName: string) => void;
    onMerge?: (personIds: string[], targetName: string) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ people, onFilter, onSelectionChange, onRename, onMerge }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState<string>('');
    const timerRef = useRef<number | null>(null);

    const handlePointerDown = (id: string) => {
        if (isMultiSelect) return;
        timerRef.current = window.setTimeout(() => {
            setIsMultiSelect(true);
            setSelectedIds(prev => {
                const next = new Set([...prev, id]);
                onSelectionChange?.(next.size);
                return next;
            });
            timerRef.current = null;
        }, 500); // 500ms hold for multi-select
    };

    const handlePointerUp = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (person: Person) => {
        if (isMultiSelect) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(person.id)) next.delete(person.id);
                else next.add(person.id);
                onSelectionChange?.(next.size);
                return next;
            });
        } else {
            // Cancel timer just in case
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            onFilter?.({
                type: 'person_any',
                personIds: [person.id],
                description: `${person.name || 'Unknown'}`,
                persons: [{ id: person.id, name: person.name || 'Unknown' }]
            });
        }
    };

    const handleMultiFilter = (type: 'person_any' | 'person_all' | 'person_only') => {
        if (selectedIds.size === 0) return;
        const selectedPeople = people.filter(p => selectedIds.has(p.id));
        const names = selectedPeople.map(p => p.name || 'Unknown').join(', ');
        const typeStr = type === 'person_any' ? 'Any of:' : type === 'person_all' ? 'All of:' : 'Only:';
        onFilter?.({
            type,
            personIds: Array.from(selectedIds),
            description: `${typeStr} ${names}`,
            persons: selectedPeople.map(p => ({ id: p.id, name: p.name || 'Unknown' }))
        });
        setIsMultiSelect(false);
        setSelectedIds(new Set());
        onSelectionChange?.(0);
    };

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
        <div style={{ position: 'relative', height: '100%', overflow: 'auto' }}>
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24, background: '#0a0a0a', paddingBottom: isMultiSelect ? 100 : 24 }}>
                {people.map(person => {
                    const coverSrc = getSafeImgSrc(person.cover_image);
                    const isSelected = selectedIds.has(person.id);
                    return (
                        <div
                            key={person.id}
                            style={{
                                background: isSelected ? '#1e3a8a' : '#111',
                                borderRadius: 16,
                                padding: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                                border: isSelected ? '2px solid #3b82f6' : '1px solid #222',
                                transition: 'all 0.2s',
                                cursor: 'pointer',
                                opacity: isMultiSelect && !isSelected ? 0.6 : 1
                            }}
                            onPointerDown={() => handlePointerDown(person.id)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onClick={() => handleClick(person)}
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
                                        draggable={false}
                                    />
                                ) : (
                                    <span style={{ fontSize: '2rem', opacity: 0.3 }}>👤</span>
                                )}
                            </div>

                            {editingId === person.id ? (
                                <input
                                    autoFocus
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    onPointerDown={e => e.stopPropagation()}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            if (editingName.trim() && editingName !== person.name) {
                                                onRename?.(person.id, editingName.trim());
                                            }
                                            setEditingId(null);
                                        } else if (e.key === 'Escape') {
                                            setEditingId(null);
                                        }
                                    }}
                                    onBlur={() => {
                                        if (editingName.trim() && editingName !== person.name) {
                                            onRename?.(person.id, editingName.trim());
                                        }
                                        setEditingId(null);
                                    }}
                                    style={{ width: '80%', padding: '4px', textAlign: 'center', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, marginBottom: 4 }}
                                />
                            ) : (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(person.id);
                                        setEditingName(person.name || '');
                                    }}
                                    onPointerDown={e => e.stopPropagation()}
                                    title="Click to rename"
                                    style={{ fontWeight: '600', color: '#fff', fontSize: '1rem', marginBottom: 4, cursor: 'text', padding: '0 8px', borderRadius: 4 }}
                                >
                                    {person.name || 'Unknown'}
                                </div>
                            )}
                            <div
                                title={person.rejected_count ? `${person.rejected_count} photo${person.rejected_count === 1 ? '' : 's'} rejected` : undefined}
                                style={{ fontSize: '0.8rem', color: '#666', fontWeight: '500', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                <span>{person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}</span>
                                {!!person.rejected_count && (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        color: '#ef4444',
                                        background: 'rgba(239,68,68,0.12)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: 10,
                                        padding: '0px 5px',
                                        lineHeight: '1.4',
                                        cursor: 'help'
                                    }} title={`${person.rejected_count} rejected`}>
                                        -{person.rejected_count}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Multi-Select Floating Action Bar */}
            {isMultiSelect && (
                <div style={{
                    position: 'absolute',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#222',
                    padding: '12px 24px',
                    borderRadius: 32,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #333',
                    zIndex: 50
                }}>
                    <span style={{ color: '#aaa', marginRight: 8, fontSize: '0.9rem' }}>
                        {selectedIds.size} selected
                    </span>
                    <button
                        onClick={() => handleMultiFilter('person_any')}
                        disabled={selectedIds.size === 0}
                        style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#3b82f6', color: '#fff', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', opacity: selectedIds.size > 0 ? 1 : 0.5, fontWeight: 'bold' }}
                    >Any</button>
                    <button
                        onClick={() => handleMultiFilter('person_all')}
                        disabled={selectedIds.size < 2}
                        style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#3b82f6', color: '#fff', cursor: selectedIds.size > 1 ? 'pointer' : 'not-allowed', opacity: selectedIds.size > 1 ? 1 : 0.5, fontWeight: 'bold' }}
                    >All</button>
                    <button
                        onClick={() => handleMultiFilter('person_only')}
                        disabled={selectedIds.size === 0}
                        style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#3b82f6', color: '#fff', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', opacity: selectedIds.size > 0 ? 1 : 0.5, fontWeight: 'bold' }}
                    >Only</button>

                    <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />

                    <button
                        onClick={() => {
                            const selectedPeople = people.filter(p => selectedIds.has(p.id));
                            const canonical = selectedPeople[0];
                            const newName = window.prompt("Enter name for merged person:", canonical.name || 'Unknown');
                            if (newName) {
                                onMerge?.(Array.from(selectedIds), newName.trim());
                                setIsMultiSelect(false);
                                setSelectedIds(new Set());
                                onSelectionChange?.(0);
                            }
                        }}
                        disabled={selectedIds.size < 2}
                        style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#eab308', color: '#000', cursor: selectedIds.size > 1 ? 'pointer' : 'not-allowed', opacity: selectedIds.size > 1 ? 1 : 0.5, fontWeight: 'bold' }}
                    >Merge</button>

                    <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />

                    <button
                        onClick={() => {
                            setIsMultiSelect(false);
                            setSelectedIds(new Set());
                            onSelectionChange?.(0);
                        }}
                        style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#444', color: '#fff', cursor: 'pointer' }}
                    >Cancel</button>
                </div>
            )}
        </div>
    );
};
