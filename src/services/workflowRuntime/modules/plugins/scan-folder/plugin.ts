import { extname, join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import type { WorkflowModulePlugin } from '../../../contracts';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);

function collectFolderFiles(rootPath: string, recursive: boolean): string[] {
    const discovered: string[] = [];
    const stack = [rootPath];
    while (stack.length > 0) {
        const currentPath = stack.pop();
        if (!currentPath) {
            continue;
        }
        for (const entry of readdirSync(currentPath)) {
            const fullPath = join(currentPath, entry);
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
                if (recursive) {
                    stack.push(fullPath);
                }
            } else if (IMAGE_EXTENSIONS.has(extname(fullPath).toLowerCase())) {
                discovered.push(fullPath);
            }
        }
    }
    return discovered.sort();
}

async function upsertAsset(db: ReturnType<DatabaseManager['getDb']>, originalPath: string): Promise<string> {
    const existing = db.prepare('SELECT id FROM assets WHERE original_path = ?').get(originalPath) as { id: string } | undefined;
    if (existing) {
        return existing.id;
    }
    const fileStats = statSync(originalPath);
    const assetId = uuidv4();
    db.prepare('INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(assetId, originalPath, null, fileStats.size, 0, 0, null, new Date().toISOString());
    return assetId;
}

export const scanFolderPlugin: WorkflowModulePlugin = {
    manifest: {
        id: 'runtime.scan_folder', contractVersion: 1, displayName: 'Scan folder',
        description: 'Discovers supported image files and emits library assets.',
        inputs: ['folder'], outputs: [], capabilities: ['derive'],
        milestones: [{ id: 'assets-discovered', label: 'Assets discovered' }],
        errorKinds: ['configuration', 'permanent'], fixtures: ['fixtures/empty-folder'],
    },
    validateConfiguration(configuration) {
        if (configuration.traversalMode !== undefined && configuration.traversalMode !== 'recursive' && configuration.traversalMode !== 'folder_only') {
            throw new Error('traversalMode must be recursive or folder_only');
        }
    },
    create(context) {
        const dbManager = context.dbManager as DatabaseManager | undefined;
        if (!dbManager) {
            throw new Error('runtime.scan_folder requires dbManager');
        }
        return {
            id: 'runtime.scan_folder', version: 1, capability: 'derive', accepts: ['folder'], produces: [],
            run: async (runtimeContext) => {
                scanFolderPlugin.validateConfiguration?.(runtimeContext.parameters);
                const recursive = runtimeContext.parameters.traversalMode === 'recursive';
                const emittedSubjects = [];
                for (const filePath of collectFolderFiles(runtimeContext.subject.subjectId, recursive)) {
                    emittedSubjects.push({ subjectType: 'asset', subjectId: await upsertAsset(dbManager.getDb(), filePath) });
                }
                return { outputs: [], emittedSubjects };
            },
            estimate: async (runtimeContext) => ({
                outputs: [], cost: 0,
                emittedSubjects: collectFolderFiles(runtimeContext.subject.subjectId, runtimeContext.parameters.traversalMode === 'recursive')
                    .map((subjectId) => ({ subjectType: 'asset', subjectId })),
            }),
        };
    },
};
