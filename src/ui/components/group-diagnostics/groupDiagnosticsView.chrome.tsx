import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';

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

export function EmptyDiagnosticsState({ onRefresh }: { onRefresh: () => void }) {
    return (
        <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#cbd5e1' }}>No grouping diagnostics loaded yet.</p>
            <button type="button" onClick={onRefresh} style={{ width: 'fit-content', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.45)', background: 'rgba(8,145,178,0.16)', color: '#a5f3fc', cursor: 'pointer' }}>
                Load report
            </button>
        </div>
    );
}

export function DiagnosticsToolbar(props: {
    filterMode: 'suspicious' | 'all';
    onRefresh: () => void;
    setFilterMode: (mode: 'suspicious' | 'all') => void;
}) {
    const { filterMode, onRefresh, setFilterMode } = props;

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Grouping Diagnostics</h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>Inspect suspicious overlaps, collapse inflation, and group structure.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <DiagnosticsActionButton active={filterMode === 'suspicious'} label="Suspicious only" onClick={() => setFilterMode('suspicious')} />
                <DiagnosticsActionButton active={filterMode === 'all'} label="All" onClick={() => setFilterMode('all')} />
                <button type="button" onClick={onRefresh} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.45)', background: 'rgba(8,145,178,0.16)', color: '#a5f3fc', cursor: 'pointer' }}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

export function DiagnosticsSummaryCards(props: { report: GroupDiagnosticsReport }) {
    const { report } = props;

    return (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <SummaryCard label="Assets" value={report.summary.totalAssets} />
            <SummaryCard label="Groups" value={report.summary.totalGroups} />
            <SummaryCard label="Memberships" value={report.summary.totalMemberships} />
            <SummaryCard label="Overlaps" value={report.summary.overlappingAssetCount} />
            <SummaryCard label="Suspicious" value={report.summary.suspiciousGroupCount} />
        </div>
    );
}
