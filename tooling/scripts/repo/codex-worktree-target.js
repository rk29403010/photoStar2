#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './process-invocation.js';

const MARKER_FILE_NAME = 'codex-active-worktree.json';
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';

function gitText(args, cwd) {
    const result = runCommandSync({ command: gitExecutable, args, cwd, encoding: 'utf8' });
    if ((result.status ?? 1) !== 0) {
        throw new Error(`Git command failed: ${args.join(' ')}`);
    }

    return result.stdout.trim();
}

function normalizePath(targetPath) {
    return path.resolve(targetPath);
}

function pathsMatch(leftPath, rightPath) {
    return normalizePath(leftPath).replaceAll('\\', '/').toLowerCase()
        === normalizePath(rightPath).replaceAll('\\', '/').toLowerCase();
}

function isGitWorktree(targetPath) {
    if (!targetPath || !existsSync(targetPath)) {
        return false;
    }

    try {
        const worktreePath = gitText(['rev-parse', '--show-toplevel'], targetPath);
        return pathsMatch(worktreePath, targetPath);
    } catch {
        return false;
    }
}

function getMarkerPath(cwd) {
    const gitCommonDirectory = gitText(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
    return path.join(gitCommonDirectory, MARKER_FILE_NAME);
}

function readRecordedWorktree(cwd) {
    const markerPath = getMarkerPath(cwd);
    if (!existsSync(markerPath)) {
        return '';
    }

    try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
        return typeof marker.worktreePath === 'string' ? marker.worktreePath : '';
    } catch {
        return '';
    }
}

function isPrimaryWorktree(targetPath) {
    try {
        const mainWorktree = gitText(['worktree', 'list', '--porcelain'], targetPath)
            .split(/\r?\n/u)
            .find((line) => line.startsWith('worktree '));
        return mainWorktree !== undefined && pathsMatch(mainWorktree.slice('worktree '.length), targetPath);
    } catch {
        return false;
    }
}

export function resolveCodexActionWorktree({ cwd = process.cwd(), environment = process.env } = {}) {
    const environmentWorktree = environment.CODEX_WORKTREE_PATH?.trim();
    if (isGitWorktree(environmentWorktree)) {
        return normalizePath(environmentWorktree);
    }

    const recordedWorktree = readRecordedWorktree(cwd);
    if (isGitWorktree(recordedWorktree)) {
        return normalizePath(recordedWorktree);
    }

    if (isGitWorktree(cwd) && !isPrimaryWorktree(cwd)) {
        return normalizePath(cwd);
    }

    throw new Error('No task worktree is available. Open this chat in its task worktree, then retry Debug.');
}

export function recordCodexActionWorktree({ cwd = process.cwd(), worktreePath }) {
    const targetPath = normalizePath(worktreePath);
    if (!isGitWorktree(targetPath) || isPrimaryWorktree(targetPath)) {
        return false;
    }

    const markerPath = getMarkerPath(cwd);
    writeFileSync(markerPath, `${JSON.stringify({ version: 1, worktreePath: targetPath }, null, 2)}\n`);
    return true;
}

function main(argv) {
    if (argv[0] === '--record') {
        if (!argv[1]) {
            throw new Error('Usage: codex-worktree-target.js --record <worktree-path>');
        }

        if (!recordCodexActionWorktree({ worktreePath: argv[1] })) {
            throw new Error('Refusing to record a primary or invalid worktree for Codex actions.');
        }
        return;
    }

    process.stdout.write(`${resolveCodexActionWorktree()}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[codex-worktree] ${detail}`);
        process.exitCode = 1;
    }
}
