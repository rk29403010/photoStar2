export type RestartImpactLevel =
    | 'none'
    | 'hmr'
    | 'auto-restart'
    | 'manual-restart'
    | 'reinstall';

export interface DevRuntimePorts {
    webPort: number;
    backendPort: number;
}

export interface RestartImpact {
    level: RestartImpactLevel;
    summary: string;
    requiresManualRestart: boolean;
    reasons: string[];
    files: string[];
}

export declare const DEFAULT_WEB_PORT: number;
export declare const DEFAULT_BACKEND_PORT: number;

export declare function resolveDevRuntimePorts(
    env?: Record<string, string | undefined> | NodeJS.ProcessEnv,
    cwd?: string
): DevRuntimePorts;

export declare function classifyRestartImpact(filePaths: readonly string[] | undefined): RestartImpact;
