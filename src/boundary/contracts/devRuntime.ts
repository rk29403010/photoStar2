export type DevRuntimeImpact = {
    level: 'none' | 'hmr' | 'auto-restart' | 'manual-restart' | 'reinstall';
    summary: string;
    requiresManualRestart: boolean;
    reasons: string[];
    files: string[];
    webPort: number;
    backendPort: number;
}
