export type ConsoleEntryLevel = 'log' | 'warn' | 'error' | 'info';

export interface UnreadConsoleCounts {
    warnings: number;
    errors: number;
}

export function createUnreadConsoleCounts(): UnreadConsoleCounts {
    return { warnings: 0, errors: 0 };
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
