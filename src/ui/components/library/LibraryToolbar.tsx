import type { ReactNode } from 'react';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';

type LibraryToolbarProps = {
    readonly sortMode: LibrarySortMode;
    readonly onSortModeChange: (mode: LibrarySortMode) => void;
    readonly layoutMode: GalleryLayoutMode;
    readonly onLayoutModeChange: (mode: GalleryLayoutMode) => void;
    readonly selectedTag: string;
    readonly availableTags: string[];
    readonly onTagChange: (tag: string) => void;
    readonly groupSimilarPhotos: boolean;
    readonly onGroupSimilarPhotosChange: (enabled: boolean) => void;
    readonly showGroupIds: boolean;
    readonly onShowGroupIdsChange: (enabled: boolean) => void;
    readonly showInfoPanel: boolean;
    readonly onShowInfoPanelChange: (show: boolean) => void;
}

function getToggleButtonStyle(active: boolean, colors: { activeBackground: string; activeColor: string; activeBorder: string }) {
    return {
        background: active ? colors.activeBackground : 'rgba(148,163,184,0.08)',
        color: active ? colors.activeColor : '#cbd5e1',
        border: `1px solid ${active ? colors.activeBorder : 'rgba(148,163,184,0.2)'}`,
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
    };
}

function ToggleButton({
    label,
    active,
    onClick,
    colors,
}: {
    readonly label: string;
    readonly active: boolean;
    readonly onClick: () => void;
    readonly colors: { activeBackground: string; activeColor: string; activeBorder: string };
}) {
    return (
        <button type="button" aria-pressed={active} onClick={onClick} style={getToggleButtonStyle(active, colors)}>
            {label}
        </button>
    );
}

function ToolbarSelect<T extends string>({
    label,
    ariaLabel,
    value,
    onChange,
    children,
}: {
    readonly label: string;
    readonly ariaLabel: string;
    readonly value: T;
    readonly onChange: (value: T) => void;
    readonly children: ReactNode;
}) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <span>{label}</span>
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(event) => onChange(event.target.value as T)}
                style={{ background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 999, padding: '6px 10px', fontSize: '0.78rem', outline: 'none' }}
            >
                {children}
            </select>
        </label>
    );
}

export function LibraryToolbar(props: LibraryToolbarProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'linear-gradient(180deg, rgba(18,18,18,0.92), rgba(10,10,10,0.92))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ToggleButton label="Group similar photos" active={props.groupSimilarPhotos} onClick={() => props.onGroupSimilarPhotosChange(!props.groupSimilarPhotos)} colors={{ activeBackground: 'rgba(37,99,235,0.22)', activeColor: '#bfdbfe', activeBorder: 'rgba(96,165,250,0.75)' }} />
                    <ToggleButton label="Show group IDs" active={props.showGroupIds} onClick={() => props.onShowGroupIdsChange(!props.showGroupIds)} colors={{ activeBackground: 'rgba(8,145,178,0.22)', activeColor: '#a5f3fc', activeBorder: 'rgba(34,211,238,0.65)' }} />
                    <ToggleButton label="Info panel" active={props.showInfoPanel} onClick={() => props.onShowInfoPanelChange(!props.showInfoPanel)} colors={{ activeBackground: 'rgba(79,70,229,0.24)', activeColor: '#c7d2fe', activeBorder: 'rgba(129,140,248,0.72)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ToolbarSelect label="Tag" ariaLabel="Filter gallery by tag" value={props.selectedTag} onChange={props.onTagChange}>
                        <option value="">All tags</option>
                        {props.availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </ToolbarSelect>
                    <ToolbarSelect label="View" ariaLabel="Gallery view" value={props.layoutMode} onChange={props.onLayoutModeChange}>
                        <option value="tiled">Tiled</option>
                        <option value="grid">Grid</option>
                        <option value="justified">Justified</option>
                    </ToolbarSelect>
                    <ToolbarSelect label="Sort" ariaLabel="Sort gallery" value={props.sortMode} onChange={props.onSortModeChange}>
                        <option value="date">Date</option>
                        <option value="reverse-date">Reverse date</option>
                        <option value="filename">Filename</option>
                        {!props.groupSimilarPhotos && <option value="group">Group</option>}
                    </ToolbarSelect>
                </div>
            </div>
        </div>
    );
}
