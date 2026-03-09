import type React from 'react';
import type { DataStatsSnapshot } from '../../../shared/types/jobs';

function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

function formatQuotaBlockReason(reason: 'rate_limit' | 'daily_quota'): string {
    return reason === 'daily_quota' ? 'Daily quota' : 'Rate limit';
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
            pendingProAnalysis: 0,
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
        aiMetadataQueues: {
            freshPending: 0,
            freshProcessing: 0,
            freshFailed: 0,
            proPending: 0,
            proProcessing: 0,
            proFailed: 0,
            proCompleted: 0,
        },
        lastAiMetadataQuotaBlock: null,
    };
}

function getQuotaBlockDisplay(stats: DataStatsSnapshot) {
    const block = stats.lastAiMetadataQuotaBlock;
    if (!block) {
        return {
            value: 'None recorded',
            hint: 'no quota warning events captured'
        };
    }

    return {
        value: `${formatQuotaBlockReason(block.reason)} on ${block.model}`,
        hint: `${block.affectedCount.toLocaleString()} affected${block.fallbackModel ? `, fallback ${block.fallbackModel}` : ''}`
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
    const quotaBlock = getQuotaBlockDisplay(values);

    return (
        <div className="space-y-4">
            <div className="text-[10px] text-gray-400 font-mono tracking-wider">
                UPDATED {new Date(values.generatedAt).toLocaleTimeString()}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <MetricCard title="Photos" value={values.totals.assets.toLocaleString()} />
                <MetricCard title="People" value={values.totals.people.toLocaleString()} />
                <MetricCard title="AI Metadata Coverage" value={`${values.totals.photosWithAiMetadata.toLocaleString()} (${formatPercent(values.coverage.aiMetadataPercent)})`} hint="photos with extended metadata" />
                <MetricCard title="Face Match Coverage" value={`${values.totals.photosWithMatchedFaces.toLocaleString()} (${formatPercent(values.coverage.faceMatchedPercent)})`} hint={`of ${values.totals.photosWithDetectedFaces.toLocaleString()} photos with detected faces`} />
                <MetricCard title="Detected Faces" value={values.faces.detected.toLocaleString()} hint={`${values.faces.matched.toLocaleString()} matched, ${values.faces.unmatched.toLocaleString()} unmatched`} />
                <MetricCard title="Pending Pro Analysis" value={values.totals.pendingProAnalysis.toLocaleString()} hint="queued after quota/rate-limit fallback" />
                <MetricCard title="3F Queue" value={`${values.aiMetadataQueues.freshPending.toLocaleString()} pending`} hint={`${values.aiMetadataQueues.freshProcessing.toLocaleString()} processing, ${values.aiMetadataQueues.freshFailed.toLocaleString()} failed`} />
                <MetricCard title="31P Queue" value={`${values.aiMetadataQueues.proPending.toLocaleString()} pending`} hint={`${values.aiMetadataQueues.proProcessing.toLocaleString()} processing, ${values.aiMetadataQueues.proFailed.toLocaleString()} failed`} />
                <MetricCard title="31P Completed" value={values.aiMetadataQueues.proCompleted.toLocaleString()} hint="completed pro-upgrade queue rows" />
                <MetricCard title="Last Quota Block" value={quotaBlock.value} hint={quotaBlock.hint} />
            </div>
        </div>
    );
};
