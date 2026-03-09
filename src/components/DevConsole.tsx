import { useState, useEffect, useRef, useCallback } from 'react';
import { formatForEventLog } from '../../shared/utils/eventLogSummary';

interface ConsoleEntry {
    id: number;
    level: 'log' | 'warn' | 'error' | 'info';
    message: string;
    timestamp: string;
}

type ConsoleFilter = 'all' | 'log' | 'warn' | 'error';

let entryId = 0;

function useConsoleCapture() {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [unreadErrors, setUnreadErrors] = useState(0);

    const addEntry = useCallback((level: ConsoleEntry['level'], args: unknown[]) => {
        const message = args.map((arg) => formatForEventLog(arg)).join(' ');

        const entry: ConsoleEntry = {
            id: ++entryId,
            level,
            message,
            timestamp: new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2
            })
        };

        setEntries(prev => {
            const next = [...prev, entry];
            return next.length > 500 ? next.slice(-500) : next;
        });
        if (level === 'error' || level === 'warn') {setUnreadErrors(prev => prev + 1);}
    }, []);

    useEffect(() => {
        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;
        const origInfo = console.info;

        console.log = (...args: unknown[]) => { origLog(...args); addEntry('log', args); };
        console.warn = (...args: unknown[]) => { origWarn(...args); addEntry('warn', args); };
        console.error = (...args: unknown[]) => { origError(...args); addEntry('error', args); };
        console.info = (...args: unknown[]) => { origInfo(...args); addEntry('info', args); };

        return () => {
            console.log = origLog;
            console.warn = origWarn;
            console.error = origError;
            console.info = origInfo;
        };
    }, [addEntry]);

    return { entries, unreadErrors, setUnreadErrors, clearEntries: () => setEntries([]) };
}

function DevConsoleToggle({
    isOpen, unreadErrors, onClick
}: {
    isOpen: boolean;
    unreadErrors: number;
    onClick: () => void;
}) {
    return (
        <button
            id="dev-console-toggle"
            onClick={onClick}
            title="Toggle Dev Console"
            style={{
                background: isOpen ? '#1e293b' : 'rgba(15,23,42,0.9)',
                border: `1px solid ${unreadErrors > 0 ? '#ef4444' : '#334155'}`,
                borderRadius: '6px', color: unreadErrors > 0 ? '#f87171' : '#94a3b8',
                padding: '3px 8px', fontSize: '11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace',
                backdropFilter: 'blur(8px)', transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)', flexShrink: 0
            }}
        >
            <span style={{ fontSize: '14px' }}>🖥️</span>
            {unreadErrors > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 700 }}>
                    {unreadErrors}
                </span>
            )}
            {isOpen ? 'Hide Console' : 'Console'}
        </button>
    );
}

const LEVEL_COLOR: Record<ConsoleEntry['level'], string> = {
    log: '#94a3b8',
    info: '#60a5fa',
    warn: '#fbbf24',
    error: '#f87171'
};

const LEVEL_BACKGROUND: Record<ConsoleEntry['level'], string> = {
    log: 'transparent',
    info: 'transparent',
    warn: 'rgba(251,191,36,0.05)',
    error: 'rgba(248,113,113,0.07)'
};

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
    level: ConsoleFilter;
    active: boolean;
    entries: ConsoleEntry[];
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active ? '#1e293b' : 'transparent',
                border: `1px solid ${active ? '#334155' : 'transparent'}`,
                borderRadius: '4px',
                color: level === 'error' ? '#f87171' : level === 'warn' ? '#fbbf24' : '#64748b',
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: '10px',
                fontFamily: 'inherit',
                transition: 'all 0.15s'
            }}
        >
            {getFilterLabel(level, entries)}
        </button>
    );
}

function ConsoleEntryRow({ entry }: { entry: ConsoleEntry }) {
    return (
        <div style={{
            display: 'flex', gap: '8px', padding: '2px 12px', borderBottom: '1px solid rgba(255,255,255,0.02)',
            background: LEVEL_BACKGROUND[entry.level], alignItems: 'flex-start'
        }}>
            <span style={{ color: '#334155', flexShrink: 0, fontSize: '10px', paddingTop: '1px', userSelect: 'none' }}>{entry.timestamp}</span>
            <span style={{
                color: LEVEL_COLOR[entry.level], flexShrink: 0, width: '36px', fontSize: '10px',
                fontWeight: 600, paddingTop: '1px', userSelect: 'none', textTransform: 'uppercase'
            }}>{entry.level}</span>
            <span style={{
                color: entry.level === 'error' ? '#fca5a5' : entry.level === 'warn' ? '#fde68a' : '#cbd5e1',
                wordBreak: 'break-all', whiteSpace: 'pre-wrap', lineHeight: 1.5
            }}>{entry.message}</span>
        </div>
    );
}

function DevConsolePanel({
    entries, filter, setFilter, bottomRef, onClear, onClose
}: {
    entries: ConsoleEntry[];
    filter: ConsoleFilter;
    setFilter: (f: ConsoleFilter) => void;
    bottomRef: { current: HTMLDivElement | null };
    onClear: () => void;
    onClose: () => void;
}) {
    const filtered = getFilteredEntries(entries, filter);

    return (
        <div
            id="dev-console-panel"
            style={{
                position: 'fixed', bottom: '38px', right: '12px', width: '680px', maxWidth: 'calc(100vw - 24px)',
                height: '340px', zIndex: 9998, background: 'rgba(8,12,24,0.97)', border: '1px solid #1e293b',
                borderRadius: '10px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                backdropFilter: 'blur(16px)', fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
                fontSize: '11px', overflow: 'hidden'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #1e293b', background: 'rgba(15,23,42,0.8)' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>DEV CONSOLE</span>
                <div style={{ flex: 1 }} />
                {(['all', 'log', 'warn', 'error'] as const).map((level) => (
                    <FilterButton
                        key={level}
                        level={level}
                        active={filter === level}
                        entries={entries}
                        onClick={() => setFilter(level)}
                    />
                ))}
                <button onClick={onClear} style={{
                    background: 'transparent', border: '1px solid #334155', borderRadius: '4px', color: '#64748b',
                    padding: '2px 8px', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit'
                }}>Clear</button>
                <button
                    onClick={onClose}
                    aria-label="Hide Dev Console"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        padding: '2px 4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: 1
                    }}
                >
                    x
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {filtered.length === 0 ? (
                    <div style={{ color: '#475569', padding: '24px', textAlign: 'center', fontSize: '11px' }}>
                        No messages. Console output will appear here.
                    </div>
                ) : filtered.map((entry) => <ConsoleEntryRow key={entry.id} entry={entry} />)}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

export function DevConsole() {
    const { entries, unreadErrors, setUnreadErrors, clearEntries } = useConsoleCapture();
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState<ConsoleFilter>('all');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && bottomRef.current) {bottomRef.current.scrollIntoView({ behavior: 'smooth' });}
    }, [entries, isOpen]);

    const handleOpen = () => {
        setIsOpen(open => !open);
        setUnreadErrors(0);
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    return (
        <>
            <DevConsoleToggle isOpen={isOpen} unreadErrors={unreadErrors} onClick={handleOpen} />
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
