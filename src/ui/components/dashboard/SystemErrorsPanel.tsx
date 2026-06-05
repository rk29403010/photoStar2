import type React from 'react';
import type { JobErrorListItem, JobErrorModuleSummary, JobErrorSnapshot } from '@contracts/jobs';

function formatErrorDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function getSeverityClass(severity: string) {
    switch (severity) {
        case 'fatal':
            return 'text-rose-300 border-rose-500/30 bg-rose-500/10';
        case 'error':
            return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
        case 'warning':
            return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
        default:
            return 'text-content-secondary border-content/10 bg-surface';
    }
}

function getRangeLabel(total: number, currentPage: number, pageSize: number) {
    if (total === 0) {
        return 'No results';
    }
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    return `Showing ${start}-${end} of ${total}`;
}

const ErrorsHeader: React.FC<{
    readonly modules: JobErrorModuleSummary[];
    readonly moduleFilter: string | null;
    readonly onModuleFilterChange: (moduleId: string | null) => void;
}> = ({ modules, moduleFilter, onModuleFilterChange }) => (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-content">Job Errors</h3>
            <p className="mt-1 text-xs text-content-secondary">Paged history across failed jobs and processing issues.</p>
        </div>
        <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-widest text-content-secondary" htmlFor="dashboard-error-module-filter">Module</label>
            <select
                id="dashboard-error-module-filter"
                value={moduleFilter ?? ''}
                onChange={(event) => onModuleFilterChange(event.target.value || null)}
                className="rounded-md border border-content/20 bg-surface px-3 py-2 text-xs text-content outline-none transition-colors focus:border-brand-accent"
            >
                <option value="">All Modules</option>
                {modules.map((module) => (
                    <option key={module.id} value={module.id}>{`${module.label} (${module.errorCount})`}</option>
                ))}
            </select>
        </div>
    </div>
);

function ErrorMeta({ item }: { readonly item: JobErrorListItem }) {
    const meta = [item.jobId, item.task, item.stage].filter(Boolean).join(' • ');
    if (!meta) {return null;}
    return <div className="mt-1 text-xs text-content-secondary/70">{meta}</div>;
}

const ErrorsTable: React.FC<{
    readonly items: JobErrorListItem[];
    readonly loading?: boolean;
    readonly totalCount?: number;
}> = ({ items, loading }) => (
    <div className="overflow-hidden rounded-lg border border-content/10">
        <table className="min-w-full divide-y divide-content/10 text-left">
            <thead className="bg-surface text-xs uppercase tracking-widest text-content-secondary border-b border-content/10">
                <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Module</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-content/10 bg-surface-secondary text-sm text-content">
                {!loading && items.length === 0 && (
                    <tr>
                        <td className="px-4 py-8 text-center text-sm text-content-secondary" colSpan={4}>No job errors found for this filter.</td>
                    </tr>
                )}
                {items.map((item) => (
                    <tr key={item.id}>
                        <td className="px-4 py-3 align-top text-xs text-content-secondary">{formatErrorDate(item.createdAt)}</td>
                        <td className="px-4 py-3 align-top text-xs text-content">{item.moduleLabel}</td>
                        <td className="px-4 py-3 align-top">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-widest ${getSeverityClass(item.severity)}`}>
                                {item.severity}
                            </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                            <div className="text-sm text-content">{item.message}</div>
                            <ErrorMeta item={item} />
                        </td>
                    </tr>
                ))}
                {loading && (
                    <tr>
                        <td className="px-4 py-8 text-center text-sm text-content-secondary" colSpan={4}>Loading errors...</td>
                    </tr>
                )}
            </tbody>
        </table>
    </div>
);

const ErrorsPagination: React.FC<{
    readonly total: number;
    readonly currentPage: number;
    readonly pageSize: number;
    readonly onPageChange: (page: number) => void;
}> = ({ total, currentPage, pageSize, onPageChange }) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const canPrev = currentPage > 1;
    const canNext = currentPage < totalPages;

    return (
        <div className="flex items-center justify-between text-xs text-content-secondary">
            <span>{getRangeLabel(total, currentPage, pageSize)}</span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => canPrev && onPageChange(currentPage - 1)}
                    disabled={!canPrev}
                    className="rounded-md border border-content/10 px-3 py-1.5 text-xs text-content bg-surface transition-colors enabled:hover:border-content/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Previous
                </button>
                <span>{`Page ${currentPage} / ${totalPages}`}</span>
                <button
                    type="button"
                    onClick={() => canNext && onPageChange(currentPage + 1)}
                    disabled={!canNext}
                    className="rounded-md border border-content/10 px-3 py-1.5 text-xs text-content bg-surface transition-colors enabled:hover:border-content/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

function getSnapshotValues(snapshot: JobErrorSnapshot | null) {
    return {
        modules: snapshot?.availableModules ?? [],
        items: snapshot?.items ?? [],
        currentPage: snapshot?.page ?? 1,
        pageSize: snapshot?.pageSize ?? 25,
        total: snapshot?.total ?? 0,
    };
}

export const SystemErrorsPanel: React.FC<{
    readonly snapshot: JobErrorSnapshot | null;
    readonly loading?: boolean;
    readonly moduleFilter: string | null;
    readonly onModuleFilterChange: (moduleId: string | null) => void;
    readonly onPageChange: (page: number) => void;
}> = ({ snapshot, loading, moduleFilter, onModuleFilterChange, onPageChange }) => {
    const { modules, items, currentPage, pageSize, total } = getSnapshotValues(snapshot);

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-content/10 bg-surface-secondary p-4">
            <ErrorsHeader modules={modules} moduleFilter={moduleFilter} onModuleFilterChange={onModuleFilterChange} />
            <ErrorsTable items={items} loading={loading} />
            <ErrorsPagination total={total} currentPage={currentPage} pageSize={pageSize} onPageChange={onPageChange} />
        </div>
    );
};
