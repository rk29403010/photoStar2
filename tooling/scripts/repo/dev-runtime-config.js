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
};

function parsePort(rawValue, fallbackPort) {
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

function normalizeCwd(cwd) {
  return String(cwd ?? '').replace(/\\/g, '/');
}

function getWorktreeNameFromCwd(cwd) {
  const normalizedCwd = normalizeCwd(cwd);
  const match = normalizedCwd.match(/(?:^|\/)(?:\.worktrees|worktrees)\/([^/]+)/i);
  return match?.[1] ?? null;
}

function hashWorktreeName(worktreeName) {
  let hash = 0;

  for (const char of worktreeName) {
    hash = (hash * 31 + char.charCodeAt(0)) % WORKTREE_PORT_BUCKET_COUNT;
  }

  return hash;
}

function getAutomaticPortOffset(cwd) {
  const worktreeName = getWorktreeNameFromCwd(cwd);
  if (!worktreeName) {
    return 0;
  }

  return hashWorktreeName(worktreeName) + 1;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function createImpact(level, summary, reason) {
  return {
    level,
    summary,
    reason,
    requiresManualRestart: level === 'manual-restart' || level === 'reinstall',
  };
}

function getImpactForPath(filePath) {
  const normalizedPath = normalizePath(filePath);

  if (
    normalizedPath === 'package-lock.json'
    || normalizedPath === 'package.json'
  ) {
    return createImpact(
      'reinstall',
      'Reinstall dependencies, then restart the dev runtime.',
      'Dependency metadata changed.'
    );
  }

  if (
    normalizedPath.startsWith('deployments/desktop/tauri/')
    || normalizedPath.startsWith('src-tauri/')
  ) {
    return createImpact(
      'manual-restart',
      'Restart the desktop shell or packaged runtime to pick up desktop host changes.',
      'Desktop host configuration changed.'
    );
  }

  if (
    normalizedPath === 'vite.config.ts'
    || normalizedPath === 'tailwind.config.js'
    || normalizedPath === 'tooling/config/tsconfig.core.json'
    || normalizedPath === 'tsconfig.json'
    || normalizedPath === 'tsconfig.app.json'
    || normalizedPath === 'tsconfig.node.json'
    || normalizedPath.startsWith('.env')
  ) {
    return createImpact(
      'manual-restart',
      'Restart the dev runtime to reload config and environment changes.',
      'Runtime configuration changed.'
    );
  }

  if (
    normalizedPath.startsWith('src/boundary/contracts/')
    || normalizedPath.startsWith('src/boundary/transport/')
    || normalizedPath.startsWith('src/data/')
    || normalizedPath.startsWith('src/entrypoints/core/')
    || normalizedPath.startsWith('src/services/')
    || normalizedPath.startsWith('src/shared/')
  ) {
    return createImpact(
      'auto-restart',
      'Core watch mode should auto-restart the backend after a clean rebuild.',
      'Watched core/backend sources changed.'
    );
  }

  if (
    normalizedPath.startsWith('src/ui/')
    || normalizedPath.startsWith('src/entrypoints/web/')
    || normalizedPath.endsWith('.css')
  ) {
    return createImpact(
      'hmr',
      'Hot reload should apply without a manual restart.',
      'Frontend-only sources changed.'
    );
  }

  return createImpact(
    'none',
    'No restart impact detected from the selected files.',
    'Changed files are outside the main dev runtime paths.'
  );
}

export function resolveDevRuntimePorts(env = process.env, cwd = process.cwd()) {
  const automaticPortOffset = getAutomaticPortOffset(cwd);
  const defaultWebPort = DEFAULT_WEB_PORT + automaticPortOffset;
  const defaultBackendPort = DEFAULT_BACKEND_PORT + automaticPortOffset;

  return {
    webPort: parsePort(env.VITE_PORT, defaultWebPort),
    backendPort: parsePort(env.VITE_BACKEND_PORT, defaultBackendPort),
  };
}

export function classifyRestartImpact(filePaths) {
  const uniquePaths = [...new Set((filePaths ?? []).filter(Boolean).map((filePath) => String(filePath)))];
  if (uniquePaths.length === 0) {
    return {
      level: 'none',
      summary: 'No restart impact detected from the selected files.',
      requiresManualRestart: false,
      reasons: [],
      files: [],
    };
  }

  let selectedImpact = createImpact(
    'none',
    'No restart impact detected from the selected files.',
    'Changed files are outside the main dev runtime paths.'
  );
  const reasons = new Set();

  for (const filePath of uniquePaths) {
    const impact = getImpactForPath(filePath);
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

export {
  DEFAULT_BACKEND_PORT,
  DEFAULT_WEB_PORT,
};
