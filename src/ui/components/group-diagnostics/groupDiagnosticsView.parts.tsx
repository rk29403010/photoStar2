import { Check, Copy } from 'lucide-react';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { resolveImageUrl } from '@boundary/runtime/backend';

export type DiagnosticsGroup = GroupDiagnosticsReport['groups'][number];
type DiagnosticsAsset = DiagnosticsGroup['assets'][number];
type DiagnosticsChildGroup = DiagnosticsGroup['children'][number];
type DiagnosticsMembership = DiagnosticsAsset['groups'][number];
export type CopyTarget = string;

function DiagnosticsThumbnail(props: {
    readonly alt: string;
    readonly label: string;
    readonly previewPath: string | null;
    readonly size?: number;
}) {
    const size = props.size ?? 44;
    const imageUrl = resolveImageUrl(props.previewPath);

    return (
        <div
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                flexShrink: 0,
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid rgba(148,163,184,0.2)',
                background: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontSize: '0.7rem',
                fontWeight: 700,
            }}
            title={props.alt}
        >
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt={props.alt}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
            ) : (
                <span>{props.label}</span>
            )}
        </div>
    );
}

function DiagnosticsMembershipChip(props: {
    readonly currentGroupId: string;
    readonly membership: DiagnosticsMembership;
    readonly onJumpToGroup: (groupId: string) => void;
}) {
    const { currentGroupId, membership, onJumpToGroup } = props;
    const isParentLink = membership.groupId !== currentGroupId;
    const title = isParentLink
        ? `Jump to ${membership.groupId} (${membership.groupType})`
        : `${membership.groupId} (${membership.groupType})`;

    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                if (!isParentLink) {
                    return;
                }
                onJumpToGroup(membership.groupId);
            }}
            title={title}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px 4px 4px',
                borderRadius: 999,
                border: '1px solid rgba(56,189,248,0.22)',
                background: 'rgba(8,145,178,0.12)',
                color: '#bae6fd',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: isParentLink ? 'pointer' : 'default',
            }}
        >
            <DiagnosticsThumbnail
                alt={`Representative for ${membership.groupId}`}
                label={membership.groupId.slice(-2).toUpperCase()}
                previewPath={membership.representativePreviewPath}
                size={22}
            />
            <span>{membership.groupId.slice(-4)}</span>
            <span style={{ color: '#7dd3fc' }}>{membership.groupType}</span>
            {isParentLink && <span aria-hidden="true">⬆️</span>}
        </button>
    );
}

function CopyIconButton(props: {
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly label: string;
    readonly onCopy: (target: CopyTarget, value: string) => void;
    readonly target: CopyTarget;
    readonly value: string;
}) {
    const { copiedTarget, copyingTarget, label, onCopy, target, value } = props;
    const isCopied = copiedTarget === target;
    const isCopying = copyingTarget === target;
    const title = (function () {
        if (isCopied) {return `${label} copied`;}
        if (isCopying) {return `Copying ${label.toLowerCase()}`;}
        return `Copy ${label.toLowerCase()}`;
    }());

    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                void onCopy(target, value);
            }}
            disabled={isCopying}
            aria-label={title}
            title={title}
            style={{
                display: 'inline-flex',
                width: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(15,23,42,0.9)',
                color: isCopied ? '#a7f3d0' : '#cbd5e1',
                cursor: isCopying ? 'wait' : 'pointer',
                flexShrink: 0,
            }}
        >
            {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
    );
}

function GroupLabelWithCopy(props: {
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly groupId: string;
    readonly groupType: string;
    readonly onCopy: (target: CopyTarget, value: string) => void;
    readonly prefix?: string;
}) {
    const { copiedTarget, copyingTarget, groupId, groupType, onCopy, prefix = 'Group' } = props;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>
                {prefix} {groupId.slice(-4)} <span style={{ color: '#7dd3fc', fontWeight: 500 }}>({groupType})</span>
            </div>
            <CopyIconButton
                copiedTarget={copiedTarget}
                copyingTarget={copyingTarget}
                label="group ID"
                onCopy={onCopy}
                target={`group:${groupId}`}
                value={groupId}
            />
        </div>
    );
}

function GroupDiagnosticsHeader(props: {
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly group: DiagnosticsGroup;
    readonly onCopy: (target: CopyTarget, value: string) => void;
    readonly onToggle: () => void;
}) {
    const { copiedTarget, copyingTarget, group, onCopy, onToggle } = props;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggle();
                }
            }}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <DiagnosticsThumbnail
                    alt={`Representative for ${group.groupId}`}
                    label={group.groupId.slice(-2).toUpperCase()}
                    previewPath={group.representativePreviewPath}
                    size={48}
                />
                <div>
                    <GroupLabelWithCopy
                        copiedTarget={copiedTarget}
                        copyingTarget={copyingTarget}
                        groupId={group.groupId}
                        groupType={group.groupType}
                        onCopy={onCopy}
                    />
                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 4 }}>{group.summary}</div>
                    {group.representativeAssetId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.8rem', marginTop: 4 }}>
                            <span>Starred: {group.representativeAssetId}</span>
                            <CopyIconButton
                                copiedTarget={copiedTarget}
                                copyingTarget={copyingTarget}
                                label="photo ID"
                                onCopy={onCopy}
                                target={`photo:${group.representativeAssetId}`}
                                value={group.representativeAssetId}
                            />
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.fileCount} direct files</span>
                <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.descendantFileCount} descendant files</span>
                <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.directChildGroupCount} child groups</span>
                <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.underlyingImageEstimate} est. images</span>
            </div>
        </div>
    );
}

function ChildGroupRow(props: {
    readonly child: DiagnosticsChildGroup;
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly onCopy: (target: CopyTarget, value: string) => void;
}) {
    const { child, copiedTarget, copyingTarget, onCopy } = props;

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(56,189,248,0.18)',
                background: 'rgba(15,23,42,0.75)',
                color: '#e2e8f0',
                marginLeft: 28,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <DiagnosticsThumbnail
                    alt={`Representative for child group ${child.groupId}`}
                    label={child.groupId.slice(-2).toUpperCase()}
                    previewPath={child.representativePreviewPath}
                    size={36}
                />
                <div>
                    <GroupLabelWithCopy
                        copiedTarget={copiedTarget}
                        copyingTarget={copyingTarget}
                        groupId={child.groupId}
                        groupType={child.groupType}
                        onCopy={onCopy}
                    />
                    {child.representativeAssetId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>
                            <span>Starred: {child.representativeAssetId}</span>
                            <CopyIconButton
                                copiedTarget={copiedTarget}
                                copyingTarget={copyingTarget}
                                label="photo ID"
                                onCopy={onCopy}
                                target={`photo:${child.representativeAssetId}`}
                                value={child.representativeAssetId}
                            />
                        </div>
                    )}
                </div>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                {child.descendantFileCount} descendant files
            </span>
        </div>
    );
}

function AssetMembershipRow(props: {
    readonly asset: DiagnosticsAsset;
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly onAssetClick?: (id: string) => void;
    readonly onCopy: (target: CopyTarget, value: string) => void;
    readonly onJumpToGroup: (groupId: string) => void;
    readonly parentGroupId: string;
}) {
    const {
        asset,
        copiedTarget,
        copyingTarget,
        onAssetClick,
        onCopy,
        onJumpToGroup,
        parentGroupId,
    } = props;

    return (
        <div
            role={onAssetClick ? 'button' : undefined}
            tabIndex={onAssetClick ? 0 : undefined}
            onClick={() => onAssetClick?.(asset.assetId)}
            onKeyDown={(event) => {
                if (!onAssetClick) {
                    return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onAssetClick(asset.assetId);
                }
            }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.12)', background: '#020617', color: '#e5e7eb', cursor: onAssetClick ? 'pointer' : 'default' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <DiagnosticsThumbnail
                    alt={`Preview for ${asset.assetId}`}
                    label={asset.assetId.slice(-2).toUpperCase()}
                    previewPath={asset.previewPath}
                    size={40}
                />
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600 }}>{asset.assetId}</div>
                        <CopyIconButton
                            copiedTarget={copiedTarget}
                            copyingTarget={copyingTarget}
                            label="photo ID"
                            onCopy={onCopy}
                            target={`photo:${asset.assetId}`}
                            value={asset.assetId}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.8rem', marginTop: 4, minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.originalPath}</span>
                        <CopyIconButton
                            copiedTarget={copiedTarget}
                            copyingTarget={copyingTarget}
                            label="filename"
                            onCopy={onCopy}
                            target={`path:${asset.assetId}`}
                            value={asset.originalPath}
                        />
                    </div>
                    {asset.groups.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {asset.groups.map((membership) => (
                                <DiagnosticsMembershipChip
                                    currentGroupId={parentGroupId}
                                    key={`${asset.assetId}-${membership.groupId}`}
                                    membership={membership}
                                    onJumpToGroup={onJumpToGroup}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {asset.membershipCount > 1 && (
                <span style={{ color: '#94a3b8', fontSize: '0.85rem', flexShrink: 0 }}>{asset.membershipCount} memberships</span>
            )}
        </div>
    );
}

export function GroupDiagnosticsRow(props: {
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly expanded: boolean;
    readonly group: DiagnosticsGroup;
    readonly onAssetClick?: (id: string) => void;
    readonly onCopy: (target: CopyTarget, value: string) => void;
    readonly onJumpToGroup: (groupId: string) => void;
    readonly onToggle: () => void;
    readonly registerGroupElement: (groupId: string, element: HTMLDivElement | null) => void;
}) {
    const {
        copiedTarget,
        copyingTarget,
        expanded,
        group,
        onCopy,
        onJumpToGroup,
        onToggle,
        registerGroupElement,
    } = props;

    return (
        <div
            ref={(element) => registerGroupElement(group.groupId, element)}
            style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, background: '#0f172a', padding: 14 }}
        >
            <GroupDiagnosticsHeader
                copiedTarget={copiedTarget}
                copyingTarget={copyingTarget}
                group={group}
                onCopy={onCopy}
                onToggle={onToggle}
            />
            {expanded && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {group.children.length > 0 && (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {group.children.map((child) => (
                                <ChildGroupRow
                                    key={child.groupId}
                                    child={child}
                                    copiedTarget={copiedTarget}
                                    copyingTarget={copyingTarget}
                                    onCopy={onCopy}
                                />
                            ))}
                        </div>
                    )}
                    {group.assets.map((asset) => (
                        <AssetMembershipRow
                            key={asset.assetId}
                            asset={asset}
                            copiedTarget={copiedTarget}
                            copyingTarget={copyingTarget}
                            onAssetClick={props.onAssetClick}
                            onCopy={onCopy}
                            onJumpToGroup={onJumpToGroup}
                            parentGroupId={group.groupId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
