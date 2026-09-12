import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import {
    addSemanticAttestation,
    ensureSemanticEntity,
    recordSemanticDecision,
    type AddSemanticAttestationInput,
    type RecordSemanticDecisionInput,
} from './semanticRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export const CURRENT_CONTRIBUTOR_SETTING = 'semantic.current_contributor_id';

export type Contributor = {
    id: string;
    displayName: string;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
};

type ContributorRow = {
    id: string;
    display_name: string;
    status: Contributor['status'];
    created_at: string;
    updated_at: string;
};

function toContributor(row: ContributorRow): Contributor {
    return {
        id: row.id,
        displayName: row.display_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function normalizeDisplayName(displayName: string): string {
    const normalized = displayName.trim();
    if (!normalized) {
        throw new Error('Contributor display name must not be empty.');
    }
    return normalized;
}

export function getContributor(db: DbHandle, contributorId: string): Contributor | null {
    const row = db.prepare(`
        SELECT id, display_name, status, created_at, updated_at
        FROM contributors
        WHERE id = ?
    `).get(contributorId) as ContributorRow | undefined;
    return row ? toContributor(row) : null;
}

export function listContributors(db: DbHandle): Contributor[] {
    return (db.prepare(`
        SELECT id, display_name, status, created_at, updated_at
        FROM contributors
        ORDER BY status ASC, display_name COLLATE NOCASE ASC, created_at ASC, id ASC
    `).all() as ContributorRow[]).map(toContributor);
}

export function createContributor(db: DbHandle, displayName: string): Contributor {
    const name = normalizeDisplayName(displayName);
    const nativeId = uuidv4();
    const contributorId = ensureSemanticEntity(db, {
        kind: 'contributor',
        nativeId,
        label: name,
    });
    db.prepare(`
        INSERT INTO contributors (id, display_name)
        VALUES (?, ?)
    `).run(contributorId, name);
    return getContributor(db, contributorId)!;
}

export function selectContributor(db: DbHandle, contributorId: string): Contributor {
    const contributor = getContributor(db, contributorId);
    if (!contributor || contributor.status !== 'active') {
        throw new Error(`Active Contributor '${contributorId}' does not exist.`);
    }
    db.prepare(`
        INSERT INTO settings (id, value)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value
    `).run(CURRENT_CONTRIBUTOR_SETTING, contributorId);
    return contributor;
}

export function getCurrentContributor(db: DbHandle): Contributor | null {
    const setting = db.prepare('SELECT value FROM settings WHERE id = ?')
        .get(CURRENT_CONTRIBUTOR_SETTING) as { value: string | null } | undefined;
    if (!setting?.value) {
        return null;
    }
    const contributor = getContributor(db, setting.value);
    return contributor?.status === 'active' ? contributor : null;
}

export function ensureCurrentContributor(db: DbHandle): Contributor {
    const current = getCurrentContributor(db);
    if (current) {
        return current;
    }
    const firstActive = listContributors(db).find((contributor) => contributor.status === 'active');
    if (firstActive) {
        return selectContributor(db, firstActive.id);
    }
    const localContributor = createContributor(db, 'Local user');
    return selectContributor(db, localContributor.id);
}

export function addContributorAttestation(
    db: DbHandle,
    contributorId: string,
    input: Omit<AddSemanticAttestationInput, 'sourceKind' | 'sourceIdentity'>,
): string {
    const contributor = getContributor(db, contributorId);
    if (!contributor) {
        throw new Error(`Contributor '${contributorId}' does not exist.`);
    }
    const attestationId = addSemanticAttestation(db, {
        ...input,
        sourceKind: 'human',
        sourceIdentity: contributor.id,
    });
    db.prepare(`
        UPDATE semantic_attestations
        SET source_actor_entity_id = ?
        WHERE id = ?
    `).run(contributor.id, attestationId);
    return attestationId;
}

export function recordContributorDecision(
    db: DbHandle,
    contributorId: string,
    input: Omit<RecordSemanticDecisionInput, 'sourceKind'>,
): string {
    const contributor = getContributor(db, contributorId);
    if (!contributor) {
        throw new Error(`Contributor '${contributorId}' does not exist.`);
    }
    const decisionId = recordSemanticDecision(db, {
        ...input,
        sourceKind: 'human',
    });
    db.prepare(`
        UPDATE semantic_decisions
        SET decider_entity_id = ?
        WHERE id = ?
    `).run(contributor.id, decisionId);
    return decisionId;
}
