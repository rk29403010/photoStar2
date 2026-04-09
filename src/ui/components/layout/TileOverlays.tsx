import type { Asset, TileIntent } from '@contracts/core';
import { PERSON_COLORS } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { LIBRARY_SELECTION_FRAME_COLOR, LIBRARY_SELECTION_STAR_COLOR } from '@shared/utils/librarySelectionVisuals';
import { buildGroupIdPillModels } from './tileGroupIdModel';
import { getTileOverlayVisibility } from './tileOverlayModel';

export type SensitivityBadge = {
    label: string;
    color: string;
    bg: string;
};

interface FaceOverlayVisuals {
    highlightColor: string;
    opacity: number;
    isFilteredPerson: boolean;
}

interface TileOverlaysProps {
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

    return (
        <div
            style={{
                position: 'absolute',
                top: 6,
                left: 6,
                background: badge.bg,
                color: badge.color,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                zIndex: 15,
                backdropFilter: 'blur(4px)',
                border: `1px solid ${badge.color}44`,
                userSelect: 'none',
                pointerEvents: 'none',
            }}
        >
            {badge.label}
        </div>
    );
};

const StackBadge: React.FC<{ count: number | null | undefined }> = ({ count }) => {
    if (count == null || count <= 1) {return null;}

    return (
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(59, 130, 246, 0.85)', color: 'white', borderRadius: '12px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700, zIndex: 15, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 3, boxShadow: '0 2px 4px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
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
        style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: 'rgba(15,23,42,0.88)',
            color: LIBRARY_SELECTION_STAR_COLOR,
            border: `1px solid ${LIBRARY_SELECTION_FRAME_COLOR}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.95rem',
            zIndex: 18,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(2,6,23,0.45)',
        }}
    >
        ★
    </div>
);

const GroupModeBadge: React.FC<{ show: boolean }> = ({ show }) => {
    if (!show) {return null;}

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.82)',
                border: '1px solid rgba(148,163,184,0.25)',
                color: '#dbeafe',
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                zIndex: 15,
                pointerEvents: 'none',
            }}
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
        <div
            style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                maxWidth: '70%',
                zIndex: 15,
                pointerEvents: 'auto',
            }}
        >
            {pills.map((pill) => (
                <span
                    key={pill.key}
                    title={pill.title}
                    onMouseEnter={() => onHoveredGroupIdChange?.(pill.key)}
                    onMouseLeave={() => onHoveredGroupIdChange?.(null)}
                    style={{
                        padding: '3px 7px',
                        borderRadius: 999,
                        background: pill.background,
                        border: `${hoveredGroupId === pill.key ? 2 : 1}px solid ${pill.borderColor}`,
                        color: pill.textColor,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        boxShadow: hoveredGroupId === pill.key
                            ? `0 0 0 1px ${pill.borderColor}, 0 2px 8px rgba(0,0,0,0.34)`
                            : '0 2px 6px rgba(0,0,0,0.28)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        pointerEvents: 'auto',
                    }}
                >
                    <span style={{ opacity: 0.95 }}>{pill.symbol}</span>
                    <span>{pill.label}</span>
                </span>
            ))}
        </div>
    );
};

const CaptionOverlay: React.FC<{ show: boolean; caption?: string }> = ({ show, caption }) => {
    if (!show || !caption) {return null;}

    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)', padding: '20px 8px 8px', pointerEvents: 'none', animation: 'fadeIn 0.15s ease-in forwards' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#e2e8f0', lineHeight: 1.4, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', zIndex: 20, boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
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
                        style={{
                            position: 'absolute',
                            left: `${face.box.x * 100}%`,
                            top: `${face.box.y * 100}%`,
                            width: `${face.box.width * 100}%`,
                            height: `${face.box.height * 100}%`,
                            border: `2px solid ${visuals.highlightColor}`,
                            borderRadius: '2px',
                            boxShadow: visuals.isFilteredPerson ? '0 0 10px rgba(0,0,0,0.5), inset 0 0 5px rgba(0,0,0,0.3)' : 'none',
                            pointerEvents: 'none',
                            zIndex: 10,
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
        <div style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 2 }}>
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
    isScrollSettled,
}) => {
    const overlayVisibility = getTileOverlayVisibility({
        isHovered,
        isScrollSettled,
        showGroupIds,
        isGroupRepresentative,
    });

    return (
        <>
            {selected && <SelectedStarBadge />}
            <SensitivityBadgeView badge={sensitivityBadge} />
            <StackBadge count={stackCount} />
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
