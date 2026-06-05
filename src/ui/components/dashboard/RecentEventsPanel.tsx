import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { RecentEventSnapshot } from '@contracts/jobs';
import { formatForEventLog, getEventToneForDisplay } from '@shared/utils/eventLogSummary';

type EventFilter = 'all' | string;

function formatTimestamp(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {return value;}
    return parsed.toLocaleTimeString();
}

function formatDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {return '';}
    return parsed.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getAvailableTypes(events: RecentEventSnapshot[]): string[] {
    return Array.from(new Set(events.map((event) => event.type))).sort((left, right) => left.localeCompare(right));
}

function useEventCopyReset(copiedEventId: string | null, setCopiedEventId: (value: string | null) => void) {
    useEffect(() => {
        if (!copiedEventId) {return;}
        const timer = globalThis.setTimeout(() => setCopiedEventId(null), 1500);
        return () => globalThis.clearTimeout(timer);
    }, [copiedEventId, setCopiedEventId]);
}

function EventsFilterBar(props: {
    readonly activeFilter: EventFilter;
    readonly eventTypes: string[];
    readonly filteredCount: number;
    readonly totalCount: number;
    readonly onChange: (value: EventFilter) => void;
}) {
    const { activeFilter, eventTypes, filteredCount, totalCount, onChange } = props;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="events-filter-select" className="text-xs uppercase tracking-widest text-content-secondary">Event Type</label>
            <select
                id="events-filter-select"
                value={activeFilter}
                onChange={(event) => onChange(event.target.value)}
                className="rounded-md border border-content/10 bg-surface-secondary px-3 py-2 text-xs text-content focus:outline-none focus:border-brand-accent"
            >
                <option value="all">All Types ({totalCount})</option>
                {eventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
            <div className="text-xs font-mono tracking-wider text-content-secondary">
                SHOWING {filteredCount} OF {totalCount}
            </div>
        </div>
    );
}

function CopyRawButton(props: {
    readonly eventId: string;
    readonly copiedEventId: string | null;
    readonly copyingEventId: string | null;
    readonly onCopy: (eventId: string) => void;
}) {
    const { eventId, copiedEventId, copyingEventId, onCopy } = props;
    const isCopied = copiedEventId === eventId;
    const isCopying = copyingEventId === eventId;
    const label = (function () {
        if (isCopied) {return 'Raw payload copied';}
        if (isCopying) {return 'Copying raw payload';}
        return 'Copy raw payload';
    }());

    return (
        <button
            onClick={() => onCopy(eventId)}
            disabled={isCopying}
            aria-label={label}
            title={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-content/10 bg-surface text-content hover:bg-surface-secondary disabled:cursor-wait disabled:opacity-60"
        >
            {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
    );
}

function EventsTable(props: {
    readonly events: RecentEventSnapshot[];
    readonly copiedEventId: string | null;
    readonly copyingEventId: string | null;
    readonly onCopy: (eventId: string) => void;
}) {
    const { events, copiedEventId, copyingEventId, onCopy } = props;
    return (
        <div className="rounded-xl border border-content/10 bg-surface-secondary overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-surface border-b border-content/10">
                        <tr className="text-xs uppercase tracking-widest text-content-secondary">
                            <th className="text-left px-3 py-2">Time</th>
                            <th className="text-left px-3 py-2">Type</th>
                            <th className="text-left px-3 py-2">Payload</th>
                            <th className="w-12 px-2 py-2 text-right">Raw</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => (
                             <tr key={event.id} className="border-b border-content/5 align-top">
                                <td className="px-3 py-2 text-xs whitespace-nowrap font-mono">
                                    <div className="text-content">{formatTimestamp(event.createdAt)}</div>
                                    <div className="mt-0.5 text-xs text-content-secondary">{formatDate(event.createdAt)}</div>
                                </td>
                                <td className="px-3 py-2 text-xs text-cyan-500 font-bold uppercase tracking-wide whitespace-nowrap">{event.type}</td>
                                <td className="px-3 py-2">
                                    <pre className={`text-xs leading-4 whitespace-pre-wrap break-all font-mono ${(function () {
                                        const tone = getEventToneForDisplay(event.payload);
                                        if (tone === 'error') {return 'text-red-400';}
                                        if (tone === 'warning') {return 'text-amber-400';}
                                        return 'text-content';
                                    }())}`}>
                                        {formatForEventLog(event.payload)}
                                    </pre>
                                </td>
                                <td className="px-2 py-2 text-right">
                                    <CopyRawButton
                                        eventId={event.id}
                                        copiedEventId={copiedEventId}
                                        copyingEventId={copyingEventId}
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

export const RecentEventsPanel: React.FC<{
    readonly events: RecentEventSnapshot[];
    readonly loading?: boolean;
    readonly onGetEventPayloadRaw: (eventId: string) => Promise<string>;
}> = ({ events, loading, onGetEventPayloadRaw }) => {
    const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
    const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
    const [copyingEventId, setCopyingEventId] = useState<string | null>(null);

    const eventTypes = useMemo(() => getAvailableTypes(events), [events]);
    const filteredEvents = useMemo(() => (
        activeFilter === 'all' ? events : events.filter((event) => event.type === activeFilter)
    ), [activeFilter, events]);

    useEffect(() => {
        if (activeFilter === 'all' || eventTypes.includes(activeFilter)) {return;}
        setActiveFilter('all');
    }, [activeFilter, eventTypes]);

    useEventCopyReset(copiedEventId, setCopiedEventId);

    const copyRawPayload = useCallback(async (eventId: string) => {
        try {
            setCopyingEventId(eventId);
            const payloadJson = await onGetEventPayloadRaw(eventId);
            await navigator.clipboard.writeText(payloadJson);
            setCopiedEventId(eventId);
        } catch (error) {
            console.error('Failed to copy raw event payload', error);
        } finally {
            setCopyingEventId((current) => current === eventId ? null : current);
        }
    }, [onGetEventPayloadRaw]);

    if (events.length === 0 && !loading) {
        return <div className="rounded-xl border border-content/10 bg-surface-secondary p-6 text-content-secondary">No recent events available.</div>;
    }

    return (
        <div className="space-y-4">
            <EventsFilterBar
                activeFilter={activeFilter}
                eventTypes={eventTypes}
                filteredCount={filteredEvents.length}
                totalCount={events.length}
                onChange={setActiveFilter}
            />
            <EventsTable
                events={filteredEvents}
                copiedEventId={copiedEventId}
                copyingEventId={copyingEventId}
                onCopy={(eventId) => { void copyRawPayload(eventId); }}
            />
        </div>
    );
};
