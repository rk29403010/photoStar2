import { extname, join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../data/db';
import { getExifData, hashFile } from '../../file-utils';
import type { ModuleDefinition } from '../contracts';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']);

function isImageFile(filePath: string): boolean {
    return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

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
                continue;
            }
            if (isImageFile(fullPath)) {
                discovered.push(fullPath);
            }
        }
    }

    return discovered.sort();
}

async function upsertAsset(
    db: ReturnType<DatabaseManager['getDb']>,
    originalPath: string,
): Promise<string> {
    const existing = db.prepare('SELECT id FROM assets WHERE original_path = ?').get(originalPath) as
        | { id: string }
        | undefined;

    if (existing) {
        return existing.id;
    }

    const fileStats = statSync(originalPath);
    const exif = await getExifData(originalPath);
    const assetId = uuidv4();
    db.prepare(`
        INSERT INTO assets (
            id,
            original_path,
            file_hash,
            file_size,
            width,
            height,
            exif_datetime,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        assetId,
        originalPath,
        await hashFile(originalPath),
        fileStats.size,
        exif?.width ?? 0,
        exif?.height ?? 0,
        fileStats.birthtime.toISOString(),
        new Date().toISOString(),
    );
    return assetId;
}

export interface ScanFolderModuleOptions {
    dbManager: DatabaseManager;
}

export function createScanFolderModule(options: ScanFolderModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.scan_folder',
        version: 1,
        capability: 'derive',
        accepts: ['folder'],
        produces: [],
        run: async (context) => {
            const traversalMode = context.parameters.traversalMode === 'recursive' ? 'recursive' : 'folder_only';
            const filePaths = collectFolderFiles(context.subject.subjectId, traversalMode === 'recursive');
            const emittedSubjects = [];

            for (const filePath of filePaths) {
                const assetId = await upsertAsset(options.dbManager.getDb(), filePath);
                emittedSubjects.push({ subjectType: 'asset', subjectId: assetId });
            }

            return { outputs: [], emittedSubjects };
        },
    };
}
