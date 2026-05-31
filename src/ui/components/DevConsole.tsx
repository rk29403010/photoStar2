import { useState, useEffect, useRef, useCallback } from 'react';
import { formatForEventLog, getEventToneForDisplay } from '@shared/utils/eventLogSummary';
import {
    createConsoleEntryIdFactory,
    createUnreadConsoleCounts,
    getConsoleToggleTone,
    getNextUnreadConsoleCounts,
    normalizeConsoleMessage,
    type ConsoleEntryLevel,
    type UnreadConsoleCounts,
} from './devConsoleModel';

type ConsoleEntry = {
    id: number;
    level: ConsoleEntryLevel;
    message: string;
    timestamp: string;
}

type ConsoleFilter = 'all' | 'log' | 'warn' | 'error';

function getConsoleToneLevel(level: ConsoleEntryLevel, args: unknown[]): ConsoleEntryLevel {
    if (level === 'error' || level === 'warn') {
        return level;
    }

    const hasErrorEvent = args.some((arg) => getEventToneForDisplay(arg) === 'error');
    if (hasErrorEvent) {
        return 'error';
    }

    const hasWarningEvent = args.some((arg) => getEventToneForDisplay(arg) === 'warning');
    return hasWarningEvent ? 'warn' : level;
}

function useConsoleCapture() {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<UnreadConsoleCounts>(createUnreadConsoleCounts);
    const nextEntryIdRef = useRef(createConsoleEntryIdFactory());

    const addEntry = useCallback((level: ConsoleEntryLevel, args: unknown[]) => {
        const entryLevel = getConsoleToneLevel(level, args);
        const message = normalizeConsoleMessage(args.map((arg) => formatForEventLog(arg)).join(' '));

        const entry: ConsoleEntry = {
            id: nextEntryIdRef.current(),
            level: entryLevel,
            message,
            timestamp: new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2
            })
        };

        setEntries(prev => {
            const next = [...prev, entry];
            return next.length > 500 ? next.slice(-500) : next;
        });
        setUnreadCounts((prev) => getNextUnreadConsoleCounts(prev, entryLevel));
    }, []);

    useEffect(() => {
        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;
        const origInfo = console.info;

        const queueEntry = (level: ConsoleEntryLevel, args: unknown[]) => {
            queueMicrotask(() => {
                addEntry(level, args);
            });
        };

        console.log = (...args: unknown[]) => { origLog(...args); queueEntry('log', args); };
        console.warn = (...args: unknown[]) => { origWarn(...args); queueEntry('warn', args); };
        console.error = (...args: unknown[]) => { origError(...args); queueEntry('error', args); };
        console.info = (...args: unknown[]) => { origInfo(...args); queueEntry('info', args); };

        return () => {
            console.log = origLog;
            console.warn = origWarn;
            console.error = origError;
            console.info = origInfo;
        };
    }, [addEntry]);

    const clearEntries = useCallback(() => {
        setEntries([]);
        setUnreadCounts(createUnreadConsoleCounts());
    }, []);

    return { entries, unreadCounts, setUnreadCounts, clearEntries };
}

function DevConsoleToggle({
    isOpen, unreadCounts, onClick
}: {
    readonly isOpen: boolean;
    readonly unreadCounts: UnreadConsoleCounts;
    readonly onClick: () => void;
}) {
    const tone = getConsoleToggleTone(unreadCounts);
    const borderClass = (function () {
        if (tone === 'error') {return 'border-red-500';}
        if (tone === 'warning') {return 'border-amber-500';}
        return 'border-content/10';
    }());
    const textClass = (function () {
        if (tone === 'error') {return 'text-red-400';}
        if (tone === 'warning') {return 'text-amber-500';}
        return 'text-content-secondary hover:text-content';
    }());
    const activeClass = isOpen
        ? 'bg-content/10 text-content'
        : 'bg-surface-secondary/80 hover:bg-surface-secondary';

    return (
        <button
            id="dev-console-toggle"
            onClick={onClick}
            title="Toggle Dev Console"
            className={`flex items-center gap-1.5 px-2 py-0.75 text-[11px] rounded-md font-mono cursor-pointer border backdrop-blur-md transition-all shadow-md shrink-0 ${borderClass} ${textClass} ${activeClass}`}
        >
            <span className="text-sm">🖥️</span>
            {unreadCounts.errors > 0 && (
                <span className="bg-red-500 text-white rounded-full px-1.5 py-0.25 text-[10px] font-bold">
                    E {unreadCounts.errors}
                </span>
            )}
            {unreadCounts.warnings > 0 && (
                <span className="bg-amber-500 text-slate-900 rounded-full px-1.5 py-0.25 text-[10px] font-bold">
                    W {unreadCounts.warnings}
                </span>
            )}
            {isOpen ? 'Hide Console' : 'Console'}
        </button>
    );
}

function getFilteredEntries(entries: ConsoleEntry[], filter: ConsoleFilter) {
    return filter === 'all' ? entries : entries.filter((entry) => entry.level === filter);
}

function getFilterLabel(filter: ConsoleFilter, entries: ConsoleEntry[]) {
    if (filter === 'all') {return `All (${entries.length})`;}
    if (filter === 'error') {return `Errors (${entries.filter((entry) => entry.level === 'error').length})`;}
    if (filter === 'warn') {return `Warns (${entries.filter((entry) => entry.level === 'warn').length})`;}
    return 'Log';
}

function FilterButton({
    level,
    active,
    entries,
    onClick
}: {
    readonly level: ConsoleFilter;
    readonly active: boolean;
    readonly entries: ConsoleEntry[];
    readonly onClick: () => void;
}) {
    const activeClass = active ? 'bg-content/10 border-content/20' : 'bg-transparent border-transparent';
    const textClass = (function () {
        if (level === 'error') {return 'text-red-400';}
        if (level === 'warn') {return 'text-amber-500';}
        return 'text-content-secondary';
    }());

    return (
        <button
            onClick={onClick}
            className={`border rounded px-2 py-0.5 cursor-pointer text-[10px] transition-all ${activeClass} ${textClass}`}
        >
            {getFilterLabel(level, entries)}
        </button>
    );
}

function ConsoleEntryRow({ entry }: { readonly entry: ConsoleEntry }) {
    const bgClass = (function () {
        if (entry.level === 'error') {return 'bg-red-500/5';}
        if (entry.level === 'warn') {return 'bg-amber-500/5';}
        return '';
    }());
    const levelTextClass = (function () {
        if (entry.level === 'error') {return 'text-red-400';}
        if (entry.level === 'warn') {return 'text-amber-500';}
        if (entry.level === 'info') {return 'text-blue-400';}
        return 'text-content-secondary';
    }());
    const messageTextClass = (function () {
        if (entry.level === 'error') {return 'text-red-300';}
        if (entry.level === 'warn') {return 'text-amber-400';}
        return 'text-content';
    }());

    return (
        <div className={`flex gap-2 px-3 py-0.5 border-b border-content/5 items-start ${bgClass}`}>
            <span className="text-content-secondary shrink-0 text-[10px] pt-[1px] select-none">{entry.timestamp}</span>
            <span className={`shrink-0 w-9 text-[10px] font-semibold pt-[1px] select-none uppercase ${levelTextClass}`}>{entry.level}</span>
            <span className={`break-all whitespace-pre-wrap leading-relaxed ${messageTextClass}`}>{entry.message}</span>
        </div>
    );
}

function DevConsolePanel({
    entries, filter, setFilter, bottomRef, onClear, onClose
}: {
    readonly entries: ConsoleEntry[];
    readonly filter: ConsoleFilter;
    readonly setFilter: (f: ConsoleFilter) => void;
    readonly bottomRef: { current: HTMLDivElement | null };
    readonly onClear: () => void;
    readonly onClose: () => void;
}) {
    const filtered = getFilteredEntries(entries, filter);

    return (
        <div
            id="dev-console-panel"
            className="fixed bottom-[38px] right-3 w-[680px] max-w-[calc(100vw-24px)] h-[340px] z-[9998] bg-surface/95 border border-content/10 rounded-lg flex flex-col shadow-2xl backdrop-blur-md font-mono text-[11px] overflow-hidden"
        >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-content/10 bg-surface-secondary/80">
                <span className="text-content-secondary text-[11px] font-semibold tracking-wider">DEV CONSOLE</span>
                <div className="flex-1" />
                {(['all', 'log', 'warn', 'error'] as const).map((level) => (
                    <FilterButton
                        key={level}
                        level={level}
                        active={filter === level}
                        entries={entries}
                        onClick={() => setFilter(level)}
                    />
                ))}
                <button 
                    onClick={onClear} 
                    className="bg-transparent border border-content/20 hover:border-content/30 rounded px-2 py-0.5 cursor-pointer text-[10px] text-content-secondary hover:text-content font-mono"
                >
                    Clear
                </button>
                <button
                    onClick={onClose}
                    aria-label="Hide Dev Console"
                    className="bg-transparent border-none text-content-secondary hover:text-content px-1 py-0.5 cursor-pointer text-sm leading-none"
                >
                    x
                </button>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                    <div className="text-content-secondary/60 p-6 text-center text-[11px]">
                        No messages. Console output will appear here.
                    </div>
                ) : filtered.map((entry) => <ConsoleEntryRow key={entry.id} entry={entry} />)}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

export function DevConsole() {
    const { entries, unreadCounts, setUnreadCounts, clearEntries } = useConsoleCapture();
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState<ConsoleFilter>('all');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && bottomRef.current) {bottomRef.current.scrollIntoView({ behavior: 'smooth' });}
    }, [entries, isOpen]);

    const handleOpen = () => {
        setIsOpen(open => !open);
        setUnreadCounts(createUnreadConsoleCounts());
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    return (
        <>
            <DevConsoleToggle isOpen={isOpen} unreadCounts={unreadCounts} onClick={handleOpen} />
            {isOpen && (
                <DevConsolePanel
                    entries={entries}
                    filter={filter}
                    setFilter={setFilter}
                    bottomRef={bottomRef}
                    onClear={clearEntries}
                    onClose={handleClose}
                />
            )}
        </>
    );
}
