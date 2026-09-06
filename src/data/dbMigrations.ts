import type { NumberedMigration } from './migrationLedger';

/**
 * New migrations go here. Unlike the legacy best-effort migration list, these
 * migrations are checksummed, transactional and fail fast.
 *
 * Keep the list append-only. Never edit a migration after it has shipped.
 */
export const NUMBERED_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260906_001_semantic_kernel',
        sql: `
            CREATE TABLE semantic_entities (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                native_id TEXT NOT NULL,
                label TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(kind, native_id)
            );

            CREATE TABLE semantic_propositions (
                id TEXT PRIMARY KEY,
                canonical_key TEXT NOT NULL UNIQUE,
                scope_key TEXT NOT NULL,
                subject_entity_id TEXT NOT NULL,
                predicate TEXT NOT NULL,
                object_type TEXT NOT NULL CHECK (object_type IN ('entity', 'value')),
                object_entity_id TEXT,
                value_type TEXT,
                value_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(subject_entity_id) REFERENCES semantic_entities(id),
                FOREIGN KEY(object_entity_id) REFERENCES semantic_entities(id),
                CHECK (
                    (object_type = 'entity' AND object_entity_id IS NOT NULL AND value_type IS NULL AND value_json IS NULL)
                    OR
                    (object_type = 'value' AND object_entity_id IS NULL AND value_type IS NOT NULL AND value_json IS NOT NULL)
                )
            );
            CREATE INDEX idx_semantic_propositions_scope
                ON semantic_propositions(scope_key, created_at, id);

            CREATE TABLE semantic_attestations (
                id TEXT PRIMARY KEY,
                proposition_id TEXT NOT NULL,
                stance TEXT NOT NULL CHECK (stance IN ('support', 'oppose')),
                source_kind TEXT NOT NULL,
                source_ref TEXT,
                confidence REAL,
                rationale TEXT,
                supersedes_attestation_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(proposition_id) REFERENCES semantic_propositions(id),
                FOREIGN KEY(supersedes_attestation_id) REFERENCES semantic_attestations(id),
                CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0))
            );
            CREATE INDEX idx_semantic_attestations_proposition
                ON semantic_attestations(proposition_id, created_at, id);
            CREATE UNIQUE INDEX idx_semantic_attestation_single_successor
                ON semantic_attestations(supersedes_attestation_id)
                WHERE supersedes_attestation_id IS NOT NULL;

            CREATE TABLE semantic_evidence (
                id TEXT PRIMARY KEY,
                attestation_id TEXT NOT NULL,
                ref_kind TEXT NOT NULL,
                ref_json TEXT NOT NULL,
                label TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(attestation_id) REFERENCES semantic_attestations(id)
            );
            CREATE INDEX idx_semantic_evidence_attestation
                ON semantic_evidence(attestation_id, created_at, id);

            CREATE TABLE semantic_decisions (
                id TEXT PRIMARY KEY,
                scope_key TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'disputed', 'unresolved')),
                proposition_id TEXT,
                source_kind TEXT NOT NULL,
                source_ref TEXT,
                rationale TEXT,
                supersedes_decision_id TEXT,
                is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(proposition_id) REFERENCES semantic_propositions(id),
                FOREIGN KEY(supersedes_decision_id) REFERENCES semantic_decisions(id),
                CHECK (
                    (status IN ('accepted', 'rejected') AND proposition_id IS NOT NULL)
                    OR
                    (status IN ('disputed', 'unresolved') AND proposition_id IS NULL)
                )
            );
            CREATE UNIQUE INDEX idx_semantic_decisions_current_scope
                ON semantic_decisions(scope_key)
                WHERE is_current = 1;
            CREATE INDEX idx_semantic_decisions_scope_history
                ON semantic_decisions(scope_key, created_at, id);
        `,
    },
    {
        id: '20260906_002_archive_representations',
        sql: `
            CREATE TABLE archive_representations (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                subject_entity_id TEXT NOT NULL,
                representation_kind TEXT NOT NULL CHECK (
                    representation_kind IN ('original', 'scan', 'crop', 'derived_edit', 'extracted_frame', 'reference')
                ),
                facet TEXT,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('system', 'human', 'import')),
                source_ref TEXT,
                derived_from_representation_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
                FOREIGN KEY(subject_entity_id) REFERENCES semantic_entities(id),
                FOREIGN KEY(derived_from_representation_id) REFERENCES archive_representations(id) ON DELETE SET NULL
            );
            CREATE UNIQUE INDEX idx_archive_representations_identity
                ON archive_representations(
                    asset_id,
                    subject_entity_id,
                    representation_kind,
                    IFNULL(facet, '')
                );
            CREATE INDEX idx_archive_representations_asset
                ON archive_representations(asset_id, created_at, id);
            CREATE INDEX idx_archive_representations_subject
                ON archive_representations(subject_entity_id, created_at, id);
            CREATE INDEX idx_archive_representations_derived_from
                ON archive_representations(derived_from_representation_id)
                WHERE derived_from_representation_id IS NOT NULL;
        `,
    },
];
