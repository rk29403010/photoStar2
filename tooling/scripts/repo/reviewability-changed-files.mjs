#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runCommandSync } from './process-invocation.js';
import { selectQualityFiles } from './quality-file-selection.js';
import { qualityPolicy } from './quality-policy.js';

const maintainedExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs']);
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';

export function countSourceLines(source) {
    if (!source) {
        return 0;
    }
    const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }
    return lines.length;
}

export function classifyReviewability({
    currentLines,
    baselineLines,
    advisoryLines = qualityPolicy.reviewability.advisoryFileLines,
    hardLines = qualityPolicy.reviewability.applicationFileLines,
}) {
    if (currentLines > hardLines) {
        return 'hard-limit';
    }
    if (currentLines <= advisoryLines) {
        return 'ok';
    }
    if (baselineLines <= advisoryLines || currentLines > baselineLines) {
        return 'growth-over-advisory';
    }
    return 'legacy-not-growing';
}

function runGit(args) {
    return runCommandSync({
        command: gitExecutable,
        args,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function gitText(args) {
    const result = runGit(args);
    if (result.error || result.status !== 0) {
        const message = result.stderr?.trim() || result.error?.message || 'Unknown error';
        throw new Error(`git ${args.join(' ')} failed: ${message}`);
    }
    return result.stdout || '';
}

function resolveMode(argv) {
    if (argv.includes('--staged')) {
        return 'staged';
    }
    return argv.includes('--all') ? 'all' : 'changed';
}

function isMaintainedApplicationFile(filePath) {
    const normalized = filePath.replaceAll('\\', '/');
    return normalized.startsWith('src/') && maintainedExtensions.has(path.extname(normalized).toLowerCase());
}

function readBaselineSource(filePath, baselineRef) {
    const result = runGit(['show', `${baselineRef}:${filePath.replaceAll('\\', '/')}`]);
    if (result.status === 0) {
        return result.stdout || '';
    }
    return '';
}

export function collectReviewabilityFindings({
    candidateFiles,
    baselineRef,
    readCurrent = (filePath) => readFileSync(filePath, 'utf8'),
    readBaseline = readBaselineSource,
}) {
    const findings = [];
    for (const filePath of candidateFiles) {
        if (!isMaintainedApplicationFile(filePath) || !existsSync(filePath)) {
            continue;
        }
        const currentLines = countSourceLines(readCurrent(filePath));
        const baselineLines = countSourceLines(readBaseline(filePath, baselineRef));
        const classification = classifyReviewability({ currentLines, baselineLines });
        if (classification === 'hard-limit' || classification === 'growth-over-advisory') {
            findings.push({ filePath, currentLines, baselineLines, classification });
        }
    }
    return findings;
}

export function runReviewabilityCheck({ argv = process.argv.slice(2), env = process.env } = {}) {
    const mode = resolveMode(argv);
    const baselineRef = env.LINT_DIFF_BASE || 'HEAD';
    const candidateFiles = selectQualityFiles({
        mode,
        diffBase: env.LINT_DIFF_BASE,
        githubBaseRef: env.GITHUB_BASE_REF,
        runGit: gitText,
    });
    const findings = collectReviewabilityFindings({ candidateFiles, baselineRef });
    if (findings.length === 0) {
        console.log(`[reviewability] ${candidateFiles.length} changed path(s) checked; no large maintained source file grew unsafely.`);
        return 0;
    }

    const { advisoryFileLines, applicationFileLines } = qualityPolicy.reviewability;
    console.error('[reviewability] Large maintained source files need extraction before handoff:');
    for (const finding of findings) {
        if (finding.classification === 'hard-limit') {
            console.error(`- ${finding.filePath}: ${finding.currentLines} lines exceeds hard limit ${applicationFileLines}.`);
            continue;
        }
        const baseline = finding.baselineLines === 0 ? 'new file' : `${finding.baselineLines} -> ${finding.currentLines} lines`;
        console.error(`- ${finding.filePath}: ${baseline}; files above ${advisoryFileLines} lines may not be introduced or grown.`);
    }
    return 1;
}

function main() {
    process.exitCode = runReviewabilityCheck();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(`[reviewability] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
