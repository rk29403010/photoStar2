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
    {
        id: '20260912_005_review_response_normalization',
        sql: `
            ALTER TABLE semantic_attestations
                ADD COLUMN subjective_certainty TEXT
                    CHECK (subjective_certainty IN ('definite', 'tentative', 'possible'));
            ALTER TABLE semantic_attestations
                ADD COLUMN raw_wording TEXT;

            CREATE TABLE review_responses (
                id TEXT PRIMARY KEY,
                contributor_id TEXT NOT NULL,
                subject_entity_id TEXT NOT NULL,
                response_kind TEXT NOT NULL CHECK (response_kind IN (
                    'definite_identification',
                    'tentative_identification',
                    'possible_identification',
                    'reject_candidate',
                    'unsure_between_candidates',
                    'unknown_no_clue',
                    'recognise_cannot_name',
                    'abstain'
                )),
                raw_wording TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(contributor_id) REFERENCES contributors(id),
                FOREIGN KEY(subject_entity_id) REFERENCES semantic_entities(id)
            );
            CREATE INDEX idx_review_responses_subject
                ON review_responses(subject_entity_id, created_at, id);
            CREATE INDEX idx_review_responses_contributor
                ON review_responses(contributor_id, created_at, id);

            CREATE TABLE review_response_propositions (
                response_id TEXT NOT NULL,
                proposition_id TEXT NOT NULL,
                relation TEXT NOT NULL CHECK (relation IN ('subject', 'candidate', 'abstained_from')),
                PRIMARY KEY(response_id, proposition_id),
                FOREIGN KEY(response_id) REFERENCES review_responses(id) ON DELETE CASCADE,
                FOREIGN KEY(proposition_id) REFERENCES semantic_propositions(id)
            );
            CREATE INDEX idx_review_response_propositions_proposition
                ON review_response_propositions(proposition_id, response_id);
        `,
    },
];
