import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const defaultOutputDir = path.join(workspaceRoot, 'artifacts', 'ai-metadata-studio-pack');

const includedFiles = [
    'src/services/workflowRuntime/modules/generateAiMetadata/geminiPrompts.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseSchema.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseBoxes.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/geminiTypes.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/liveRuntimeTagHelpers.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/tagVocabularyEnforcement.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/quotaManager.ts',
    'src/services/photoMetadata/coordinateNormalization.ts',
    'src/services/photoMetadata/types.ts',
    'src/services/photoMetadata/validation.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/index.ts',
    'src/services/workflowRuntime/modules/generateAiMetadata/schema.ts',
    'src/boundary/contracts/core.ts',
    'src/shared/aiMetadata/analysisOptions.ts',
    'tooling/scripts/repo/ai-metadata-debug.mjs',
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

This pack is a smaller, round-trip-safe subset of the AI metadata system intended for prompt tuning in Google AI Studio.

## Recommended edit targets
- src/services/workflowRuntime/modules/generateAiMetadata/geminiPrompts.ts
- src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseSchema.ts
- src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseBoxes.ts
- src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.ts

## Included files
${fileList}

## Existing single-photo runner
\`\`\`bash
npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> --imageStrategy=overview_only --metadataPass=scout --showPrompt=true --showSchema=true
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

    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    await copyIncludedFiles(outputDir);
    await writeMetadata(outputDir);

    console.log(`AI metadata studio pack written to ${outputDir}`);
    console.log(`Copied ${includedFiles.length} files.`);
}

await main();
