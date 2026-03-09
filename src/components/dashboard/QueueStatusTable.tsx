import type React from 'react';
import type { QueueStatusSnapshot } from '../../../shared/types/jobs';

function formatAge(iso?: string | null) {
    if (!iso) {return '--';}
    const created = new Date(iso).getTime();
    if (Number.isNaN(created)) {return '--';}
    const diffSecs = Math.max(0, Math.floor((Date.now() - created) / 1000));
    if (diffSecs < 60) {return `${diffSecs}s`;}
    const mins = Math.floor(diffSecs / 60);
    if (mins < 60) {return `${mins}m`;}
    const hours = Math.floor(mins / 60);
    if (hours < 24) {return `${hours}h ${mins % 60}m`;}
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

function formatStageLabel(stage: string) {
    if (stage === 'ai_metadata_3f') {return 'AI Metadata 3F';}
    if (stage === 'ai_metadata_31p') {return 'AI Metadata 31P';}
    return stage.replace(/_/g, ' ');
}

export const QueueStatusTable: React.FC<{ rows: QueueStatusSnapshot['stages']; loading?: boolean }> = ({ rows, loading }) => {
    if ((!rows || rows.length === 0) && !loading) {
        return (
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-6 text-gray-300">
                Coordinator queue is empty.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-[#111111] overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-[#151515] border-b border-gray-800">
                    <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                        <th className="text-left px-4 py-3">Stage</th>
                        <th className="text-right px-4 py-3">Pending</th>
                        <th className="text-right px-4 py-3">Processing</th>
                        <th className="text-right px-4 py-3">Completed</th>
                        <th className="text-right px-4 py-3">Failed</th>
                        <th className="text-right px-4 py-3">Workers</th>
                        <th className="text-left px-4 py-3">Oldest Pending</th>
                        <th className="text-left px-4 py-3">Processing Items</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.stage} className="border-b border-gray-900/80 hover:bg-[#161616]">
                            <td className="px-4 py-3 font-medium text-gray-200 uppercase tracking-wide text-[11px]">{formatStageLabel(row.stage)}</td>
                            <td className={`px-4 py-3 text-right font-mono ${row.pending > 0 ? 'text-amber-300' : 'text-gray-400'}`}>{row.pending}</td>
                            <td className={`px-4 py-3 text-right font-mono ${row.processing > 0 ? 'text-cyan-300' : 'text-gray-400'}`}>{row.processing}</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-300">{row.completed}</td>
                            <td className={`px-4 py-3 text-right font-mono ${row.failed > 0 ? 'text-rose-400' : 'text-gray-400'}`}>{row.failed}</td>
                            <td className={`px-4 py-3 text-right font-mono ${row.runningJobs > 0 ? 'text-cyan-200' : 'text-gray-400'}`}>{row.runningJobs}</td>
                            <td className="px-4 py-3 text-[11px] text-gray-300">{formatAge(row.oldestPendingAt || row.oldestProcessingAt)}</td>
                            <td className="px-4 py-3 text-[11px] text-gray-300 font-mono truncate max-w-[360px]">{row.processingMediaIds.length > 0 ? row.processingMediaIds.join(', ') : '--'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
