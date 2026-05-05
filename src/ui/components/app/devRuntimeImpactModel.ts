import type { DevRuntimeImpact } from '@contracts/devRuntime';

export type DevRuntimeImpactIndicator = {
    tone: 'info' | 'warning' | 'error';
    shortLabel: string;
    title: string;
}

export function getDevRuntimeImpactIndicator(impact: DevRuntimeImpact | null): DevRuntimeImpactIndicator | null {
    if (!impact || impact.level === 'none' || impact.level === 'hmr') {
        return null;
    }

    if (impact.level === 'auto-restart') {
        return {
            tone: 'info',
            shortLabel: 'Core restart',
            title: impact.summary,
        };
    }

    if (impact.level === 'manual-restart') {
        return {
            tone: 'warning',
            shortLabel: 'Restart app',
            title: `${impact.summary} Stop the current dev session, then start it again.`,
        };
    }

    return {
        tone: 'error',
        shortLabel: 'Run npm install',
        title: `${impact.summary} Stop the current dev session, run npm install, then start it again.`,
    };
}
