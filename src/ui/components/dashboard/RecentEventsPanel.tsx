import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentEventSnapshot } from '@contracts/jobs';
import { formatForEventLog } from '@shared/utils/eventLogSummary';

type EventFilter = 'all' | string;

function formatTimestamp(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {return value;}
    return parsed.toLocaleTimeString();
}

function getAvailableTypes(events: RecentEventSnapshot[]): string[] {
    return Array.from(new Set(events.map((event) => event.type))).sort((left, right) => left.localeCompare(right));
}

function useEventCopyReset(copiedEventId: string | null, setCopiedEventId: (value: string | null) => void) {
    useEffect(() => {
        if (!copiedEventId) {return;}
        const timer = window.setTimeout(() => setCopiedEventId(null), 1500);
        return () => window.clearTimeout(timer);
    }, [copiedEventId, setCopiedEventId]);
}

function EventsFilterBar(props: {
    activeFilter: EventFilter;
    eventTypes: string[];
    filteredCount: number;
    totalCount: number;
    onChange: (value: EventFilter) => void;
}) {
    const { activeFilter, eventTypes, filteredCount, totalCount, onChange } = props;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-400">Event Type</label>
            <select
                value={activeFilter}
                onChange={(event) => onChange(event.target.value)}
                className="rounded-md border border-gray-700 bg-[#111111] px-3 py-2 text-xs text-gray-200"
            >
                <option value="all">All Types ({totalCount})</option>
                {eventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
            <div className="text-[10px] font-mono tracking-wider text-gray-400">
                SHOWING {filteredCount} OF {totalCount}
            </div>
        </div>
    );
}

function CopyRawButton(props: {
    eventId: string;
    copiedEventId: string | null;
    copyingEventId: string | null;
    onCopy: (eventId: string) => void;
}) {
    const { eventId, copiedEventId, copyingEventId, onCopy } = props;
    return (
        <button
            onClick={() => onCopy(eventId)}
            disabled={copyingEventId === eventId}
            className="rounded-md border border-gray-700 bg-[#161616] px-3 py-1.5 text-[10px] uppercase tracking-widest text-gray-200 hover:bg-[#1f1f1f] disabled:cursor-wait disabled:opacity-60"
        >
            {copiedEventId === eventId ? 'Copied' : copyingEventId === eventId ? 'Copying' : 'Copy Raw'}
        </button>
    );
}

function EventsTable(props: {
    events: RecentEventSnapshot[];
    copiedEventId: string | null;
    copyingEventId: string | null;
    onCopy: (eventId: string) => void;
}) {
    const { events, copiedEventId, copyingEventId, onCopy } = props;
    return (
        <div className="rounded-xl border border-gray-800 bg-[#111111] overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-[#151515] border-b border-gray-800">
                        <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                            <th className="text-left px-4 py-3">Time</th>
                            <th className="text-left px-4 py-3">Type</th>
                            <th className="text-left px-4 py-3">Payload</th>
                            <th className="text-right px-4 py-3">Raw</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => (
                            <tr key={event.id} className="border-b border-gray-900/80 align-top">
                                <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap font-mono">{formatTimestamp(event.createdAt)}</td>
                                <td className="px-4 py-3 text-[11px] text-cyan-300 uppercase tracking-wide whitespace-nowrap">{event.type}</td>
                                <td className="px-4 py-3">
                                    <pre className="text-[11px] text-gray-200 whitespace-pre-wrap break-all font-mono">
                                        {formatForEventLog(event.payload)}
                                    </pre>
                                </td>
                                <td className="px-4 py-3 text-right">
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
    events: RecentEventSnapshot[];
    loading?: boolean;
    onGetEventPayloadRaw: (eventId: string) => Promise<string>;
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
        return <div className="rounded-xl border border-gray-800 bg-[#111111] p-6 text-gray-300">No recent events available.</div>;
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
