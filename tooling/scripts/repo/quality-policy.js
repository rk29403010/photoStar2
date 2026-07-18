/**
 * Canonical repository quality policy.
 *
 * ESLint and repository scripts consume this module directly. Tools that only
 * accept static configuration (Oxlint and markdownlint) are kept in sync by
 * tests/repo/quality-policy.test.mjs.
 */
export const qualityPolicy = Object.freeze({
    complexity: Object.freeze({
        maxCyclomatic: 10,
        maxCognitive: 20,
        maxFunctionLines: 90,
    }),
    reviewability: Object.freeze({
        advisoryFileLines: 800,
        applicationFileLines: 1200,
    }),
    typeAwareApplicationRoots: Object.freeze([
        'src/ui/',
        'src/boundary/contracts/',
        'src/boundary/runtime/',
        'src/shared/',
        'src/entrypoints/web/',
    ]),
    typeAwareApplicationFiles: Object.freeze([
        'src/boundary/transport/usePhotoLibrary.transport.ts',
    ]),
    lintIgnores: Object.freeze([
        '.agents/**',
        '.codegrok/**',
        '.codex/**',
        '.local/**',
        '.nyc_output/**',
        '.playwright-cli/**',
        '.superpowers/**',
        '.vscode/**',
        '.worktrees/**',
        'artifacts/**',
        'core/dist/**',
        'core/models/nsfwjs/**',
        'core/node_modules/**',
        'coverage/**',
        'deployments/desktop/tauri/binaries/**',
        'deployments/desktop/tauri/gen/**',
        'deployments/desktop/tauri/target/**',
        'dist-ssr/**',
        'dist/**',
        'node_modules/**',
        'output/**',
        'scratch/**',
        'src-tauri/binaries/**',
        'src-tauri/gen/**',
        'src-tauri/target/**',
        'vite.config.ts.timestamp-*.mjs',
        'worktrees/**',
    ]),
});

export function isTypeAwareApplicationFile(filePath) {
    const normalizedPath = filePath.replaceAll('\\', '/');
    if (!/\.tsx?$/u.test(normalizedPath)) {
        return false;
    }
    return qualityPolicy.typeAwareApplicationFiles.includes(normalizedPath)
        || qualityPolicy.typeAwareApplicationRoots.some((root) => normalizedPath.startsWith(root));
}

export function resolveComplexityThresholds(environment = process.env) {
    return {
        maxCyclomatic: readPositiveInteger(
            environment.COMPLEXITY_MAX_CYCLOMATIC,
            qualityPolicy.complexity.maxCyclomatic,
        ),
        maxCognitive: readPositiveInteger(
            environment.COMPLEXITY_MAX_COGNITIVE,
            qualityPolicy.complexity.maxCognitive,
        ),
        maxLoc: readPositiveInteger(
            environment.COMPLEXITY_MAX_LOC,
            qualityPolicy.complexity.maxFunctionLines,
        ),
    };
}

function readPositiveInteger(value, fallback) {
    if (value === undefined || value === '') {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`Quality thresholds must be positive integers; received "${value}".`);
    }

    return parsed;
}
