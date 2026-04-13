#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSubstantiveLines, parseArgs as parseComplexityArgs, scanFunctions } from './complexity-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_DIRS = ['src'];
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.local', 'deployments']);
const EXTENSIONS = new Set(['.ts', '.tsx']);

const DEFAULTS = {
    top: 25,
    minFileLines: 380,
    minFunctionLines: 60,
    minCyclomatic: 8,
    minCognitive: 15,
    dirs: DEFAULT_DIRS,
    files: [],
    json: false,
};

const NUMERIC_OPTION_SPECS = [
    ['--min-file-lines', 'minFileLines'],
    ['--min-function-lines', 'minFunctionLines'],
    ['--min-cyclomatic', 'minCyclomatic'],
    ['--min-cognitive', 'minCognitive'],
];

function parseIntegerOrDefault(value, fallback) {
    return Number.parseInt(value, 10) || fallback;
}

function applyNumericOptionFromArg(options, arg, nextArg) {
    for (const [flag, optionKey] of NUMERIC_OPTION_SPECS) {
        if (arg.startsWith(`${flag}=`)) {
            options[optionKey] = parseIntegerOrDefault(arg.slice(flag.length + 1), DEFAULTS[optionKey]);
            return false;
        }

        if (arg === flag && nextArg) {
            options[optionKey] = parseIntegerOrDefault(nextArg, DEFAULTS[optionKey]);
            return true;
        }
    }

    return false;
}

export function parseArgs(argv) {
    const base = parseComplexityArgs(argv);
    const options = {
        ...DEFAULTS,
        top: base.top,
        dirs: base.dirs,
        files: base.files,
        json: base.json,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];
        const consumedNextArg = applyNumericOptionFromArg(options, arg, next);
        if (consumedNextArg) {
            index += 1;
        }
    }

    return options;
}

function walkFiles(rootDir, outFiles) {
    if (!fs.existsSync(rootDir)) {
        return;
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) {
                continue;
            }
            walkFiles(fullPath, outFiles);
            continue;
        }

        if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            outFiles.push(fullPath);
        }
    }
}

function resolveTargetFiles(options) {
    if (options.files.length > 0) {
        return options.files
            .map((filePath) => path.resolve(workspaceRoot, filePath))
            .filter((filePath) => fs.existsSync(filePath));
    }

    const files = [];
    for (const dir of options.dirs) {
        walkFiles(path.resolve(workspaceRoot, dir), files);
    }
    return files;
}

function getFileSubstantiveLines(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    return countSubstantiveLines(source);
}

function scoreWatchlistRow(row) {
    return (row.triggers.length * 3) + Math.round(row.fileLines / 250);
}

export function makeWatchlistRow(params) {
    const triggers = [];
    if (params.fileLines >= DEFAULTS.minFileLines) {
        triggers.push('fileLines');
    }
    if (params.maxFunctionLines >= DEFAULTS.minFunctionLines) {
        triggers.push('functionLines');
    }
    if (params.maxCyclomatic >= DEFAULTS.minCyclomatic) {
        triggers.push('cyclomatic');
    }
    if (params.maxCognitive >= DEFAULTS.minCognitive) {
        triggers.push('cognitive');
    }

    const row = {
        file: params.file,
        fileLines: params.fileLines,
        functionCount: params.functionCount,
        maxFunctionLines: params.maxFunctionLines,
        maxCyclomatic: params.maxCyclomatic,
        maxCognitive: params.maxCognitive,
        triggers,
    };

    return {
        ...row,
        score: scoreWatchlistRow(row),
    };
}

function buildWatchlistRow(filePath, functionRows, options) {
    const file = path.relative(workspaceRoot, filePath).replaceAll('\\', '/');
    const fileLines = getFileSubstantiveLines(filePath);
    const maxFunctionLines = functionRows.reduce((maxValue, row) => Math.max(maxValue, row.loc), 0);
    const maxCyclomatic = functionRows.reduce((maxValue, row) => Math.max(maxValue, row.cyclomatic), 0);
    const maxCognitive = functionRows.reduce((maxValue, row) => Math.max(maxValue, row.cognitiveApprox), 0);

    const row = makeWatchlistRow({
        file,
        fileLines,
        functionCount: functionRows.length,
        maxFunctionLines,
        maxCyclomatic,
        maxCognitive,
    });

    const triggered = (
        row.fileLines >= options.minFileLines
        || row.maxFunctionLines >= options.minFunctionLines
        || row.maxCyclomatic >= options.minCyclomatic
        || row.maxCognitive >= options.minCognitive
    );

    return triggered ? row : null;
}

function sortRows(rows) {
    return [...rows].toSorted((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.fileLines !== left.fileLines) {
            return right.fileLines - left.fileLines;
        }
        if (right.maxCognitive !== left.maxCognitive) {
            return right.maxCognitive - left.maxCognitive;
        }
        if (right.maxCyclomatic !== left.maxCyclomatic) {
            return right.maxCyclomatic - left.maxCyclomatic;
        }
        return right.maxFunctionLines - left.maxFunctionLines;
    });
}

export function buildBoundaryWatchlist(options) {
    const targetFiles = resolveTargetFiles(options);
    const rows = [];

    for (const filePath of targetFiles) {
        const functionRows = scanFunctions(filePath, workspaceRoot);
        const row = buildWatchlistRow(filePath, functionRows, options);
        if (row) {
            rows.push(row);
        }
    }

    const sortedRows = sortRows(rows);

    return {
        scannedFiles: targetFiles.length,
        matchingFiles: sortedRows.length,
        thresholds: {
            minFileLines: options.minFileLines,
            minFunctionLines: options.minFunctionLines,
            minCyclomatic: options.minCyclomatic,
            minCognitive: options.minCognitive,
        },
        rows: sortedRows.slice(0, options.top),
    };
}

function printTextReport(report) {
    console.log('Boundary Watchlist');
    console.log(`Scanned files: ${report.scannedFiles}`);
    console.log(`Matching files: ${report.matchingFiles}`);
    console.log(
        `Thresholds: file>=${report.thresholds.minFileLines}, function>=${report.thresholds.minFunctionLines}, cyclomatic>=${report.thresholds.minCyclomatic}, cognitive>=${report.thresholds.minCognitive}`,
    );
    console.log('');

    if (report.rows.length === 0) {
        console.log('No files currently match the watchlist thresholds.');
        return;
    }

    for (const row of report.rows) {
        console.log(
            `${row.file} | score ${row.score} | file ${row.fileLines} | max-fn ${row.maxFunctionLines} | cyc ${row.maxCyclomatic} | cog ${row.maxCognitive} | triggers ${row.triggers.join(',')}`,
        );
    }
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = buildBoundaryWatchlist(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    printTextReport(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
