import { useMemo, useState } from 'react';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { filterDiagnosticsGroups, type GroupDiagnosticsFilterMode } from './groupDiagnosticsViewModel';

interface GroupingDiagnosticsViewProps {
    report: GroupDiagnosticsReport | null;
    loading: boolean;
    onRefresh: () => void;
    onAssetClick?: (id: string) => void;
}

function DiagnosticsActionButton(props: { active?: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.18)',
                background: props.active ? 'rgba(37,99,235,0.22)' : '#0f172a',
                color: '#e2e8f0',
                cursor: 'pointer',
            }}
        >
            {props.label}
        </button>
    );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ background: '#111827', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, padding: '12px 14px', minWidth: 140 }}>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{value}</div>
        </div>
    );
}

function EmptyDiagnosticsState({ onRefresh }: Pick<GroupingDiagnosticsViewProps, 'onRefresh'>) {
    return (
        <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#cbd5e1' }}>No grouping diagnostics loaded yet.</p>
            <button type="button" onClick={onRefresh} style={{ width: 'fit-content', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.45)', background: 'rgba(8,145,178,0.16)', color: '#a5f3fc', cursor: 'pointer' }}>
                Load report
            </button>
        </div>
    );
}

function GroupDiagnosticsRow(props: {
    expanded: boolean;
    group: GroupDiagnosticsReport['groups'][number];
    onAssetClick?: (id: string) => void;
    onToggle: () => void;
}) {
    const { expanded, group, onAssetClick, onToggle } = props;

    return (
        <div style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, background: '#0f172a', padding: 14 }}>
            <button
                type="button"
                onClick={onToggle}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
                <div>
                    <div style={{ fontWeight: 700 }}>{group.groupId.slice(-4)} <span style={{ color: '#7dd3fc', fontWeight: 500 }}>({group.groupType})</span></div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 4 }}>{group.summary}</div>
                    {group.representativeAssetId && (
                        <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 4 }}>
                            Representative: {group.representativeAssetId}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.fileCount} direct files</span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.descendantFileCount} descendant files</span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.directChildGroupCount} child groups</span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{group.underlyingImageEstimate} est. images</span>
                </div>
            </button>
            {expanded && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {group.children.length > 0 && (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {group.children.map((child) => (
                                <div
                                    key={child.groupId}
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
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600 }}>
                                            {child.groupId.slice(-4)} <span style={{ color: '#7dd3fc' }}>({child.groupType})</span>
                                        </div>
                                        {child.representativeAssetId && (
                                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>
                                                Representative: {child.representativeAssetId}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                        {child.descendantFileCount} descendant files
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {group.assets.map((asset) => (
                        <button
                            key={asset.assetId}
                            type="button"
                            onClick={() => onAssetClick?.(asset.assetId)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.12)', background: '#020617', color: '#e5e7eb', cursor: onAssetClick ? 'pointer' : 'default' }}
                        >
                            <span style={{ fontWeight: 600 }}>{asset.assetId}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{asset.membershipCount} memberships</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function GroupingDiagnosticsView(props: GroupingDiagnosticsViewProps) {
    const [filterMode, setFilterMode] = useState<GroupDiagnosticsFilterMode>('suspicious');
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

    const visibleGroups = useMemo(() => (
        props.report ? filterDiagnosticsGroups(props.report.groups, filterMode) : []
    ), [filterMode, props.report]);

    if (props.loading) {
        return <div style={{ flex: 1, padding: 24, color: '#cbd5e1' }}>Loading grouping diagnostics...</div>;
    }

    if (!props.report) {
        return <EmptyDiagnosticsState onRefresh={props.onRefresh} />;
    }

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#020617', color: '#e2e8f0', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Grouping Diagnostics</h2>
                    <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>Inspect suspicious overlaps, collapse inflation, and group structure.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <DiagnosticsActionButton active={filterMode === 'suspicious'} label="Suspicious only" onClick={() => setFilterMode('suspicious')} />
                    <DiagnosticsActionButton active={filterMode === 'all'} label="All" onClick={() => setFilterMode('all')} />
                    <button type="button" onClick={props.onRefresh} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.45)', background: 'rgba(8,145,178,0.16)', color: '#a5f3fc', cursor: 'pointer' }}>
                        Refresh
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <SummaryCard label="Assets" value={props.report.summary.totalAssets} />
                <SummaryCard label="Groups" value={props.report.summary.totalGroups} />
                <SummaryCard label="Memberships" value={props.report.summary.totalMemberships} />
                <SummaryCard label="Overlaps" value={props.report.summary.overlappingAssetCount} />
                <SummaryCard label="Suspicious" value={props.report.summary.suspiciousGroupCount} />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
                {visibleGroups.map((group) => {
                    return (
                        <GroupDiagnosticsRow
                            key={group.groupId}
                            expanded={expandedGroupIds.has(group.groupId)}
                            group={group}
                            onAssetClick={props.onAssetClick}
                            onToggle={() => {
                                setExpandedGroupIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(group.groupId)) {
                                        next.delete(group.groupId);
                                    } else {
                                        next.add(group.groupId);
                                    }
                                    return next;
                                });
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
