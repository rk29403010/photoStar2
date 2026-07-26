#!/usr/bin/env node
/** Deterministic AST-based boundary audit for extension plug-ins. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd();
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/u;
const families = [
    { name: 'workflow module', root: 'src/services/workflowRuntime/modules/plugins', hostRoots: ['src/services/workflowRuntime', 'src/entrypoints/core'], allowedIdRoots: ['src/services/workflowRuntime/modules/plugins', 'src/services/workflowRuntime/workflows'], contractTest: 'tests/core/workflow-module-plugin-contract.test.cjs', registryScript: 'generate-workflow-module-registry.mjs' },
    { name: 'photo tool', root: 'src/services/photoEditing/tools/plugins', hostRoots: ['src/services/photoEditing', 'src/ui/components/photo-editor'], allowedIdRoots: ['src/services/photoEditing/tools/plugins'], contractTest: 'tests/core/photo-edit-tool-plugin-contract.test.cjs', registryScript: 'generate-photo-edit-tool-registry.mjs' },
];
const presentationProperties = new Set(['label', 'icon', 'group', 'defaults', 'capabilities', 'help', 'errorBoundaryDisplayName']);

function normalized(workspaceRoot, file) { return relative(workspaceRoot, file).replaceAll('\\', '/'); }
function files(directory) {
    if (!existsSync(directory)) { return []; }
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = join(directory, entry.name);
        return entry.isDirectory() ? files(file) : [file];
    });
}
function sourceFile(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); }
function isWithin(file, directory) { return file === directory || file.startsWith(`${directory}/`); }
function propertyName(node) {
    if (!node.name) { return ''; }
    return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
}
function stringLiteral(node) { return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : ''; }
function visit(node, callback) { callback(node); ts.forEachChild(node, (child) => visit(child, callback)); }
function importsFrom(source) {
    const imports = [];
    visit(source, (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
            const specifier = stringLiteral(node.moduleSpecifier);
            if (specifier) { imports.push(specifier); }
        }
    });
    return imports;
}
function literalValues(source) {
    const values = [];
    visit(source, (node) => { if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { values.push(node.text); } });
    return values;
}
function propertyValues(source) {
    const values = new Map();
    visit(source, (node) => {
        if (!ts.isPropertyAssignment(node)) { return; }
        const name = propertyName(node);
        if (presentationProperties.has(name)) { values.set(`${name}:${node.initializer.getText(source)}`, name); }
    });
    return values;
}
function pluginDirectories(workspaceRoot, family) {
    const directory = join(workspaceRoot, family.root);
    if (!existsSync(directory)) { return []; }
    return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(directory, entry.name));
}
function pluginId(directory) {
    const pluginFile = join(directory, 'plugin.ts');
    if (!existsSync(pluginFile)) { return ''; }
    let id = '';
    visit(sourceFile(pluginFile), (node) => {
        if (ts.isPropertyAssignment(node) && propertyName(node) === 'id') { id ||= stringLiteral(node.initializer); }
    });
    return id;
}
function pluginForFile(workspaceRoot, family, file) {
    const relativeFile = normalized(workspaceRoot, file);
    const prefix = `${family.root}/`;
    if (!relativeFile.startsWith(prefix)) { return ''; }
    return relativeFile.slice(prefix.length).split('/')[0];
}
function importTarget(workspaceRoot, file, specifier) {
    if (!specifier.startsWith('.')) { return ''; }
    const base = resolve(join(file, '..'), specifier);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, 'index.ts')];
    return candidates.find(existsSync) ?? '';
}
function diagnostic(diagnostics, file, violation, boundary, expected) {
    if (!diagnostics.some((item) => item.file === file && item.violation === violation && item.boundary === boundary)) {
        diagnostics.push({ file, violation, boundary, expected });
    }
}

// The AST traversal must inspect the complete family atomically so diagnostics
// retain a single registry-derived ownership view.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function auditExtensionArchitecture({ workspaceRoot = root, checkRegistries = true } = {}) {
    const diagnostics = [];
    for (const family of families) {
        const rootDirectory = join(workspaceRoot, family.root);
        if (!existsSync(rootDirectory)) {
            diagnostic(diagnostics, family.root, 'plug-in root is missing', family.name, 'self-contained plug-in directory');
            continue;
        }
        if (!existsSync(join(workspaceRoot, family.contractTest))) {
            diagnostic(diagnostics, family.contractTest, 'missing reusable contract test', family.name, 'family-wide generated-registry contract test');
        }

        const ids = new Map();
        const metadata = new Set();
        for (const directory of pluginDirectories(workspaceRoot, family)) {
            const plugin = normalized(workspaceRoot, directory);
            const id = pluginId(directory);
            if (!id) { diagnostic(diagnostics, `${plugin}/plugin.ts`, 'invalid plug-in contract: missing literal id', family.name, 'declare the stable plug-in ID in its plug-in'); }
            else if (ids.has(id)) { diagnostic(diagnostics, `${plugin}/plugin.ts`, `duplicate plug-in ID '${id}' also declared by ${ids.get(id)}`, family.name, 'one manifest-backed plug-in per stable ID'); }
            else { ids.set(id, plugin); }
            if (!existsSync(join(directory, 'manifest.ts'))) { diagnostic(diagnostics, plugin, 'missing manifest registration input', family.name, 'manifest.ts exported through generated registry'); }
            for (const file of files(directory).filter((item) => SOURCE_EXTENSION.test(item))) {
                const source = sourceFile(file);
                for (const value of propertyValues(source).keys()) { metadata.add(value); }
                const owner = pluginForFile(workspaceRoot, family, file);
                for (const specifier of importsFrom(source)) {
                    const target = importTarget(workspaceRoot, file, specifier);
                    const targetOwner = target ? pluginForFile(workspaceRoot, family, target) : '';
                    if (targetOwner && targetOwner !== owner) {
                        diagnostic(diagnostics, normalized(workspaceRoot, file), `plug-in imports implementation owned by '${targetOwner}' (${specifier})`, family.name, 'shared contract or generic host extension point');
                    }
                }
            }
        }

        for (const hostRoot of family.hostRoots) {
            const absoluteHostRoot = join(workspaceRoot, hostRoot);
            for (const file of files(absoluteHostRoot).filter((item) => SOURCE_EXTENSION.test(item))) {
                const rel = normalized(workspaceRoot, file);
                if (isWithin(rel, family.root) || rel.includes('/generated') || rel.startsWith('tests/')) { continue; }
                const source = sourceFile(file);
                for (const specifier of importsFrom(source)) {
                    if (specifier.includes('/plugins/')) {
                        diagnostic(diagnostics, rel, `host imports a specific plug-in (${specifier})`, hostRoot, 'generated registry and generic extension contract');
                    }
                }
                const permitsIds = family.allowedIdRoots.some((allowed) => isWithin(rel, allowed));
                if (!permitsIds) {
                    for (const value of literalValues(source).filter((candidate) => ids.has(candidate))) {
                        diagnostic(diagnostics, rel, `host-side dispatch literal '${value}'`, hostRoot, 'registry lookup using persisted extension ID');
                    }
                    for (const value of propertyValues(source).keys()) {
                        if (metadata.has(value)) { diagnostic(diagnostics, rel, `duplicate extension-owned presentation metadata '${value}'`, hostRoot, 'own the metadata in the plug-in manifest'); }
                    }
                }
                visit(source, (node) => {
                    if (ts.isPropertyAccessExpression(node) && node.name.text === 'registerLegacy') {
                        diagnostic(diagnostics, rel, 'obsolete legacy registration', hostRoot, 'registerPlug-in through generated registry');
                    }
                    if (ts.isSwitchStatement(node) && node.caseBlock.clauses.some((clause) => ts.isCaseClause(clause) && ids.has(stringLiteral(clause.expression)))) {
                        diagnostic(diagnostics, rel, 'central extension dispatch switch', hostRoot, 'registry contribution owned by the plug-in');
                    }
                });
            }
        }
        if (checkRegistries) {
            const result = spawnSync(process.execPath, [join(workspaceRoot, 'tooling/scripts/repo', family.registryScript), '--check'], { cwd: workspaceRoot, encoding: 'utf8' });
            if (result.status !== 0) { diagnostic(diagnostics, 'generated registry', (result.stderr ?? '').trim() || (result.stdout ?? '').trim() || result.error?.message || 'registry check failed', 'machine-owned registry', 'regenerate from manifests'); }
        }
    }
    return diagnostics;
}

function main() {
    const diagnostics = auditExtensionArchitecture({});
    if (diagnostics.length) {
        for (const item of diagnostics) { console.error(`[extension-policy] ${item.file}: ${item.violation}; boundary=${item.boundary}; expected=${item.expected}`); }
        process.exitCode = 1;
        return;
    }
    console.log('[extension-policy] plug-in boundaries passed.');
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) { main(); }
