#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const DEFAULT_DIRS = ['src'];
const DEFAULT_TOP = 80;
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.local', 'deployments']);
const EXTENSIONS = new Set(['.ts', '.tsx']);

function parseInteger(value, fallback) {
    return Number.parseInt(value, 10) || fallback;
}

function parseList(value) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

const ARG_OPTION_DEFINITIONS = new Map([
    ['--top', { key: 'top', parse: value => parseInteger(value, DEFAULT_TOP) }],
    ['--dirs', { key: 'dirs', parse: parseList }],
    ['--files', { key: 'files', parse: parseList }],
    ['--min-cyclomatic', { key: 'minCyclomatic', parse: value => parseInteger(value, 0) }],
    ['--min-cognitive', { key: 'minCognitive', parse: value => parseInteger(value, 0) }]
]);

function parseValueOption(argv, index) {
    const arg = argv[index];
    const equalsIndex = arg.indexOf('=');
    const optionName = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const definition = ARG_OPTION_DEFINITIONS.get(optionName);
    if (!definition) {
        return null;
    }

    const inlineValue = equalsIndex === -1 ? null : arg.slice(equalsIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === null && !value) {
        return null;
    }
    return {
        consumedNext: inlineValue === null,
        key: definition.key,
        value: definition.parse(value)
    };
}

export function parseArgs(argv) {
    const options = {
        dirs: [...DEFAULT_DIRS],
        top: DEFAULT_TOP,
        json: false,
        minCyclomatic: 0,
        minCognitive: 0,
        files: []
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        if (arg === '--json') {
            options.json = true;
            continue;
        }
        const parsedOption = parseValueOption(argv, i);
        if (parsedOption) {
            options[parsedOption.key] = parsedOption.value;
            if (parsedOption.consumedNext) {
                i++;
            }
        }
    }

    return options;
}

export function printHelp() {
    console.log([
        'Complexity report',
        '',
        'Usage:',
        '  node tooling/scripts/repo/complexity-report.js [options]',
        '',
        'Options:',
        '  --top <n>                Number of rows in top list (default: 80)',
        '  --dirs <a,b,c>           Comma-separated source dirs (default: src)',
        '  --files <a,b,c>          Comma-separated explicit files to scan',
        '  --min-cyclomatic <n>     Minimum cyclomatic to include in results',
        '  --min-cognitive <n>      Minimum cognitive-approx to include in results',
        '  --json                   Output JSON',
        '  --help                   Show this help',
        '',
        'Examples:',
        '  npm run complexity:report',
        '  npm run complexity:report -- --top 30',
        '  npm run complexity:report -- --json --min-cyclomatic 15'
    ].join('\n'));
}

function walkFiles(rootDir, outFiles) {
    if (!fs.existsSync(rootDir)) {return;}
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

        const ext = path.extname(entry.name).toLowerCase();
        if (EXTENSIONS.has(ext)) {
            outFiles.push(fullPath);
        }
    }
}

function isDecisionNode(node) {
    switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.CaseClause:
            return true;
        default:
            return false;
    }
}

function binaryDecisionWeight(node) {
    if (!ts.isBinaryExpression(node)) {return 0;}
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {return 1;}
    if (kind === ts.SyntaxKind.BarBarToken) {return 1;}
    if (kind === ts.SyntaxKind.QuestionQuestionToken) {return 1;}
    return 0;
}

function complexityOfBody(body) {
    let complexity = 1;
    const visit = (node) => {
        if (isDecisionNode(node)) {complexity += 1;}
        complexity += binaryDecisionWeight(node);
        ts.forEachChild(node, visit);
    };
    visit(body);
    return complexity;
}

function cognitiveApproxOfBody(body) {
    let score = 0;

    const visit = (node, nesting) => {
        let nextNesting = nesting;

        if (isDecisionNode(node)) {
            score += 1 + nesting;
            nextNesting = nesting + 1;
        }

        if (ts.isBinaryExpression(node)) {
            const kind = node.operatorToken.kind;
            if (
                kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                kind === ts.SyntaxKind.BarBarToken ||
                kind === ts.SyntaxKind.QuestionQuestionToken
            ) {
                score += 1 + nesting;
            }
        }

        ts.forEachChild(node, child => visit(child, nextNesting));
    };

    visit(body, 0);
    return score;
}

function getEnclosingClassName(node) {
    let current = node.parent;
    while (current) {
        if (ts.isClassDeclaration(current)) {
            return current.name ? current.name.getText() : '<anonymous_class>';
        }
        current = current.parent;
    }
    return null;
}

function getFunctionName(node, sourceFile) {
    if (ts.isFunctionDeclaration(node)) {
        return node.name ? node.name.getText(sourceFile) : '<anonymous_function_decl>';
    }

    return getMemberOrLambdaName(node, sourceFile);
}

function getMemberOrLambdaName(node, sourceFile) {
    if (ts.isMethodDeclaration(node)) {
        const className = getEnclosingClassName(node);
        const methodName = node.name ? node.name.getText(sourceFile) : '<anonymous_method>';
        return className ? `${className}.${methodName}` : methodName;
    }

    if (ts.isConstructorDeclaration(node)) {
        const className = getEnclosingClassName(node) || '<anonymous_class>';
        return `${className}.constructor`;
    }

    if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const className = getEnclosingClassName(node);
        const accessorName = node.name ? node.name.getText(sourceFile) : '<anonymous_accessor>';
        return className ? `${className}.${accessorName}` : accessorName;
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return getLambdaName(node.parent, sourceFile);
    }

    return '<unknown_function>';
}

function getLambdaName(parent, sourceFile) {
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
    }
    if (parent && ts.isPropertyAssignment(parent)) {
        return parent.name.getText(sourceFile);
    }
    return '<anonymous_lambda>';
}

function getFunctionBody(node) {
    return 'body' in node ? node.body : null;
}

function lineOf(node, sourceFile) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getLineStarts(text) {
    const starts = [0];

    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '\n') {
            starts.push(index + 1);
        }
    }

    return starts;
}

function findLineIndex(lineStarts, position) {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const lineStart = lineStarts[mid];
        const nextLineStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY;

        if (position < lineStart) {
            high = mid - 1;
            continue;
        }

        if (position >= nextLineStart) {
            low = mid + 1;
            continue;
        }

        return mid;
    }

    return Math.max(0, lineStarts.length - 1);
}

export function countSubstantiveLines(text, languageVariant = ts.LanguageVariant.Standard) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, languageVariant, text);
    const lineStarts = getLineStarts(text);
    const substantiveLines = new Set();

    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        const tokenStart = scanner.getTokenPos();
        const tokenEnd = Math.max(tokenStart, scanner.getTextPos() - 1);
        const startLine = findLineIndex(lineStarts, tokenStart);
        const endLine = findLineIndex(lineStarts, tokenEnd);

        for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
            substantiveLines.add(lineIndex);
        }
    }

    return Math.max(1, substantiveLines.size);
}

function locOf(node, sourceFile) {
    const functionText = sourceFile.text.slice(node.getStart(sourceFile), node.getEnd());
    return countSubstantiveLines(functionText, sourceFile.languageVariant);
}

export function scanFunctions(filePath, repoRoot) {
    const code = fs.readFileSync(filePath, 'utf8');
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, scriptKind);

    const rows = [];

    const visit = (node) => {
        if (
            ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isConstructorDeclaration(node) ||
            ts.isGetAccessorDeclaration(node) ||
            ts.isSetAccessorDeclaration(node) ||
            ts.isArrowFunction(node) ||
            ts.isFunctionExpression(node)
        ) {
            const body = getFunctionBody(node);
            if (body) {
                rows.push({
                    file: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
                    line: lineOf(node, sourceFile),
                    name: getFunctionName(node, sourceFile),
                    cyclomatic: complexityOfBody(body),
                    cognitiveApprox: cognitiveApproxOfBody(body),
                    loc: locOf(node, sourceFile)
                });
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return rows;
}

export function sortRows(rows) {
    return [...rows].toSorted((a, b) => {
        if (b.cognitiveApprox !== a.cognitiveApprox) {return b.cognitiveApprox - a.cognitiveApprox;}
        if (b.cyclomatic !== a.cyclomatic) {return b.cyclomatic - a.cyclomatic;}
        return b.loc - a.loc;
    });
}

export function makeSummary(allRows, filteredRows, scannedFileCount) {
    return {
        scannedFiles: scannedFileCount,
        totalFunctions: allRows.length,
        filteredFunctions: filteredRows.length,
        overCyclomatic15: allRows.filter(r => r.cyclomatic >= 15).length,
        overCyclomatic20: allRows.filter(r => r.cyclomatic >= 20).length,
        overCognitive30: allRows.filter(r => r.cognitiveApprox >= 30).length,
        overCognitive40: allRows.filter(r => r.cognitiveApprox >= 40).length
    };
}

export function printTextReport(report, options) {
    const { summary, top } = report;

    console.log('Complexity Report');
    console.log(`Scanned files: ${summary.scannedFiles}`);
    console.log(`Total functions: ${summary.totalFunctions}`);
    console.log(`Filtered functions: ${summary.filteredFunctions}`);
    console.log(`Cyclomatic >= 15: ${summary.overCyclomatic15}`);
    console.log(`Cyclomatic >= 20: ${summary.overCyclomatic20}`);
    console.log(`Cognitive-approx >= 30: ${summary.overCognitive30}`);
    console.log(`Cognitive-approx >= 40: ${summary.overCognitive40}`);
    console.log('');
    console.log(`Top ${top.length} (sorted by cognitive-approx, then cyclomatic):`);

    if (top.length === 0) {
        console.log('No functions match the current filters.');
        return;
    }

    top.forEach((row, index) => {
        const rank = String(index + 1).padStart(2, ' ');
        const score = `cog:${String(row.cognitiveApprox).padStart(3, ' ')} cyc:${String(row.cyclomatic).padStart(3, ' ')} loc:${String(row.loc).padStart(4, ' ')}`;
        console.log(`${rank}. ${score}  ${row.file}:${row.line}  ${row.name}`);
    });

    if (options.minCyclomatic > 0 || options.minCognitive > 0) {
        console.log('');
        console.log(`Filters applied: min-cyclomatic=${options.minCyclomatic}, min-cognitive=${options.minCognitive}`);
    }
}

export function buildReport(options, repoRoot = process.cwd()) {
    const files = [];
    if (options.files.length > 0) {
        for (const file of options.files) {
            const resolved = path.isAbsolute(file) ? file : path.join(repoRoot, file);
            if (fs.existsSync(resolved)) {
                files.push(resolved);
            }
        }
    } else {
        for (const dir of options.dirs) {
            walkFiles(path.join(repoRoot, dir), files);
        }
    }

    const allRows = files.flatMap(file => scanFunctions(file, repoRoot));
    const filteredRows = allRows.filter(
        row => row.cyclomatic >= options.minCyclomatic && row.cognitiveApprox >= options.minCognitive
    );
    const sorted = sortRows(filteredRows);
    const top = sorted.slice(0, Math.max(1, options.top));

    const report = {
        generatedAt: new Date().toISOString(),
        options: {
            dirs: options.dirs,
            top: options.top,
            minCyclomatic: options.minCyclomatic,
            minCognitive: options.minCognitive
        },
        summary: makeSummary(allRows, filteredRows, files.length),
        top
    };

    return report;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const report = buildReport(options);
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    printTextReport(report, options);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
