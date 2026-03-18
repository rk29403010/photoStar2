import type React from 'react';

interface TopBarProps {
    view: 'library' | 'people' | 'dashboard' | 'albums' | 'workflows' | 'groupDiagnostics';
    setView: (view: 'library' | 'people' | 'dashboard' | 'albums' | 'workflows' | 'groupDiagnostics') => void;
    onOpenActions: () => void;
}

type ViewType = TopBarProps['view'];

function ViewButton({
    view,
    current,
    setView
}: {
    view: ViewType;
    current: ViewType;
    setView: (view: ViewType) => void;
}) {
    const selected = current === view;
    return (
        <button
            onClick={() => setView(view)}
            disabled={selected}
            style={{
                padding: '6px 16px',
                background: selected ? '#333' : 'transparent',
                color: selected ? '#fff' : '#d1d5db',
                border: '1px solid #444',
                borderRadius: 4,
                cursor: selected ? 'default' : 'pointer'
            }}
        >
            {view[0].toUpperCase() + view.slice(1)}
        </button>
    );
}

export const TopBar: React.FC<TopBarProps> = ({ view, setView, onOpenActions }) => {
    return (
        <div style={{
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
                <ViewButton view="library" current={view} setView={setView} />
                <ViewButton view="people" current={view} setView={setView} />
                <ViewButton view="albums" current={view} setView={setView} />
                <ViewButton view="dashboard" current={view} setView={setView} />
            </div>

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
