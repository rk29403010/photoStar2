import type React from 'react';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import { formatUiFeedEntriesForClipboard, formatUiFeedEntryForClipboard } from '@shared/utils/libraryUiDiagnostics';

type UiFeedPanelProps = {
    readonly entries: UiFeedEntry[];
}

type CopyTarget = 'all' | (string & { _?: never });

function getSourceLabel(source: UiFeedEntry['source']): string {
    if (source === 'asset_response') {return 'ASSET';}
    if (source === 'workflow_poll') {return 'POLL';}
    return 'EVENT';
}

function formatTimestamp(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {return value;}
    return parsed.toLocaleTimeString();
}

function formatCellNumber(value: number | undefined): string {
    return value === undefined ? '-' : String(value);
}

function useCopyReset(copiedTarget: CopyTarget | null, setCopiedTarget: (value: CopyTarget | null) => void) {
    useEffect(() => {
        if (!copiedTarget) {return;}
        const timer = globalThis.setTimeout(() => setCopiedTarget(null), 1500);
        return () => globalThis.clearTimeout(timer);
    }, [copiedTarget, setCopiedTarget]);
}

function CopyButton(props: {
    readonly target: CopyTarget;
    readonly label: string;
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly onCopy: (target: CopyTarget) => void;
}) {
    const { target, label, copiedTarget, copyingTarget, onCopy } = props;
    const isCopied = copiedTarget === target;
    const isCopying = copyingTarget === target;
    const title = (function () {
        if (isCopied) {return `${label} copied`;}
        if (isCopying) {return `Copying ${label.toLowerCase()}`;}
        return label;
    }());

    return (
        <button
            onClick={() => onCopy(target)}
            disabled={isCopying}
            title={title}
            aria-label={title}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-content/10 bg-surface px-3 text-xs font-semibold uppercase tracking-wide text-content hover:bg-surface-secondary disabled:cursor-wait disabled:opacity-60"
        >
            {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{isCopied ? 'Copied' : label}</span>
        </button>
    );
}

function UiFeedHeader(props: {
    readonly entryCount: number;
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly onCopy: (target: CopyTarget) => void;
}) {
    const { entryCount, copiedTarget, copyingTarget, onCopy } = props;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-content/10 bg-surface-secondary p-4">
            <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">UI Feed</div>
                <h3 className="mt-1 text-lg font-medium text-content">Frontend received messages</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs uppercase tracking-widest text-content-secondary/70">{entryCount} entries</div>
                <CopyButton
                    target="all"
                    label="Copy all"
                    copiedTarget={copiedTarget}
                    copyingTarget={copyingTarget}
                    onCopy={onCopy}
                />
            </div>
        </div>
    );
}

function UiFeedTable(props: {
    readonly entries: UiFeedEntry[];
    readonly copiedTarget: CopyTarget | null;
    readonly copyingTarget: CopyTarget | null;
    readonly onCopy: (target: CopyTarget) => void;
}) {
    const { entries, copiedTarget, copyingTarget, onCopy } = props;
    return (
        <div className="overflow-hidden rounded-xl border border-content/10 bg-surface-secondary">
            <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 border-b border-content/10 bg-surface">
                        <tr className="text-xs uppercase tracking-widest text-content-secondary">
                            <th className="px-3 py-2 text-left">Time</th>
                            <th className="px-3 py-2 text-left">Source</th>
                            <th className="px-3 py-2 text-left">Label</th>
                            <th className="px-3 py-2 text-left">Request</th>
                            <th className="px-3 py-2 text-right">Assets</th>
                            <th className="px-3 py-2 text-right">Previews</th>
                            <th className="px-3 py-2 text-right">Before</th>
                            <th className="px-3 py-2 text-right">After</th>
                            <th className="px-3 py-2 text-left">Applied</th>
                            <th className="px-3 py-2 text-left">Detail</th>
                            <th className="px-3 py-2 text-right">Copy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr key={entry.id} className="border-b border-content/5 align-top">
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-content-secondary">{formatTimestamp(entry.timestamp)}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-cyan-500 font-bold">{getSourceLabel(entry.source)}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-content font-medium">{entry.label}</td>
                                <td className="px-3 py-2 font-mono text-xs text-content-secondary/70">{entry.requestId ?? '-'}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs text-content-secondary">{formatCellNumber(entry.assetCount)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs text-content-secondary">{formatCellNumber(entry.previewCount)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs text-content-secondary">{formatCellNumber(entry.previousAssetCount)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs text-content-secondary">{formatCellNumber(entry.nextAssetCount)}</td>
                                <td className="px-3 py-2 text-xs text-content-secondary">
                                    {(function () {
                                        if (entry.applied === undefined) {return '-';}
                                        return entry.applied ? 'yes' : 'no';
                                    }())}
                                </td>
                                <td className="min-w-90 sm:min-w-full px-3 py-2 font-mono text-xs leading-4 text-content">{entry.detail}</td>
                                <td className="px-3 py-2 text-right">
                                    <CopyButton
                                        target={entry.id}
                                        label="Copy row"
                                        copiedTarget={copiedTarget}
                                        copyingTarget={copyingTarget}
                                        onCopy={onCopy}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export const UiFeedPanel: React.FC<UiFeedPanelProps> = ({ entries }) => {
    const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
    const [copyingTarget, setCopyingTarget] = useState<CopyTarget | null>(null);

    useCopyReset(copiedTarget, setCopiedTarget);

    const copyEntry = useCallback(async (target: CopyTarget) => {
        const entry = target === 'all' ? null : entries.find((candidate) => candidate.id === target);
        if (target !== 'all' && !entry) {
            return;
        }

        try {
            setCopyingTarget(target);
            const text = target === 'all'
                ? formatUiFeedEntriesForClipboard(entries)
                : formatUiFeedEntryForClipboard(entry as UiFeedEntry);
            await navigator.clipboard.writeText(text);
            setCopiedTarget(target);
        } catch (error) {
            console.error('Failed to copy UI feed diagnostics', error);
        } finally {
            setCopyingTarget((current) => current === target ? null : current);
        }
    }, [entries]);

    if (entries.length === 0) {
        return (
            <section className="rounded-xl border border-content/10 bg-surface-secondary p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-content-secondary">UI Feed</div>
                <p className="mt-3 text-sm text-content-secondary">No frontend diagnostics captured yet.</p>
            </section>
        );
    }

    return (
        <section className="space-y-4">
            <UiFeedHeader
                entryCount={entries.length}
                copiedTarget={copiedTarget}
                copyingTarget={copyingTarget}
                onCopy={(target) => { void copyEntry(target); }}
            />
            <UiFeedTable
                entries={entries}
                copiedTarget={copiedTarget}
                copyingTarget={copyingTarget}
                onCopy={(target) => { void copyEntry(target); }}
            />
        </section>
    );
};
