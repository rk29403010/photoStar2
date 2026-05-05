export type ConsoleEntryLevel = 'log' | 'warn' | 'error' | 'info';

export type UnreadConsoleCounts = {
    warnings: number;
    errors: number;
}

const PHOTOSTAR_TIMELINE_PREFIX = /^\[PhotoStar timeline \+\d+ms\]\s*/;

export function createConsoleEntryIdFactory(): () => number {
    let nextId = 0;
    return () => {
        nextId += 1;
        return nextId;
    };
}

export function createUnreadConsoleCounts(): UnreadConsoleCounts {
    return { warnings: 0, errors: 0 };
}

export function normalizeConsoleMessage(message: string): string {
    return message.replace(PHOTOSTAR_TIMELINE_PREFIX, '');
}

export function getNextUnreadConsoleCounts(
    counts: UnreadConsoleCounts,
    level: ConsoleEntryLevel,
): UnreadConsoleCounts {
    if (level === 'warn') {
        return {
            warnings: counts.warnings + 1,
            errors: counts.errors,
        };
    }

    if (level === 'error') {
        return {
            warnings: counts.warnings,
            errors: counts.errors + 1,
        };
    }

    return counts;
}

export function getConsoleToggleTone(counts: UnreadConsoleCounts): 'neutral' | 'warning' | 'error' {
    if (counts.errors > 0) {
        return 'error';
    }

    if (counts.warnings > 0) {
        return 'warning';
    }

    return 'neutral';
}
