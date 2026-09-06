import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type CaptureSequenceStatus = 'proposed' | 'accepted' | 'rejected';
export type CaptureSequenceSourceKind = 'system' | 'human' | 'import';
export type CaptureSequenceMemberStatus = 'candidate' | 'accepted' | 'rejected';

export type CaptureSequenceProposalMemberInput = {
    assetId: string;
    capturedAt?: string | null;
    evidence?: Record<string, unknown> | null;
};

export type CaptureSequenceProposalInput = {
    members: CaptureSequenceProposalMemberInput[];
    evidence?: Record<string, unknown> | null;
};

export type ReplaceSystemCaptureSequenceProposalsInput = {
    impactedAssetIds: string[];
    sourceIdentity: string;
    sourceRef?: string | null;
    algorithmVersion?: string | null;
    params?: Record<string, unknown>;
    sequences: CaptureSequenceProposalInput[];
};

export type CaptureSequenceMember = {
    assetIdentityGuid: string;
    currentAssetId: string | null;
    originalPath: string;
    ordinal: number;
    status: CaptureSequenceMemberStatus;
    capturedAt: string | null;
    evidenceJson: string | null;
};

export type CaptureSequence = {
    id: string;
    status: CaptureSequenceStatus;
    sourceKind: CaptureSequenceSourceKind;
    sourceIdentity: string;
    sourceRef: string | null;
    algorithmVersion: string | null;
    paramsJson: string;
    evidenceJson: string | null;
    createdAt: string;
    updatedAt: string;
    members: CaptureSequenceMember[];
};

type AssetIdentity = {
    guid: string;
    originalPath: string;
};

type CaptureSequenceRow = {
    id: string;
    status: CaptureSequenceStatus;
    source_kind: CaptureSequenceSourceKind;
    source_identity: string;
    source_ref: string | null;
    algorithm_version: string | null;
    params_json: string;
    evidence_json: string | null;
    created_at: string;
    updated_at: string;
};

type CaptureSequenceMemberRow = {
    asset_identity_guid: string;
    current_asset_id: string | null;
    original_path: string;
    ordinal: number;
    status: CaptureSequenceMemberStatus;
    captured_at: string | null;
    evidence_json: string | null;
};

function loadAssetPath(db: DbHandle, assetId: string): string {
    const row = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as
        | { original_path: string }
        | undefined;
    if (!row) {
        throw new Error(`Unknown capture-sequence asset '${assetId}'.`);
    }
    return row.original_path;
}

function ensureAssetIdentity(db: DbHandle, assetId: string): AssetIdentity {
    const originalPath = loadAssetPath(db, assetId);
    const existing = db.prepare(`
        SELECT guid, original_path
        FROM asset_identities
        WHERE original_path = ?
    `).get(originalPath) as { guid: string; original_path: string } | undefined;
    if (existing) {
        return { guid: existing.guid, originalPath: existing.original_path };
    }

    const guid = uuidv4();
    db.prepare(`
        INSERT INTO asset_identities (guid, original_path)
        VALUES (?, ?)
    `).run(guid, originalPath);
    return { guid, originalPath };
}

function deleteOverlappingSystemProposals(
    db: DbHandle,
    assetIdentityGuids: readonly string[],
    sourceIdentity: string,
): void {
    if (assetIdentityGuids.length === 0) {
        return;
    }
    const placeholders = assetIdentityGuids.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT DISTINCT sequence.id
        FROM capture_sequences sequence
        JOIN capture_sequence_members member ON member.sequence_id = sequence.id
        WHERE sequence.status = 'proposed'
          AND sequence.source_kind = 'system'
          AND sequence.source_identity = ?
          AND member.asset_identity_guid IN (${placeholders})
    `).all(sourceIdentity, ...assetIdentityGuids) as Array<{ id: string }>;

    const remove = db.prepare('DELETE FROM capture_sequences WHERE id = ?');
    for (const row of rows) {
        remove.run(row.id);
    }
}

function compareProposalMembers(
    left: CaptureSequenceProposalMemberInput,
    right: CaptureSequenceProposalMemberInput,
): number {
    const leftTime = left.capturedAt ? Date.parse(left.capturedAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.capturedAt ? Date.parse(right.capturedAt) : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    return left.assetId.localeCompare(right.assetId);
}

function insertProposal(
    db: DbHandle,
    input: ReplaceSystemCaptureSequenceProposalsInput,
    proposal: CaptureSequenceProposalInput,
): string | null {
    const uniqueMembers = new Map<string, CaptureSequenceProposalMemberInput>();
    for (const member of proposal.members) {
        if (!uniqueMembers.has(member.assetId)) {
            uniqueMembers.set(member.assetId, member);
        }
    }
    if (uniqueMembers.size < 2) {
        return null;
    }

    const orderedMembers = [...uniqueMembers.values()].sort(compareProposalMembers);
    const sequenceId = uuidv4();
    db.prepare(`
        INSERT INTO capture_sequences (
            id,
            status,
            source_kind,
            source_identity,
            source_ref,
            algorithm_version,
            params_json,
            evidence_json
        )
        VALUES (?, 'proposed', 'system', ?, ?, ?, ?, ?)
    `).run(
        sequenceId,
        input.sourceIdentity,
        input.sourceRef ?? null,
        input.algorithmVersion ?? null,
        JSON.stringify(input.params ?? {}),
        proposal.evidence ? JSON.stringify(proposal.evidence) : null,
    );

    const insertMember = db.prepare(`
        INSERT INTO capture_sequence_members (
            sequence_id,
            asset_identity_guid,
            ordinal,
            status,
            captured_at,
            evidence_json
        )
        VALUES (?, ?, ?, 'candidate', ?, ?)
    `);
    for (const [ordinal, member] of orderedMembers.entries()) {
        const identity = ensureAssetIdentity(db, member.assetId);
        insertMember.run(
            sequenceId,
            identity.guid,
            ordinal,
            member.capturedAt ?? null,
            member.evidence ? JSON.stringify(member.evidence) : null,
        );
    }
    return sequenceId;
}

/**
 * Replaces only system-generated, still-proposed sequences produced by the
 * same detector identity. Accepted/rejected or human/imported sequences are
 * never removed by a detector rerun.
 */
export function replaceSystemCaptureSequenceProposals(
    db: DbHandle,
    input: ReplaceSystemCaptureSequenceProposalsInput,
): string[] {
    if (!input.sourceIdentity.trim()) {
        throw new Error('Capture-sequence sourceIdentity is required.');
    }

    const impactedIdentityGuids = [...new Set(input.impactedAssetIds)]
        .map((assetId) => ensureAssetIdentity(db, assetId).guid);
    deleteOverlappingSystemProposals(db, impactedIdentityGuids, input.sourceIdentity);

    const insertedIds: string[] = [];
    for (const proposal of input.sequences) {
        const sequenceId = insertProposal(db, input, proposal);
        if (sequenceId) {
            insertedIds.push(sequenceId);
        }
    }
    return insertedIds;
}

function loadMembers(db: DbHandle, sequenceId: string): CaptureSequenceMember[] {
    const rows = db.prepare(`
        SELECT
            member.asset_identity_guid,
            (
                SELECT current_asset.id
                FROM assets current_asset
                WHERE current_asset.original_path = identity.original_path
                ORDER BY current_asset.created_at DESC, current_asset.id DESC
                LIMIT 1
            ) AS current_asset_id,
            identity.original_path,
            member.ordinal,
            member.status,
            member.captured_at,
            member.evidence_json
        FROM capture_sequence_members member
        JOIN asset_identities identity ON identity.guid = member.asset_identity_guid
        WHERE member.sequence_id = ?
        ORDER BY member.ordinal ASC, identity.original_path ASC
    `).all(sequenceId) as CaptureSequenceMemberRow[];
    return rows.map((row) => ({
        assetIdentityGuid: row.asset_identity_guid,
        currentAssetId: row.current_asset_id,
        originalPath: row.original_path,
        ordinal: row.ordinal,
        status: row.status,
        capturedAt: row.captured_at,
        evidenceJson: row.evidence_json,
    }));
}

function toCaptureSequence(db: DbHandle, row: CaptureSequenceRow): CaptureSequence {
    return {
        id: row.id,
        status: row.status,
        sourceKind: row.source_kind,
        sourceIdentity: row.source_identity,
        sourceRef: row.source_ref,
        algorithmVersion: row.algorithm_version,
        paramsJson: row.params_json,
        evidenceJson: row.evidence_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        members: loadMembers(db, row.id),
    };
}

export function getCaptureSequencesForAsset(db: DbHandle, assetId: string): CaptureSequence[] {
    const originalPath = loadAssetPath(db, assetId);
    const rows = db.prepare(`
        SELECT DISTINCT
            sequence.id,
            sequence.status,
            sequence.source_kind,
            sequence.source_identity,
            sequence.source_ref,
            sequence.algorithm_version,
            sequence.params_json,
            sequence.evidence_json,
            sequence.created_at,
            sequence.updated_at
        FROM capture_sequences sequence
        JOIN capture_sequence_members member ON member.sequence_id = sequence.id
        JOIN asset_identities identity ON identity.guid = member.asset_identity_guid
        WHERE identity.original_path = ?
        ORDER BY sequence.created_at DESC, sequence.id DESC
    `).all(originalPath) as CaptureSequenceRow[];
    return rows.map((row) => toCaptureSequence(db, row));
}
