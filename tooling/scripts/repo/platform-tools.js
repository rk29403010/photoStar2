/** Central platform executable contract for repository automation. */
export function resolvePlatformTools(platform = process.platform) {
    const windows = platform === 'win32';
    return { git: windows ? 'git.exe' : 'git', gh: windows ? 'gh.exe' : 'gh', pnpm: windows ? 'pnpm.cmd' : 'pnpm' };
}
