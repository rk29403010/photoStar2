import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { DevRuntimeImpact } from '@contracts/devRuntime';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_BACKEND_PORT = 5174;
const MAX_PORT = 65_535;
const WORKTREE_PORT_BUCKET_COUNT = 2000;

const LEVEL_WEIGHT = {
    none: 0,
    hmr: 1,
    'auto-restart': 2,
    'manual-restart': 3,
    reinstall: 4,
} as const;
const RUNTIME_CONFIG_PATHS = new Set([
    'vite.config.ts',
    'tailwind.config.js',
    'tooling/config/tsconfig.core.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
]);
const DEPENDENCY_PACKAGE_KEYS = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundleDependencies',
    'bundledDependencies',
    'overrides',
    'resolutions',
    'packageManager',
    'engines',
    'volta',
] as const;
const CORE_SOURCE_PREFIXES = [
    'src/boundary/contracts/',
    'src/boundary/transport/',
    'src/data/',
    'src/entrypoints/core/',
    'src/services/',
    'src/shared/',
];
const FRONTEND_SOURCE_PREFIXES = [
    'src/ui/',
    'src/entrypoints/web/',
];

function parsePort(rawValue: string | undefined, fallbackPort: number): number {
    if (typeof rawValue !== 'string') {
        return fallbackPort;
    }

    const trimmedValue = rawValue.trim();
    if (!/^\d+$/.test(trimmedValue)) {
        return fallbackPort;
    }

    const parsedPort = Number.parseInt(trimmedValue, 10);
    if (parsedPort < 1 || parsedPort > MAX_PORT) {
        return fallbackPort;
    }

    return parsedPort;
}

function normalizeCwd(cwd: string): string {
    return String(cwd).replace(/\\/g, '/');
}

function getWorktreeNameFromCwd(cwd: string): string | null {
    const normalizedCwd = normalizeCwd(cwd);
    const match = normalizedCwd.match(/(?:^|\/)(?:\.worktrees|worktrees)\/([^/]+)/i);
    return match?.[1] ?? null;
}

function hashWorktreeName(worktreeName: string): number {
    let hash = 0;

    for (const char of worktreeName) {
        hash = (hash * 31 + char.charCodeAt(0)) % WORKTREE_PORT_BUCKET_COUNT;
    }

    return hash;
}

function getAutomaticPortOffset(cwd: string): number {
    const worktreeName = getWorktreeNameFromCwd(cwd);
    if (!worktreeName) {
        return 0;
    }

    return hashWorktreeName(worktreeName) + 1;
}

function resolveDevRuntimePorts(env: NodeJS.ProcessEnv, cwd: string): { webPort: number; backendPort: number } {
    const automaticPortOffset = getAutomaticPortOffset(cwd);
    const defaultWebPort = DEFAULT_WEB_PORT + automaticPortOffset;
    const defaultBackendPort = DEFAULT_BACKEND_PORT + automaticPortOffset;

    return {
        webPort: parsePort(env.VITE_PORT, defaultWebPort),
        backendPort: parsePort(env.VITE_BACKEND_PORT, defaultBackendPort),
    };
}

function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function createImpact(
    level: DevRuntimeImpact['level'],
    summary: string,
    reason: string,
) {
    return {
        level,
        summary,
        reason,
        requiresManualRestart: level === 'manual-restart' || level === 'reinstall',
    };
}

function safeParseJson(text: string): Record<string, unknown> | null {
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function readPackageJsonFromHead(cwd: string): Record<string, unknown> | null {
    const result = spawnSync('git', ['show', 'HEAD:package.json'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
    });

    if (result.error || result.status !== 0) {
        return null;
    }

    return safeParseJson(result.stdout || '');
}

function readCurrentPackageJson(cwd: string): Record<string, unknown> | null {
    try {
        return safeParseJson(readFileSync(`${cwd}/package.json`, 'utf8'));
    } catch {
        return null;
    }
}

function packageFieldChanged(
    previousPackageJson: Record<string, unknown> | null,
    currentPackageJson: Record<string, unknown> | null,
    field: string,
): boolean {
    return JSON.stringify(previousPackageJson?.[field] ?? null) !== JSON.stringify(currentPackageJson?.[field] ?? null);
}

function packageJsonNeedsReinstall(cwd: string): boolean {
    const previousPackageJson = readPackageJsonFromHead(cwd);
    const currentPackageJson = readCurrentPackageJson(cwd);

    if (!previousPackageJson || !currentPackageJson) {
        return true;
    }

    return DEPENDENCY_PACKAGE_KEYS.some((field) => packageFieldChanged(previousPackageJson, currentPackageJson, field));
}

function isDependencyMetadataPath(normalizedPath: string, cwd: string): boolean {
    if (normalizedPath === 'package-lock.json') {
        return true;
    }

    if (normalizedPath !== 'package.json') {
        return false;
    }

    return packageJsonNeedsReinstall(cwd);
}

function isPackageMetadataPath(normalizedPath: string): boolean {
    return normalizedPath === 'package.json';
}

function isDesktopHostPath(normalizedPath: string): boolean {
    return normalizedPath.startsWith('deployments/desktop/tauri/') || normalizedPath.startsWith('src-tauri/');
}

function isRuntimeConfigPath(normalizedPath: string): boolean {
    return RUNTIME_CONFIG_PATHS.has(normalizedPath) || normalizedPath.startsWith('.env');
}

function isCoreSourcePath(normalizedPath: string): boolean {
    return CORE_SOURCE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

function isFrontendSourcePath(normalizedPath: string): boolean {
    return FRONTEND_SOURCE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) || normalizedPath.endsWith('.css');
}

function getImpactForPath(filePath: string, cwd: string) {
    const normalizedPath = normalizePath(filePath);

    if (isDependencyMetadataPath(normalizedPath, cwd)) {
        return createImpact(
            'reinstall',
            'Reinstall dependencies, then restart the dev runtime.',
            'Dependency metadata changed.',
        );
    }

    if (isPackageMetadataPath(normalizedPath)) {
        return createImpact(
            'manual-restart',
            'Restart the dev runtime to reload package script and tool metadata changes.',
            'Package metadata changed.',
        );
    }

    if (isDesktopHostPath(normalizedPath)) {
        return createImpact(
            'manual-restart',
            'Restart the desktop shell or packaged runtime to pick up desktop host changes.',
            'Desktop host configuration changed.',
        );
    }

    if (isRuntimeConfigPath(normalizedPath)) {
        return createImpact(
            'manual-restart',
            'Restart the dev runtime to reload config and environment changes.',
            'Runtime configuration changed.',
        );
    }

    if (isCoreSourcePath(normalizedPath)) {
        return createImpact(
            'auto-restart',
            'Core watch mode should auto-restart the backend after a clean rebuild.',
            'Watched core/backend sources changed.',
        );
    }

    if (isFrontendSourcePath(normalizedPath)) {
        return createImpact(
            'hmr',
            'Hot reload should apply without a manual restart.',
            'Frontend-only sources changed.',
        );
    }

    return createImpact(
        'none',
        'No restart impact detected from the selected files.',
        'Changed files are outside the main dev runtime paths.',
    );
}

function classifyRestartImpact(filePaths: string[], cwd: string) {
    const uniquePaths = [...new Set((filePaths ?? []).filter(Boolean).map((filePath) => String(filePath)))];
    if (uniquePaths.length === 0) {
        return {
            level: 'none' as const,
            summary: 'No restart impact detected from the selected files.',
            requiresManualRestart: false,
            reasons: [] as string[],
            files: [] as string[],
        };
    }

    let selectedImpact = createImpact(
        'none',
        'No restart impact detected from the selected files.',
        'Changed files are outside the main dev runtime paths.',
    );
    const reasons = new Set<string>();

    for (const filePath of uniquePaths) {
        const impact = getImpactForPath(filePath, cwd);
        reasons.add(impact.reason);

        if (LEVEL_WEIGHT[impact.level] > LEVEL_WEIGHT[selectedImpact.level]) {
            selectedImpact = impact;
        }
    }

    return {
        level: selectedImpact.level,
        summary: selectedImpact.summary,
        requiresManualRestart: selectedImpact.requiresManualRestart,
        reasons: [...reasons],
        files: uniquePaths,
    };
}

function toLines(text: string): string[] {
    if (!text) {
        return [];
    }

    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function getChangedFilesFromGit(cwd: string): string[] {
    const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
    });

    if (result.error || result.status !== 0) {
        const message = (result.stderr || '').trim() || result.error?.message || 'Unknown git error';
        throw new Error(`Unable to read changed files: ${message}`);
    }

    return toLines(result.stdout || '');
}

export function getDevRuntimeImpact(params?: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    getChangedFiles?: () => string[];
}): DevRuntimeImpact {
    const cwd = params?.cwd ?? process.cwd();
    const env = params?.env ?? process.env;
    const files = params?.getChangedFiles ? params.getChangedFiles() : getChangedFilesFromGit(cwd);
    const impact = classifyRestartImpact(files, cwd);
    const ports = resolveDevRuntimePorts(env, cwd);

    return {
        level: impact.level,
        summary: impact.summary,
        requiresManualRestart: impact.requiresManualRestart,
        reasons: impact.reasons,
        files: impact.files,
        webPort: ports.webPort,
        backendPort: ports.backendPort,
    };
}
