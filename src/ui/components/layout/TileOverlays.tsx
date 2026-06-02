import type { Asset, TileIntent } from '@contracts/core';
import { PERSON_COLORS } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { buildGroupIdPillModels } from './tileGroupIdModel';
import { getTileOverlayVisibility } from './tileOverlayModel';

export type SensitivityBadge = {
    label: string;
    tone: 'error' | 'warning';
};

type FaceOverlayVisuals = {
    highlightColor: string;
    opacity: number;
    isFilteredPerson: boolean;
}

type TileOverlaysProps = {
    selected: boolean;
    sensitivityBadge: SensitivityBadge | null;
    stackCount: number | null | undefined;
    isGroupRepresentative: boolean;
    groupMemberships: Asset['group_memberships'];
    showGroupIds: boolean;
    hoveredGroupId: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    isHovered: boolean;
    caption?: string;
    activeFilter?: LibraryFilter;
    assetId: string;
    onUntagAsset?: (assetId: string, personId: string) => void;
    asset: Asset;
    showFaces: boolean;
    debug: boolean;
    intent: TileIntent;
    isImageVisible: boolean;
    isScrollSettled: boolean;
}

function getFaceVisuals(facePersonId: string | undefined, activeFilter: LibraryFilter | undefined, showFaces: boolean): FaceOverlayVisuals {
    let highlightColor = facePersonId ? 'cyan' : 'rgba(0, 255, 0, 0.5)';
    let opacity = showFaces ? 0.4 : 0;
    let isFilteredPerson = false;

    if (activeFilter && facePersonId) {
        const personIndex = activeFilter.personIds.indexOf(facePersonId);
        if (personIndex !== -1) {
            highlightColor = PERSON_COLORS[personIndex % PERSON_COLORS.length];
            opacity = 1;
            isFilteredPerson = true;
        }
    }

    return { highlightColor, opacity, isFilteredPerson };
}

const SensitivityBadgeView: React.FC<{ badge: SensitivityBadge | null }> = ({ badge }) => {
    if (!badge) {return null;}

    const colorClass = badge.tone === 'error'
        ? 'bg-red-950/90 text-red-400 border-red-500/30'
        : 'bg-amber-950/90 text-amber-500 border-amber-500/30';

    return (
        <div
            className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-xs font-bold tracking-wider z-15 backdrop-blur-sm border select-none pointer-events-none ${colorClass}`}
        >
            {badge.label}
        </div>
    );
};

const StackBadge: React.FC<{ count: number | null | undefined }> = ({ count }) => {
    if (count == null || count <= 1) {return null;}

    return (
        <div className="absolute top-1.5 right-1.5 bg-blue-500/85 text-white rounded-full px-1.5 py-0.5 text-xs font-bold z-15 border border-white/20 backdrop-blur-sm flex items-center gap-1.5 shadow-md pointer-events-none">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {count}
        </div>
    );
};

const SelectedStarBadge: React.FC = () => (
    <div
        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-slate-900/90 text-amber-500 border border-indigo-500/50 flex items-center justify-center text-sm z-18 pointer-events-none shadow-lg"
    >
        ★
    </div>
);

const GroupModeBadge: React.FC<{ show: boolean }> = ({ show }) => {
    if (!show) {return null;}

    return (
        <div
            className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-slate-900/80 border border-content-secondary/25 text-blue-100 text-xs font-bold tracking-wider uppercase z-15 pointer-events-none"
        >
            Group
        </div>
    );
};

const GroupIdPills: React.FC<{
    memberships: Asset['group_memberships'];
    show: boolean;
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
}> = ({ memberships, show, hoveredGroupId, onHoveredGroupIdChange }) => {
    if (!show || !memberships || memberships.length === 0) {return null;}

    const pills = buildGroupIdPillModels(memberships);
    if (pills.length === 0) {return null;}

    return (
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 max-w-[70%] z-15 pointer-events-auto">
            {pills.map((pill) => (
                <span
                    key={pill.key}
                    title={pill.title}
                    onMouseEnter={() => onHoveredGroupIdChange?.(pill.key)}
                    onMouseLeave={() => onHoveredGroupIdChange?.(null)}
                    className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wider inline-flex items-center gap-1 pointer-events-auto transition-shadow"
                    style={{
                        background: pill.background,
                        borderColor: pill.borderColor,
                        borderWidth: hoveredGroupId === pill.key ? '2px' : '1px',
                        borderStyle: 'solid',
                        color: pill.textColor,
                        boxShadow: hoveredGroupId === pill.key
                            ? `0 0 0 1px ${pill.borderColor}, 0 2px 8px rgba(0,0,0,0.34)`
                            : '0 2px 6px rgba(0,0,0,0.28)',
                    }}
                >
                    <span className="opacity-95">{pill.symbol}</span>
                    <span>{pill.label}</span>
                </span>
            ))}
        </div>
    );
};

const CaptionOverlay: React.FC<{ show: boolean; caption?: string }> = ({ show, caption }) => {
    if (!show || !caption) {return null;}

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent pt-5 p-2 pointer-events-none animate-[fadeIn_0.15s_ease-in_forwards]">
            <p className="m-0 text-xs text-slate-200 leading-snug italic line-clamp-3">
                {caption}
            </p>
        </div>
    );
};

const DeclusterButton: React.FC<{
    visible: boolean;
    activeFilter?: LibraryFilter;
    assetId: string;
    onUntagAsset?: (assetId: string, personId: string) => void;
}> = ({ visible, activeFilter, assetId, onUntagAsset }) => {
    if (!visible || !activeFilter || activeFilter.type !== 'person_any' || activeFilter.personIds.length !== 1) {return null;}

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onUntagAsset?.(assetId, activeFilter.personIds[0]);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 bg-red-500/90 text-white border-none rounded px-2 py-0.5 text-xs font-bold cursor-pointer z-20 shadow-md"
        >
            Decluster
        </button>
    );
};

const FaceBoxes: React.FC<{ asset: Asset; showFaces: boolean; activeFilter?: LibraryFilter }> = ({ asset, showFaces, activeFilter }) => {
    if ((!showFaces && !activeFilter) || !asset.faces) {return null;}

    return (
        <>
            {asset.faces.map((face, i) => {
                const visuals = getFaceVisuals(face.person_id, activeFilter, showFaces);
                if (!showFaces && !visuals.isFilteredPerson) {return null;}

                return (
                    <div
                        key={i}
                        title={face.person_name || 'Unknown Person'}
                        className="absolute border-2 rounded-sm pointer-events-none z-10"
                        style={{
                            left: `${face.box.x * 100}%`,
                            top: `${face.box.y * 100}%`,
                            width: `${face.box.width * 100}%`,
                            height: `${face.box.height * 100}%`,
                            borderColor: visuals.highlightColor,
                            boxShadow: visuals.isFilteredPerson ? '0 0 10px rgba(0,0,0,0.5), inset 0 0 5px rgba(0,0,0,0.3)' : 'none',
                            opacity: visuals.opacity,
                        }}
                    />
                );
            })}
        </>
    );
};

const DebugIntent: React.FC<{ debug: boolean; intent: TileIntent }> = ({ debug, intent }) => {
    if (!debug) {return null;}

    return (
        <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 py-0.5 rounded-sm">
            {intent}
        </div>
    );
};


export const TileOverlays: React.FC<TileOverlaysProps> = ({
    selected,
    sensitivityBadge,
    stackCount,
    isGroupRepresentative,
    groupMemberships,
    showGroupIds,
    hoveredGroupId,
    onHoveredGroupIdChange,
    isHovered,
    caption,
    activeFilter,
    assetId,
    onUntagAsset,
    asset,
    showFaces,
    debug,
    intent,
    isImageVisible,
    isScrollSettled,
}) => {
    const overlayVisibility = getTileOverlayVisibility({
        isHovered,
        isScrollSettled,
        isImageVisible,
        showGroupIds,
        isGroupRepresentative,
    });

    return (
        <>
            {selected && <SelectedStarBadge />}
            <SensitivityBadgeView badge={sensitivityBadge} />
            <StackBadge count={overlayVisibility.showStackBadge ? stackCount : null} />
            <GroupModeBadge show={overlayVisibility.showGroupModeBadge} />
            <GroupIdPills
                memberships={groupMemberships}
                show={overlayVisibility.showGroupIdPills}
                hoveredGroupId={hoveredGroupId}
                onHoveredGroupIdChange={onHoveredGroupIdChange}
            />
            <CaptionOverlay show={overlayVisibility.showCaption} caption={caption} />
            <DeclusterButton visible={overlayVisibility.showDeclusterButton} activeFilter={activeFilter} assetId={assetId} onUntagAsset={onUntagAsset} />
            <FaceBoxes asset={asset} showFaces={showFaces} activeFilter={activeFilter} />
            <DebugIntent debug={debug} intent={intent} />
        </>
    );
};
