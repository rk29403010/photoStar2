import { useState, useEffect, type ReactNode } from 'react';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { Select } from '../Primitives';
import { Layers, Hash, Info, ChevronDown, X } from 'lucide-react';
import { getLibrarySelectionCount, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';

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
    readonly librarySelection?: LibrarySelectionState;
    readonly onClearSelection?: () => void;
    readonly onDeclusterSelection?: (personId: string) => void;
    readonly onBulkTagSelection?: () => Promise<void>;
    readonly onBulkUntagSelection?: () => Promise<void>;
    readonly onMoveSelectionToBin?: () => Promise<void>;
    readonly onRestoreSelectionFromBin?: () => Promise<void>;
    readonly activeFilter?: LibraryFilter;
}

function ToggleButton({
    title,
    active,
    onClick,
    children,
}: {
    readonly title: string;
    readonly active: boolean;
    readonly onClick: () => void;
    readonly children: ReactNode;
}) {
    const activeClass = active
        ? 'bg-content text-surface border-transparent hover:opacity-90'
        : 'bg-surface-secondary text-content-secondary border-content/10 hover:bg-content/10 hover:text-content';

    return (
        <button
            type="button"
            aria-pressed={active}
            title={title}
            onClick={onClick}
            className={`rounded-full p-2 cursor-pointer border transition-colors flex items-center justify-center ${activeClass}`}
        >
            {children}
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

const ToolbarSelectionActions: React.FC<{
    selectionCount: number;
    singlePersonId: string | null;
    isViewingBin: boolean;
    onClearSelection?: () => void;
    onDeclusterSelection?: (personId: string) => void;
    onBulkTagSelection?: () => Promise<void>;
    onBulkUntagSelection?: () => Promise<void>;
    onMoveSelectionToBin?: () => Promise<void>;
    onRestoreSelectionFromBin?: () => Promise<void>;
}> = (props) => {
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
        if (!menuOpen) {return;}
        const handleOutsideClick = () => setMenuOpen(false);
        window.addEventListener('click', handleOutsideClick);
        return () => window.removeEventListener('click', handleOutsideClick);
    }, [menuOpen]);

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-content-secondary bg-content/5 px-2.5 py-1 rounded-full border border-content/5">
                Selected: <strong className="text-content">{props.selectionCount}</strong>
            </span>
            <div className="relative inline-block text-left">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(!menuOpen);
                    }}
                    className="flex items-center gap-1 bg-brand-accent/15 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/25 rounded-full px-3 py-1 text-xs font-bold cursor-pointer transition-colors"
                >
                    <span>Actions</span>
                    <ChevronDown size={13} className={`motion-safe:transition-transform motion-safe:duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-surface border border-content/10 shadow-lg py-1 z-30">
                        {props.singlePersonId && (
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    props.onDeclusterSelection?.(props.singlePersonId!);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs text-red-500 hover:bg-content/5 cursor-pointer font-medium"
                            >
                                Decluster
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                void props.onBulkTagSelection?.();
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-content hover:bg-content/5 cursor-pointer font-medium"
                        >
                            Tag Selected
                        </button>
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                void props.onBulkUntagSelection?.();
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-content hover:bg-content/5 cursor-pointer font-medium"
                        >
                            Untag Selected
                        </button>
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                if (props.isViewingBin) {
                                    void props.onRestoreSelectionFromBin?.();
                                } else {
                                    void props.onMoveSelectionToBin?.();
                                }
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-content hover:bg-content/5 cursor-pointer font-medium border-t border-content/5"
                        >
                            {props.isViewingBin ? 'Restore Selected' : 'Move to Bin'}
                        </button>
                    </div>
                )}
            </div>
            <button
                onClick={props.onClearSelection}
                title="Clear selection"
                className="bg-surface-secondary hover:bg-content/10 border border-content/10 text-content-secondary hover:text-content rounded-full p-1 cursor-pointer transition-colors flex items-center justify-center"
            >
                <X size={14} />
            </button>
        </div>
    );
};

export function LibraryToolbar(props: LibraryToolbarProps) {
    const selectionCount = props.librarySelection ? getLibrarySelectionCount(props.librarySelection) : 0;
    const isViewingBin = props.activeFilter?.type === 'album' && props.activeFilter.albumId === 'system:bin';
    const singlePersonId = props.activeFilter?.type === 'person_any' && props.activeFilter.personIds.length === 1
        ? props.activeFilter.personIds[0]
        : null;

    return (
        <div className="flex flex-col gap-2 px-3.5 py-2.5 border-b border-content/5 bg-gradient-to-b from-surface-secondary to-surface">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <ToggleButton title="Group similar photos" active={props.groupSimilarPhotos} onClick={() => props.onGroupSimilarPhotosChange(!props.groupSimilarPhotos)}>
                        <Layers size={15} />
                    </ToggleButton>
                    <ToggleButton title="Show group IDs" active={props.showGroupIds} onClick={() => props.onShowGroupIdsChange(!props.showGroupIds)}>
                        <Hash size={15} />
                    </ToggleButton>
                    <ToggleButton title="Info panel" active={props.showInfoPanel} onClick={() => props.onShowInfoPanelChange(!props.showInfoPanel)}>
                        <Info size={15} />
                    </ToggleButton>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {selectionCount > 0 ? (
                        <ToolbarSelectionActions
                            selectionCount={selectionCount}
                            singlePersonId={singlePersonId}
                            isViewingBin={isViewingBin}
                            onClearSelection={props.onClearSelection}
                            onDeclusterSelection={props.onDeclusterSelection}
                            onBulkTagSelection={props.onBulkTagSelection}
                            onBulkUntagSelection={props.onBulkUntagSelection}
                            onMoveSelectionToBin={props.onMoveSelectionToBin}
                            onRestoreSelectionFromBin={props.onRestoreSelectionFromBin}
                        />
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
