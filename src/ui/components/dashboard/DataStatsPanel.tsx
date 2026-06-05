import type React from 'react';
import type { DataStatsSnapshot } from '@contracts/jobs';

const METRICS_GRID_STYLE = {
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

function MetricCard({ title, value, hint }: { readonly title: string; readonly value: string; readonly hint?: string }) {
    return (
        <div className="rounded-xl border border-content/10 bg-surface-secondary p-4">
            <div className="text-xs uppercase tracking-widest text-content-secondary">{title}</div>
            <div className="mt-2 text-2xl font-semibold text-content">{value}</div>
            {hint && <div className="mt-1 text-xs text-content-secondary">{hint}</div>}
        </div>
    );
}

function getEmptyStats(): DataStatsSnapshot {
    return {
        generatedAt: new Date().toISOString(),
        totals: {
            assets: 0,
            people: 0,
            photosWithAiMetadata: 0,
            photosWithDetectedFaces: 0,
            photosWithMatchedFaces: 0,
        },
        coverage: {
            aiMetadataPercent: 0,
            faceMatchedPercent: 0,
        },
        faces: {
            detected: 0,
            matched: 0,
            unmatched: 0,
        },
    };
}

export const DataStatsPanel: React.FC<{ readonly stats: DataStatsSnapshot | null; readonly loading?: boolean }> = ({ stats, loading }) => {
    if (!stats && !loading) {
        return (
            <div className="rounded-xl border border-content/10 bg-surface-secondary p-6 text-content-secondary">
                No data metrics available yet.
            </div>
        );
    }

    const values = stats || getEmptyStats();

    return (
        <div className="space-y-4">
            <div className="text-xs text-content-secondary font-mono tracking-wider">
                UPDATED {new Date(values.generatedAt).toLocaleTimeString()}
            </div>
            <div className="grid gap-4" style={METRICS_GRID_STYLE}>
                <MetricCard title="Photos" value={values.totals.assets.toLocaleString()} />
                <MetricCard title="People" value={values.totals.people.toLocaleString()} />
                <MetricCard title="AI Metadata Coverage" value={`${values.totals.photosWithAiMetadata.toLocaleString()} (${formatPercent(values.coverage.aiMetadataPercent)})`} hint="photos with extended metadata" />
                <MetricCard title="Face Match Coverage" value={`${values.totals.photosWithMatchedFaces.toLocaleString()} (${formatPercent(values.coverage.faceMatchedPercent)})`} hint={`of ${values.totals.photosWithDetectedFaces.toLocaleString()} photos with detected faces`} />
                <MetricCard title="Detected Faces" value={values.faces.detected.toLocaleString()} hint={`${values.faces.matched.toLocaleString()} matched, ${values.faces.unmatched.toLocaleString()} unmatched`} />
            </div>
        </div>
    );
};
