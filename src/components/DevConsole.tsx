import { useState, useEffect, useRef, useCallback } from 'react';

interface ConsoleEntry {
    id: number;
    level: 'log' | 'warn' | 'error' | 'info';
    message: string;
    timestamp: string;
}

let entryId = 0;

export function DevConsole() {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'log' | 'warn' | 'error'>('all');
    const [unreadErrors, setUnreadErrors] = useState(0);
    const bottomRef = useRef<HTMLDivElement>(null);

    const addEntry = useCallback((level: ConsoleEntry['level'], args: unknown[]) => {
        const message = args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a, null, 0); } catch { return String(a); }
        }).join(' ');

        const entry: ConsoleEntry = {
            id: ++entryId,
            level,
            message,
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 })
        };

        setEntries(prev => {
            const next = [...prev, entry];
            return next.length > 500 ? next.slice(-500) : next;
        });

        if (level === 'error' || level === 'warn') {
            setUnreadErrors(prev => prev + 1);
        }
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

    // Auto-scroll to bottom when new entries arrive and panel is open
    useEffect(() => {
        if (isOpen && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [entries, isOpen]);

    // Clear unread badge when opened
    const handleOpen = () => {
        setIsOpen(o => !o);
        setUnreadErrors(0);
    };

    const filtered = filter === 'all' ? entries : entries.filter(e => e.level === filter);
    const errorCount = entries.filter(e => e.level === 'error').length;
    const warnCount = entries.filter(e => e.level === 'warn').length;

    const levelColor: Record<ConsoleEntry['level'], string> = {
        log: '#94a3b8',
        info: '#60a5fa',
        warn: '#fbbf24',
        error: '#f87171'
    };

    const levelBg: Record<ConsoleEntry['level'], string> = {
        log: 'transparent',
        info: 'transparent',
        warn: 'rgba(251,191,36,0.05)',
        error: 'rgba(248,113,113,0.07)'
    };

    return (
        <>
            {/* Floating toggle button */}
            <button
                id="dev-console-toggle"
                onClick={handleOpen}
                title="Toggle Dev Console"
                style={{
                    position: 'fixed',
                    bottom: '12px',
                    right: '12px',
                    zIndex: 9999,
                    background: isOpen ? '#1e293b' : 'rgba(15,23,42,0.9)',
                    border: `1px solid ${unreadErrors > 0 ? '#ef4444' : '#334155'}`,
                    borderRadius: '8px',
                    color: unreadErrors > 0 ? '#f87171' : '#94a3b8',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'monospace',
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}
            >
                <span style={{ fontSize: '14px' }}>🖥️</span>
                {unreadErrors > 0 && (
                    <span style={{
                        background: '#ef4444', color: '#fff',
                        borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 700
                    }}>{unreadErrors}</span>
                )}
                {isOpen ? 'Hide Console' : 'Console'}
            </button>

            {/* Console Panel */}
            {isOpen && (
                <div
                    id="dev-console-panel"
                    style={{
                        position: 'fixed',
                        bottom: '52px',
                        right: '12px',
                        width: '680px',
                        maxWidth: 'calc(100vw - 24px)',
                        height: '340px',
                        zIndex: 9998,
                        background: 'rgba(8,12,24,0.97)',
                        border: '1px solid #1e293b',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(16px)',
                        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
                        fontSize: '11px',
                        overflow: 'hidden'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px',
                        borderBottom: '1px solid #1e293b',
                        background: 'rgba(15,23,42,0.8)'
                    }}>
                        <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>DEV CONSOLE</span>
                        <div style={{ flex: 1 }} />
                        {/* Level filters */}
                        {(['all', 'log', 'warn', 'error'] as const).map(lvl => (
                            <button key={lvl} onClick={() => setFilter(lvl)} style={{
                                background: filter === lvl ? '#1e293b' : 'transparent',
                                border: `1px solid ${filter === lvl ? '#334155' : 'transparent'}`,
                                borderRadius: '4px',
                                color: lvl === 'error' ? '#f87171' : lvl === 'warn' ? '#fbbf24' : '#64748b',
                                padding: '2px 8px', cursor: 'pointer', fontSize: '10px',
                                fontFamily: 'inherit', transition: 'all 0.15s'
                            }}>
                                {lvl === 'all' ? `All (${entries.length})` : lvl === 'error' ? `Errors (${errorCount})` : lvl === 'warn' ? `Warns (${warnCount})` : 'Log'}
                            </button>
                        ))}
                        <button onClick={() => setEntries([])} style={{
                            background: 'transparent', border: '1px solid #334155', borderRadius: '4px',
                            color: '#64748b', padding: '2px 8px', cursor: 'pointer', fontSize: '10px',
                            fontFamily: 'inherit', transition: 'all 0.15s'
                        }}>Clear</button>
                    </div>

                    {/* Log entries */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                        {filtered.length === 0 ? (
                            <div style={{ color: '#475569', padding: '24px', textAlign: 'center', fontSize: '11px' }}>
                                No messages. Console output will appear here.
                            </div>
                        ) : filtered.map(entry => (
                            <div key={entry.id} style={{
                                display: 'flex', gap: '8px', padding: '2px 12px',
                                borderBottom: '1px solid rgba(255,255,255,0.02)',
                                background: levelBg[entry.level],
                                alignItems: 'flex-start'
                            }}>
                                <span style={{ color: '#334155', flexShrink: 0, fontSize: '10px', paddingTop: '1px', userSelect: 'none' }}>
                                    {entry.timestamp}
                                </span>
                                <span style={{
                                    color: levelColor[entry.level],
                                    flexShrink: 0, width: '36px', fontSize: '10px',
                                    fontWeight: 600, paddingTop: '1px', userSelect: 'none',
                                    textTransform: 'uppercase'
                                }}>
                                    {entry.level}
                                </span>
                                <span style={{
                                    color: entry.level === 'error' ? '#fca5a5' : entry.level === 'warn' ? '#fde68a' : '#cbd5e1',
                                    wordBreak: 'break-all', whiteSpace: 'pre-wrap', lineHeight: 1.5
                                }}>
                                    {entry.message}
                                </span>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>
                </div>
            )}
        </>
    );
}
