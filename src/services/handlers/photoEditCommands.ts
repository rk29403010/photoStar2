import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type {
    PhotoEditDocument,
    PhotoEditMask,
    PhotoEditOperation,
    RenderPhotoEditInput,
    SavePhotoEditInput,
} from '../../boundary/contracts/photoEditor';
import { renderPhotoEdit } from '../photoEditing/editRenderer';
import { resolvePhotoEditStyle, versionPhotoEditStyleOperations } from '../photoEditing/photoEditStyleRecipes';
import type { CommandContext, CommandHandlerMap } from './types';

type EditRow = {
    id: string;
    source_asset_id: string;
    rendered_asset_id: string | null;
    parent_edit_id: string | null;
    name: string;
    operations_json: string;
    masks_json: string;
    status: 'draft' | 'rendered';
    created_at: string;
    updated_at: string;
};

function parseList<T>(value: string): T[] {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {throw new Error('Invalid editor document data');}
    return parsed as T[];
}

function toDocument(row: EditRow): PhotoEditDocument {
    return {
        id: row.id,
        sourceAssetId: row.source_asset_id,
        renderedAssetId: row.rendered_asset_id,
        parentEditId: row.parent_edit_id,
        name: row.name,
        operations: parseList<PhotoEditOperation>(row.operations_json),
        masks: parseList<PhotoEditMask>(row.masks_json),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function requireAssetPath(db: Database.Database, assetId: string): string {
    const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as { original_path: string } | undefined;
    if (!asset) {throw new Error(`Asset '${assetId}' was not found`);}
    return asset.original_path;
}

function loadDocument(db: Database.Database, editId: string): PhotoEditDocument | null {
    const row = db.prepare('SELECT * FROM photo_edit_documents WHERE id = ?').get(editId) as EditRow | undefined;
    return row ? toDocument(row) : null;
}

function validateDocumentInput(input: SavePhotoEditInput): void {
    if (!input.id || !input.sourceAssetId || !input.name.trim()) {throw new Error('Edit id, source asset, and name are required');}
    if (!Array.isArray(input.operations) || !Array.isArray(input.masks)) {throw new Error('Edit operations and masks must be arrays');}
    const ids = new Set<string>();
    for (const operation of input.operations) {
        if (!operation.id || ids.has(operation.id)) {throw new Error('Each edit operation must have a unique id');}
        ids.add(operation.id);
    }
}

function saveDocument(db: Database.Database, input: SavePhotoEditInput): PhotoEditDocument {
    validateDocumentInput(input);
    requireAssetPath(db, input.sourceAssetId);
    db.prepare(`
        INSERT INTO photo_edit_documents (id, source_asset_id, parent_edit_id, name, operations_json, masks_json, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
        ON CONFLICT(id) DO UPDATE SET
            source_asset_id = excluded.source_asset_id,
            parent_edit_id = excluded.parent_edit_id,
            name = excluded.name,
            operations_json = excluded.operations_json,
            masks_json = excluded.masks_json,
            status = CASE WHEN photo_edit_documents.rendered_asset_id IS NULL THEN 'draft' ELSE photo_edit_documents.status END,
            updated_at = CURRENT_TIMESTAMP
    `).run(input.id, input.sourceAssetId, input.parentEditId ?? null, input.name.trim(), JSON.stringify(input.operations), JSON.stringify(input.masks));
    return loadDocument(db, input.id)!;
}

async function writePreview(db: Database.Database, sourcePath: string, input: SavePhotoEditInput): Promise<string> {
    const buffer = await renderPhotoEdit(sourcePath, input.operations, input.masks, {
        maxWidth: 900,
        resolveAssetSource: (assetId) => requireAssetPath(db, assetId),
    });
    return `data:image/webp;base64,${(await sharp(buffer).webp({ quality: 82 }).toBuffer()).toString('base64')}`;
}

function findEditVersionGroup(db: Database.Database, assetId: string): string | null {
    const row = db.prepare(`
        SELECT m.group_id FROM asset_group_members m
        JOIN asset_groups g ON g.id = m.group_id
        WHERE m.asset_id = ? AND g.type = 'edit_version'
        LIMIT 1
    `).get(assetId) as { group_id: string } | undefined;
    return row?.group_id ?? null;
}

function updateVersionGroup(db: Database.Database, groupId: string, sourceAssetId: string, renderedAssetId: string): void {
    const groupExists = Boolean(db.prepare('SELECT 1 FROM asset_groups WHERE id = ?').get(groupId));
    db.prepare(`
        INSERT OR IGNORE INTO asset_groups (id, type, status, title, canonical_asset_id, algorithm_version)
        VALUES (?, 'edit_version', 'locked', 'Photo edits', ?, 'photo_editor_v1')
    `).run(groupId, renderedAssetId);
    db.prepare('INSERT OR IGNORE INTO asset_group_members (group_id, asset_id, role, rank) VALUES (?, ?, ?, 1000)')
        .run(groupId, sourceAssetId, groupExists ? 'member' : 'original');
    db.prepare("UPDATE asset_group_members SET role = 'member' WHERE group_id = ? AND role = 'canonical'").run(groupId);
    db.prepare('UPDATE asset_group_members SET rank = COALESCE(rank, 0) + 1 WHERE group_id = ?').run(groupId);
    db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, 'canonical', -1)
        ON CONFLICT(group_id, asset_id) DO UPDATE SET role = 'canonical', rank = -1
    `).run(groupId, renderedAssetId);
    db.prepare("UPDATE asset_groups SET canonical_asset_id = ?, status = 'locked', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(renderedAssetId, groupId);
}

async function generateRenderedPreviews(db: Database.Database, libraryDir: string, assetId: string, outputPath: string): Promise<void> {
    const previewsDir = join(libraryDir, 'previews');
    await mkdir(previewsDir, { recursive: true });
    for (const [size, width] of [['thumbnail', 256], ['large', 1080]] as const) {
        const previewPath = join(previewsDir, `${assetId}-${size}.webp`);
        await sharp(outputPath).resize(width, null, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(previewPath);
        db.prepare('INSERT OR REPLACE INTO previews (asset_id, size, path, version) VALUES (?, ?, ?, 4)').run(assetId, size, previewPath);
    }
}

async function renderDocument(ctx: CommandContext, input: RenderPhotoEditInput): Promise<{ document: PhotoEditDocument; assetId: string }> {
    const db = ctx.dbManager.getDb();
    const saved = saveDocument(db, input);
    const sourcePath = requireAssetPath(db, input.sourceAssetId);
    const existingAssetId = input.mode === 'replace_rendered' ? saved.renderedAssetId : null;
    const assetId = existingAssetId ?? uuidv4();
    const editsDir = join(ctx.LIB_DIR, 'edits');
    await mkdir(editsDir, { recursive: true });
    const outputPath = join(editsDir, `${assetId}.jpg`);
    const temporaryPath = `${outputPath}.tmp`;
    const rendered = await renderPhotoEdit(sourcePath, input.operations, input.masks, {
        resolveAssetSource: (sourceAssetId) => requireAssetPath(db, sourceAssetId),
    });
    await sharp(rendered).flatten({ background: '#ffffff' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).withMetadata().toFile(temporaryPath);
    await rename(temporaryPath, outputPath);
    const metadata = await sharp(outputPath).metadata();
    const file = await stat(outputPath);
    const groupId = findEditVersionGroup(db, input.sourceAssetId) ?? uuidv4();

    db.transaction(() => {
        db.prepare(`
            INSERT INTO assets (id, original_path, file_size, width, height, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET original_path = excluded.original_path, file_size = excluded.file_size,
                width = excluded.width, height = excluded.height
        `).run(assetId, outputPath, file.size, metadata.width ?? null, metadata.height ?? null);
        updateVersionGroup(db, groupId, input.sourceAssetId, assetId);
        db.prepare("UPDATE photo_edit_documents SET rendered_asset_id = ?, status = 'rendered', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(assetId, input.id);
    })();
    await generateRenderedPreviews(db, dirname(db.name), assetId, outputPath);
    ctx.eventBus.emit({ type: 'AssetUpdated', assetId });
    return { document: loadDocument(db, input.id)!, assetId };
}

function respondWithError(ctx: CommandContext, error: unknown): void {
    ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
}

export const photoEditCommandHandlers: CommandHandlerMap = {
    get_photo_edit_workspace: (ctx) => {
        try {
            const { assetId } = ctx.payload as { assetId: string };
            const db = ctx.dbManager.getDb();
            requireAssetPath(db, assetId);
            const row = db.prepare(`
                SELECT * FROM photo_edit_documents
                WHERE source_asset_id = ? OR rendered_asset_id = ?
                ORDER BY updated_at DESC LIMIT 1
            `).get(assetId, assetId) as EditRow | undefined;
            const document = row ? toDocument(row) : null;
            const styles = db.prepare('SELECT * FROM photo_edit_styles ORDER BY name').all().map((style) => {
                const value = style as { id: string; name: string; operations_json: string; masks_json: string; created_at: string; updated_at: string };
                return resolvePhotoEditStyle({ id: value.id, name: value.name, operations: parseList<PhotoEditOperation>(value.operations_json), masks: parseList<PhotoEditMask>(value.masks_json), createdAt: value.created_at, updatedAt: value.updated_at });
            });
            ctx.respond(ctx.id, 'ok', { document, styles }, null, ctx.originWs);
        } catch (error) {respondWithError(ctx, error);}
    },
    preview_photo_edit: async (ctx) => {
        try {
            const input = ctx.payload as SavePhotoEditInput;
            validateDocumentInput(input);
            const db = ctx.dbManager.getDb();
            const sourcePath = requireAssetPath(db, input.sourceAssetId);
            ctx.respond(ctx.id, 'ok', { previewDataUrl: await writePreview(db, sourcePath, input) }, null, ctx.originWs);
        } catch (error) {respondWithError(ctx, error);}
    },
    save_photo_edit: (ctx) => {
        try {
            const document = saveDocument(ctx.dbManager.getDb(), ctx.payload as SavePhotoEditInput);
            ctx.respond(ctx.id, 'ok', { document }, null, ctx.originWs);
        } catch (error) {respondWithError(ctx, error);}
    },
    render_photo_edit: async (ctx) => {
        try {
            const result = await renderDocument(ctx, ctx.payload as RenderPhotoEditInput);
            ctx.respond(ctx.id, 'ok', result, null, ctx.originWs);
        } catch (error) {respondWithError(ctx, error);}
    },
    save_photo_edit_style: (ctx) => {
        try {
            const { id, name, operations, masks } = ctx.payload as { id: string; name: string; operations: PhotoEditOperation[]; masks: PhotoEditMask[] };
            if (!id || !name.trim()) {throw new Error('Style id and name are required');}
            ctx.dbManager.getDb().prepare(`
                INSERT INTO photo_edit_styles (id, name, operations_json, masks_json) VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, operations_json = excluded.operations_json,
                    masks_json = excluded.masks_json, updated_at = CURRENT_TIMESTAMP
            `).run(id, name.trim(), JSON.stringify(versionPhotoEditStyleOperations(operations)), JSON.stringify(masks));
            ctx.respond(ctx.id, 'ok', { id }, null, ctx.originWs);
        } catch (error) {respondWithError(ctx, error);}
    },
};