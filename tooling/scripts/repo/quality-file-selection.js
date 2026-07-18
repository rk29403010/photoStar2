export function parseGitPathList(output) {
    if (!output) {
        return [];
    }

    return output.split('\0').filter(Boolean);
}

export function selectQualityFiles({
    mode,
    explicitFiles = [],
    diffBase,
    githubBaseRef,
    runGit,
}) {
    if (explicitFiles.length > 0) {
        return uniquePaths(explicitFiles);
    }

    if (mode === 'all') {
        return gitPaths(runGit, ['ls-files', '-z']);
    }

    if (mode === 'staged') {
        return gitPaths(runGit, ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z']);
    }

    const base = diffBase || (githubBaseRef ? `origin/${githubBaseRef}` : null);
    const committedPaths = base
        ? gitPaths(runGit, ['diff', '--name-only', '--diff-filter=ACMRT', '-z', `${base}...HEAD`])
        : [];
    const workingPaths = gitPaths(runGit, ['diff', '--name-only', '--diff-filter=ACMRT', '-z', 'HEAD']);
    const untrackedPaths = gitPaths(runGit, ['ls-files', '--others', '--exclude-standard', '-z']);

    return uniquePaths([...committedPaths, ...workingPaths, ...untrackedPaths]);
}

function gitPaths(runGit, args) {
    return parseGitPathList(runGit(args));
}

function uniquePaths(paths) {
    return [...new Set(paths)];
}
