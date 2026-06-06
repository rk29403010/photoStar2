import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const defaultOutputDir = path.join(workspaceRoot, 'artifacts', 'ai-metadata-bundle');
const packageJsonPath = path.join(workspaceRoot, 'package.json');

const aliasRoots = new Map([
    ['@ui/', 'src/ui/'],
    ['@boundary/', 'src/boundary/'],
    ['@contracts/', 'src/boundary/contracts/'],
    ['@shared/', 'src/shared/'],
]);

const defaultEntries = [
    'src/services/workflowRuntime/modules/generateAiMetadata/index.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.ts',
    'tooling/scripts/repo/ai-metadata-debug.mjs',
];

const importPatterns = [
    /\bimport\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
];

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const [key, ...valueParts] = arg.slice(2).split('=');
        options[key] = valueParts.length > 0 ? valueParts.join('=') : 'true';
    }
    return options;
}

function toRelativeWorkspacePath(targetPath) {
    return path.relative(workspaceRoot, targetPath).replaceAll('\\', '/');
}

function resolveOutputDir(args) {
    if (typeof args.outDir === 'string' && args.outDir.trim() !== '') {
        return path.resolve(workspaceRoot, args.outDir);
    }
    return defaultOutputDir;
}

function resolveEntryPaths(args) {
    const rawEntries = typeof args.entries === 'string' && args.entries.trim() !== ''
        ? args.entries.split(',').map((entry) => entry.trim()).filter(Boolean)
        : defaultEntries;
    return rawEntries.map((entry) => path.resolve(workspaceRoot, entry));
}

function isRelativeSpecifier(specifier) {
    return specifier.startsWith('./') || specifier.startsWith('../');
}

function isNodeBuiltinSpecifier(specifier) {
    return specifier.startsWith('node:');
}

function resolveAliasSpecifier(specifier) {
    for (const [aliasPrefix, aliasRoot] of aliasRoots.entries()) {
        if (specifier.startsWith(aliasPrefix)) {
            return path.resolve(workspaceRoot, aliasRoot, specifier.slice(aliasPrefix.length));
        }
    }
    return null;
}

async function fileExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function resolveLocalSpecifier(sourceFilePath, specifier) {
    const basePath = isRelativeSpecifier(specifier)
        ? path.resolve(path.dirname(sourceFilePath), specifier)
        : resolveAliasSpecifier(specifier);

    if (!basePath) {
        return null;
    }

    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.tsx'),
        path.join(basePath, 'index.js'),
        path.join(basePath, 'index.mjs'),
        path.join(basePath, 'index.cjs'),
    ];

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Unable to resolve local import '${specifier}' from ${toRelativeWorkspacePath(sourceFilePath)}.`);
}

function collectSpecifiers(fileText) {
    const specifiers = [];
    for (const pattern of importPatterns) {
        let match = pattern.exec(fileText);
        while (match) {
            specifiers.push(match[1]);
            match = pattern.exec(fileText);
        }
        pattern.lastIndex = 0;
    }
    return specifiers;
}

function getExternalPackageName(specifier) {
    if (isNodeBuiltinSpecifier(specifier) || isRelativeSpecifier(specifier) || resolveAliasSpecifier(specifier)) {
        return null;
    }
    if (specifier.startsWith('#')) {
        return null;
    }
    if (specifier.startsWith('@')) {
        const [scope, name] = specifier.split('/');
        return scope && name ? `${scope}/${name}` : specifier;
    }
    const [name] = specifier.split('/');
    return name || null;
}

async function traceBundleGraph(entryPaths) {
    const localFiles = new Set();
    const externalSpecifiers = new Set();
    const nodeBuiltins = new Set();
    const queue = [...entryPaths];

    while (queue.length > 0) {
        const currentFilePath = queue.shift();
        if (!currentFilePath || localFiles.has(currentFilePath)) {
            continue;
        }

        localFiles.add(currentFilePath);
        const fileText = await fs.readFile(currentFilePath, 'utf8');
        const specifiers = collectSpecifiers(fileText);
        for (const specifier of specifiers) {
            if (isNodeBuiltinSpecifier(specifier)) {
                nodeBuiltins.add(specifier);
                continue;
            }

            const resolvedLocalPath = await resolveLocalSpecifier(currentFilePath, specifier);
            if (resolvedLocalPath) {
                queue.push(resolvedLocalPath);
                continue;
            }

            externalSpecifiers.add(specifier);
        }
    }

    return {
        localFiles: Array.from(localFiles).sort(),
        externalSpecifiers: Array.from(externalSpecifiers).sort(),
        nodeBuiltins: Array.from(nodeBuiltins).sort(),
    };
}

async function loadPackageJson() {
    const fileText = await fs.readFile(packageJsonPath, 'utf8');
    return JSON.parse(fileText);
}

function buildExternalPackageRows(packageJson, externalSpecifiers) {
    const dependencyVersions = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
    };
    const packageNames = new Set();
    for (const specifier of externalSpecifiers) {
        const packageName = getExternalPackageName(specifier);
        if (packageName) {
            packageNames.add(packageName);
        }
    }

    return Array.from(packageNames)
        .sort()
        .map((packageName) => ({
            packageName,
            version: dependencyVersions[packageName] ?? 'not-found-in-package-json',
        }));
}

async function writeCopiedFiles(outputDir, localFiles) {
    const filesRoot = path.join(outputDir, 'files');
    for (const sourceFilePath of localFiles) {
        const relativePath = toRelativeWorkspacePath(sourceFilePath);
        const destinationPath = path.join(filesRoot, relativePath);
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.copyFile(sourceFilePath, destinationPath);
    }
}

function buildReadme(params) {
    const entryList = params.entryPaths.map((entryPath) => `- ${toRelativeWorkspacePath(entryPath)}`).join('\n');
    const externalPackageLines = params.externalPackages
        .map((entry) => `- ${entry.packageName} @ ${entry.version}`)
        .join('\n');
    const fileCount = params.localFiles.length;

    return `# AI Metadata Bundle

This bundle captures the current repo-side AI metadata module code plus the existing single-photo debug runner.

## Included entry points
${entryList}

## Included local source files
- ${fileCount} files copied under \`files/\`
- Full local dependency graph for the entry points above

## External npm packages used by the bundle
${externalPackageLines || '- none'}

## Existing single-photo test rig
The repo already exposes the debug runner:

\`\`\`bash
npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> --imageStrategy=overview_only --metadataPass=scout --showPrompt=true --showSchema=true
\`\`\`

The copied runner source is:
- \`files/tooling/scripts/repo/ai-metadata-debug.mjs\`

## Notes for Google AI Studio
- Local repo imports are copied here as source files.
- External npm packages are listed in \`external-packages.json\` and \`external-packages.txt\`, but not bundled.
- Node built-ins used by the copied files are listed in \`node-builtins.txt\`.
`;
}

async function writeBundleMetadata(params) {
    const {
        outputDir,
        entryPaths,
        localFiles,
        externalSpecifiers,
        externalPackages,
        nodeBuiltins,
    } = params;

    const manifest = {
        generatedAt: new Date().toISOString(),
        workspaceRoot,
        entryPaths: entryPaths.map(toRelativeWorkspacePath),
        localFiles: localFiles.map(toRelativeWorkspacePath),
        externalSpecifiers,
        externalPackages,
        nodeBuiltins,
    };

    await fs.writeFile(
        path.join(outputDir, 'bundle-manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );
    await fs.writeFile(
        path.join(outputDir, 'external-packages.json'),
        `${JSON.stringify(externalPackages, null, 2)}\n`,
        'utf8',
    );
    await fs.writeFile(
        path.join(outputDir, 'external-packages.txt'),
        `${externalPackages.map((entry) => `${entry.packageName} ${entry.version}`).join('\n')}\n`,
        'utf8',
    );
    await fs.writeFile(
        path.join(outputDir, 'node-builtins.txt'),
        `${nodeBuiltins.join('\n')}\n`,
        'utf8',
    );
    await fs.writeFile(
        path.join(outputDir, 'README.md'),
        buildReadme({
            entryPaths,
            localFiles,
            externalPackages,
        }),
        'utf8',
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outputDir = resolveOutputDir(args);
    const entryPaths = resolveEntryPaths(args);
    const packageJson = await loadPackageJson();
    const tracedGraph = await traceBundleGraph(entryPaths);
    const externalPackages = buildExternalPackageRows(packageJson, tracedGraph.externalSpecifiers);

    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    await writeCopiedFiles(outputDir, tracedGraph.localFiles);
    await writeBundleMetadata({
        outputDir,
        entryPaths,
        localFiles: tracedGraph.localFiles,
        externalSpecifiers: tracedGraph.externalSpecifiers,
        externalPackages,
        nodeBuiltins: tracedGraph.nodeBuiltins,
    });

    console.log(`AI metadata bundle written to ${outputDir}`);
    console.log(`Copied ${tracedGraph.localFiles.length} local files.`);
    console.log(`Listed ${externalPackages.length} external npm packages.`);
}

await main();
