import { spawnSync } from 'node:child_process';

export function getSpawnOptions({
    cwd = process.cwd(),
    env = process.env,
    stdio = 'pipe',
    detached = false,
    platform = process.platform,
} = {}) {
    return {
        cwd,
        env,
        stdio,
        detached,
        shell: false,
        windowsHide: platform === 'win32',
    };
}

function quoteWindowsShellArgument(value) {
    const normalized = String(value);
    return /[\s"&^<>|()]/.test(normalized)
        ? `"${normalized.replaceAll('"', '""')}"`
        : normalized;
}

export function buildSpawnInvocation({
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    stdio = 'pipe',
    detached = false,
    platform = process.platform,
}) {
    const options = getSpawnOptions({
        cwd,
        env,
        stdio,
        detached,
        platform,
    });
    const needsCmdWrapping = platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    if (!needsCmdWrapping) {
        return { command, args, options };
    }

    const commandLine = [command, ...args].map(quoteWindowsShellArgument).join(' ');
    return {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', commandLine],
        options,
    };
}

export function runCommandSync({
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    encoding,
    stdio = 'pipe',
    detached = false,
    platform = process.platform,
    input,
}) {
    const invocation = buildSpawnInvocation({
        command,
        args,
        cwd,
        env,
        stdio,
        detached,
        platform,
    });

    return spawnSync(invocation.command, invocation.args, {
        ...invocation.options,
        ...(encoding ? { encoding } : {}),
        ...(input === undefined ? {} : { input }),
    });
}

export function getNpxExecutable(platform = process.platform) {
    return platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function getTaskkillExecutable(platform = process.platform) {
    return platform === 'win32' ? 'taskkill.exe' : 'taskkill';
}
