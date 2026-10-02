import type Database from 'better-sqlite3';

type ContributorRow = {
    id: string; display_name: string; status: string; created_at: string; updated_at: string;
};
type ResponseRow = {
    id: string; contributor_id: string; subject_entity_id: string;
    response_kind: string; raw_wording: string | null; created_at: string;
};
type ResponsePropositionRow = { response_id: string; proposition_id: string; relation: string };

export function snapshotTestimony(db: Database.Database) {
    return {
        contributors: db.prepare('SELECT * FROM contributors ORDER BY rowid').all() as ContributorRow[],
        responses: db.prepare('SELECT * FROM review_responses ORDER BY rowid').all() as ResponseRow[],
        responsePropositions: db.prepare('SELECT * FROM review_response_propositions ORDER BY rowid')
            .all() as ResponsePropositionRow[],
    };
}

/** Restore after semantic entities and propositions, inside the caller's transaction. */
export function restoreTestimony(db: Database.Database, state: ReturnType<typeof snapshotTestimony>): void {
    const contributor = db.prepare(`INSERT INTO contributors
        (id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
    for (const row of state.contributors) {
        contributor.run(row.id, row.display_name, row.status, row.created_at, row.updated_at);
    }
    const response = db.prepare(`INSERT INTO review_responses
        (id, contributor_id, subject_entity_id, response_kind, raw_wording, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of state.responses) {
        response.run(row.id, row.contributor_id, row.subject_entity_id,
            row.response_kind, row.raw_wording, row.created_at);
    }
    const link = db.prepare(`INSERT INTO review_response_propositions
        (response_id, proposition_id, relation) VALUES (?, ?, ?)`);
    for (const row of state.responsePropositions) {
        link.run(row.response_id, row.proposition_id, row.relation);
    }
}
