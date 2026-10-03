import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const defaultOutputDir = path.join(workspaceRoot, 'artifacts', 'ai-metadata-studio-pack');

const includedFiles = [
    'src/shared/photoAnalysis/contracts.ts',
    'src/services/photoAnalysis/prompts.ts',
    'src/services/photoAnalysis/stageContracts.ts',
    'src/services/photoAnalysis/geometry.ts',
    'src/services/photoAnalysis/imageInputs.ts',
    'src/services/photoAnalysis/geminiProvider.ts',
    'src/services/photoAnalysis/pipeline.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.ts',
    'tooling/scripts/repo/ai-metadata-debug.mjs',
    'tooling/scripts/repo/photo-analysis-debug-support.mjs',
    'package.json',
    'tooling/config/tsconfig.core.json',
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

function resolveOutputDir(args) {
    if (typeof args.outDir === 'string' && args.outDir.trim() !== '') {
        return path.resolve(workspaceRoot, args.outDir);
    }
    return defaultOutputDir;
}

async function copyIncludedFiles(outputDir) {
    for (const relativePath of includedFiles) {
        const sourcePath = path.join(workspaceRoot, relativePath);
        const destinationPath = path.join(outputDir, 'files', relativePath);
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.copyFile(sourcePath, destinationPath);
    }
}

function buildReadme() {
    const fileList = includedFiles.map((filePath) => `- ${filePath}`).join('\n');

    return `# AI Metadata Studio Pack

This pack contains the evidence-oriented photo-analysis contracts and runtime preparation used for prompt tuning in Google AI Studio.

## Recommended edit targets
- src/services/photoAnalysis/prompts.ts
- src/services/photoAnalysis/stageContracts.ts
- src/shared/photoAnalysis/contracts.ts
- src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.ts

## Included files
${fileList}

## Existing single-photo runner
\`\`\`bash
npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> --metadataPass=scout --dryRun=true --outDir=artifacts/analysis-request
\`\`\`

## Suggested Repomix flow
Run Repomix against the \`files/\` directory in this pack, not the whole repo. That keeps the context small while preserving the real repo paths for reintegration.

Example:
\`\`\`bash
cd artifacts/ai-metadata-studio-pack
repomix files
\`\`\`

## Reintegration note
Keep edits aligned to the copied repo paths under \`files/\`. That makes it much easier to apply AI Studio changes back into the real repo without path drift.

The request export includes \`image-manifest.json\`, \`source-references.json\`, \`independent-observations.json\`, \`targets.json\`, \`response-schema.json\` and exact JPEG inputs. Refine requires explicit \`--targets=<JSON>\` or \`--targetsFile=<path>\`. Source IDs and Face IDs must remain unchanged when comparing model/prompt variants. Live debug reports actual usage and per-attempt latency/retry failures; it opens the database read-only.
`;
}

async function writeMetadata(outputDir) {
    await fs.writeFile(
        path.join(outputDir, 'README.md'),
        buildReadme(),
        'utf8',
    );
    await fs.writeFile(
        path.join(outputDir, 'included-files.json'),
        `${JSON.stringify(includedFiles, null, 2)}\n`,
        'utf8',
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outputDir = resolveOutputDir(args);

    await fs.mkdir(outputDir, { recursive: true });
    await copyIncludedFiles(outputDir);
    await writeMetadata(outputDir);

    console.log(`AI metadata studio pack written to ${outputDir}`);
    console.log(`Copied ${includedFiles.length} files.`);
}

await main();
