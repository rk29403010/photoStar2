import type React from 'react';
import type { DataStatsSnapshot } from '@contracts/jobs';

const METRICS_GRID_STYLE = {
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-gray-800 bg-[#111111] p-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400">{title}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-100">{value}</div>
            {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
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

export const DataStatsPanel: React.FC<{ stats: DataStatsSnapshot | null; loading?: boolean }> = ({ stats, loading }) => {
    if (!stats && !loading) {
        return (
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-6 text-gray-300">
                No data metrics available yet.
            </div>
        );
    }

    const values = stats || getEmptyStats();

    return (
        <div className="space-y-4">
            <div className="text-[10px] text-gray-400 font-mono tracking-wider">
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
