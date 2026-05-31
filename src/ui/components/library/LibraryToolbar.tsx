import type { ReactNode } from 'react';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { Select } from '../Primitives';

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

function ToggleButton({
    label,
    active,
    onClick,
    variant = 'blue',
}: {
    readonly label: string;
    readonly active: boolean;
    readonly onClick: () => void;
    readonly variant?: 'blue' | 'cyan' | 'indigo';
}) {
    let activeClass = 'bg-content/5 text-content-secondary border border-content/10 hover:bg-content/10';
    if (active) {
        if (variant === 'blue') {
            activeClass = 'bg-blue-600/20 text-blue-200 border border-blue-500/40 hover:bg-blue-600/30';
        } else if (variant === 'cyan') {
            activeClass = 'bg-cyan-600/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-600/30';
        } else if (variant === 'indigo') {
            activeClass = 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-600/30';
        }
    }

    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${activeClass}`}
        >
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
        <label className="flex items-center gap-2 text-content-secondary text-[11px] tracking-wider uppercase font-semibold">
            <span>{label}</span>
            <Select
                aria-label={ariaLabel}
                value={value}
                onChange={(event) => onChange(event.target.value as T)}
                className="rounded-full px-2.5 py-1 text-xs w-auto min-w-[100px]"
            >
                {children}
            </Select>
        </label>
    );
}

export function LibraryToolbar(props: LibraryToolbarProps) {
    return (
        <div className="flex flex-col gap-2 px-3.5 py-2.5 border-b border-content/5 bg-gradient-to-b from-surface-secondary to-surface">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <ToggleButton label="Group similar photos" active={props.groupSimilarPhotos} onClick={() => props.onGroupSimilarPhotosChange(!props.groupSimilarPhotos)} variant="blue" />
                    <ToggleButton label="Show group IDs" active={props.showGroupIds} onClick={() => props.onShowGroupIdsChange(!props.showGroupIds)} variant="cyan" />
                    <ToggleButton label="Info panel" active={props.showInfoPanel} onClick={() => props.onShowInfoPanelChange(!props.showInfoPanel)} variant="indigo" />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
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
