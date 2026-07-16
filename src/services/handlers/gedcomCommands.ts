import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { CommandHandlerMap } from './types';

// Helper to compute SHA-256 hash of tree content
function computeHash(content: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
}

type HeaderMetadata = {
    date: string;
    time: string;
    version: string;
};

function applyHeaderLine(metadata: HeaderMetadata, line: string): void {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) { return; }
    const fieldByTag: Record<string, keyof HeaderMetadata> = {
        '1:DATE': 'date',
        '2:TIME': 'time',
        '2:VERS': 'version',
    };
    const field = fieldByTag[`${parts[0]}:${parts[1]}`];
    if (field) {
        metadata[field] = parts.slice(2).join(' ');
    }
}

// Helper to extract version/date label from GEDCOM header
function readHeaderMetadata(content: string): HeaderMetadata {
    const lines = content.split(/\r?\n/).slice(0, 100);
    const metadata: HeaderMetadata = { date: '', time: '', version: '' };
    for (const line of lines) {
        applyHeaderLine(metadata, line);
    }
    return metadata;
}

function extractVersionLabel(content: string): string {
    const metadata = readHeaderMetadata(content);
    if (metadata.date) {
        const timeSuffix = metadata.time ? ` ${metadata.time}` : '';
        return `Date: ${metadata.date}${timeSuffix}`;
    }
    if (metadata.version) {
        return `Version: ${metadata.version}`;
    }
    return 'Unknown Version';
}

export const gedcomCommandHandlers: CommandHandlerMap = {
    upload_family_tree: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { filename, content, treeGroupId } = payload as { filename: string; content: string; treeGroupId?: string };
            const fileHash = computeHash(content);
            const db = dbManager.getDb();

            // Check for duplicate hash
            const duplicate = db.prepare('SELECT id, filename FROM family_trees WHERE file_hash = ?').get(fileHash) as { id: string; filename: string } | undefined;
            if (duplicate) {
                respond(id, 'error', null, `A family tree with the exact same content has already been uploaded as "${duplicate.filename}".`, originWs);
                return;
            }

            const treeId = uuidv4();
            const groupId = treeGroupId || uuidv4();
            const versionLabel = extractVersionLabel(content);

            db.prepare(`
                INSERT INTO family_trees (id, filename, file_hash, gedcom_content, tree_group_id, version_label)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(treeId, filename, fileHash, content, groupId, versionLabel);

            respond(id, 'ok', { treeId, filename, treeGroupId: groupId, versionLabel }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    // New handler to persist home person selection
    set_home_person: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { treeId, homePersonId } = payload as { treeId: string; homePersonId: string };
            dbManager.getDb().prepare('UPDATE family_trees SET home_person_id = ? WHERE id = ?').run(homePersonId, treeId);
            respond(id, 'ok', null, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_family_trees: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const trees = dbManager.getDb().prepare(`
                SELECT id, filename, file_hash, tree_group_id, version_label, created_at
                FROM family_trees
                ORDER BY created_at DESC
            `).all();
            respond(id, 'ok', { trees }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_family_tree_content: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { treeId } = payload as { treeId: string };
            const tree = dbManager.getDb().prepare(`
                SELECT filename, gedcom_content FROM family_trees WHERE id = ?
            `).get(treeId) as { filename: string; gedcom_content: string } | undefined;

            if (!tree) {
                throw new Error('Family tree not found');
            }

            respond(id, 'ok', { content: tree.gedcom_content, filename: tree.filename }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    delete_family_tree: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { treeId } = payload as { treeId: string };
            const db = dbManager.getDb();
            db.transaction(() => {
                db.prepare('DELETE FROM family_trees WHERE id = ?').run(treeId);
                // The people_gedcom_links rows will be deleted via ON DELETE CASCADE (foreign key is configured in schema)
                // However, let's explicitly clean them up just in case SQLite foreign_keys pragma is not enabled:
                db.prepare('DELETE FROM people_gedcom_links WHERE gedcom_tree_id = ?').run(treeId);
            })();
            respond(id, 'ok', { message: 'Family tree deleted successfully' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    link_person_to_gedcom: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId, gedcomTreeId, gedcomPersonId } = payload as { personId: string; gedcomTreeId: string; gedcomPersonId: string };
            dbManager.getDb().prepare(`
                INSERT OR REPLACE INTO people_gedcom_links (person_id, gedcom_tree_id, gedcom_person_id)
                VALUES (?, ?, ?)
            `).run(personId, gedcomTreeId, gedcomPersonId);
            respond(id, 'ok', { message: 'Linked successfully' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    unlink_person_from_gedcom: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { personId, gedcomTreeId, gedcomPersonId } = payload as { personId: string; gedcomTreeId: string; gedcomPersonId: string };
            dbManager.getDb().prepare(`
                DELETE FROM people_gedcom_links
                WHERE person_id = ? AND gedcom_tree_id = ? AND gedcom_person_id = ?
            `).run(personId, gedcomTreeId, gedcomPersonId);
            respond(id, 'ok', { message: 'Unlinked successfully' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_people_gedcom_links: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const links = dbManager.getDb().prepare(`
                SELECT person_id, gedcom_tree_id, gedcom_person_id FROM people_gedcom_links
            `).all();
            respond(id, 'ok', { links }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    }
};
