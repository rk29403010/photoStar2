import React from 'react';

interface TopBarProps {
    view: 'library' | 'people' | 'dashboard';
    setView: (view: 'library' | 'people' | 'dashboard') => void;
    onRefresh: () => void;
    onOpenActions: () => void;
    showFaces: boolean;
    setShowFaces: (val: boolean) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ view, setView, onRefresh, onOpenActions, showFaces, setShowFaces }) => {
    return (
        <div style={{
            marginBottom: 10,
            padding: '12px 16px',
            borderBottom: '1px solid #333',
            background: '#111',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            zIndex: 10
        }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#eee', marginRight: 'auto' }}>
                PhotoStar
            </h1>

            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={() => setView('library')}
                    disabled={view === 'library'}
                    style={{
                        padding: '6px 16px',
                        background: view === 'library' ? '#333' : 'transparent',
                        color: view === 'library' ? '#fff' : '#aaa',
                        border: '1px solid #444',
                        borderRadius: 4,
                        cursor: view === 'library' ? 'default' : 'pointer'
                    }}
                >
                    Library
                </button>
                <button
                    onClick={() => setView('people')}
                    disabled={view === 'people'}
                    style={{
                        padding: '6px 16px',
                        background: view === 'people' ? '#333' : 'transparent',
                        color: view === 'people' ? '#fff' : '#aaa',
                        border: '1px solid #444',
                        borderRadius: 4,
                        cursor: view === 'people' ? 'default' : 'pointer'
                    }}
                >
                    People
                </button>
                <button
                    onClick={() => setView('dashboard')}
                    disabled={view === 'dashboard'}
                    style={{
                        padding: '6px 16px',
                        background: view === 'dashboard' ? '#333' : 'transparent',
                        color: view === 'dashboard' ? '#fff' : '#aaa',
                        border: '1px solid #444',
                        borderRadius: 4,
                        cursor: view === 'dashboard' ? 'default' : 'pointer'
                    }}
                >
                    Dashboard
                </button>
            </div>

            <div style={{ width: 1, height: 24, background: '#444' }} />

            <button
                onClick={() => setShowFaces(!showFaces)}
                style={{
                    background: showFaces ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
                    border: '1px solid',
                    borderColor: showFaces ? 'cyan' : 'transparent',
                    borderRadius: '4px',
                    color: showFaces ? 'cyan' : '#aaa',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.2s',
                    marginLeft: 'auto'
                }}
            >
                <span style={{ fontSize: 16 }}>👤</span> Faces
            </button>

            <button onClick={onRefresh} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.9rem' }}>
                ↻ Refresh
            </button>

            <button
                onClick={onOpenActions}
                style={{
                    padding: '6px 12px',
                    background: '#2a5',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginLeft: 8
                }}
            >
                Actions
            </button>
        </div>
    );
};
