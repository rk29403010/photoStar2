import type { NumberedMigration } from './migrationLedger';

export const WP13_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260912_004_contributor_attribution',
        sql: `
            CREATE TABLE contributors (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(id) REFERENCES semantic_entities(id)
            );

            ALTER TABLE semantic_attestations
                ADD COLUMN source_actor_entity_id TEXT REFERENCES semantic_entities(id);
            CREATE INDEX idx_semantic_attestations_source_actor
                ON semantic_attestations(source_actor_entity_id, created_at, id);

            ALTER TABLE semantic_decisions
                ADD COLUMN decider_entity_id TEXT REFERENCES semantic_entities(id);
            CREATE INDEX idx_semantic_decisions_decider
                ON semantic_decisions(decider_entity_id, created_at, id);
        `,
    },
];
