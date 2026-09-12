import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type PersonLifecycleStatus = 'provisional' | 'confirmed' | 'merged' | 'retired';

export type PersonLifecycleRow = {
    id: string;
    lifecycleStatus: PersonLifecycleStatus;
};

type DurablePersonMetadata = {
    birth_date: string | null;
    death_date: string | null;
    thumbnail_path: string | null;
};

function loadPerson(db: DbHandle, personId: string): PersonLifecycleRow {
    const row = db.prepare(`
        SELECT id, lifecycle_status
        FROM people
        WHERE id = ?
    `).get(personId) as { id: string; lifecycle_status: PersonLifecycleStatus } | undefined;
    if (!row) {
        throw new Error(`Person '${personId}' does not exist.`);
    }
    return { id: row.id, lifecycleStatus: row.lifecycle_status };
}

function setLifecycleStatus(db: DbHandle, personId: string, status: PersonLifecycleStatus): void {
    loadPerson(db, personId);
    db.prepare('UPDATE people SET lifecycle_status = ? WHERE id = ?').run(status, personId);
}

function copyMissingDurableMetadata(db: DbHandle, oldPersonId: string, currentPersonId: string): void {
    const source = db.prepare(`
        SELECT birth_date, death_date, thumbnail_path
        FROM people
        WHERE id = ?
    `).get(oldPersonId) as DurablePersonMetadata | undefined;
    if (!source) {
        throw new Error(`Person '${oldPersonId}' does not exist.`);
    }

    db.prepare(`
        UPDATE people
        SET birth_date = COALESCE(birth_date, ?),
            death_date = COALESCE(death_date, ?),
            thumbnail_path = COALESCE(thumbnail_path, ?)
        WHERE id = ?
    `).run(source.birth_date, source.death_date, source.thumbnail_path, currentPersonId);

    db.prepare(`
        INSERT OR IGNORE INTO people_gedcom_links (
            person_id, gedcom_tree_id, gedcom_person_id, created_at
        )
        SELECT ?, gedcom_tree_id, gedcom_person_id, created_at
        FROM people_gedcom_links
        WHERE person_id = ?
    `).run(currentPersonId, oldPersonId);
}

export function markPersonConfirmed(db: DbHandle, personId: string): void {
    const person = loadPerson(db, personId);
    if (person.lifecycleStatus === 'merged' || person.lifecycleStatus === 'retired') {
        throw new Error(`Person '${personId}' cannot be confirmed from lifecycle state '${person.lifecycleStatus}'.`);
    }
    setLifecycleStatus(db, personId, 'confirmed');
}

export function retirePerson(db: DbHandle, personId: string): void {
    const person = loadPerson(db, personId);
    if (person.lifecycleStatus === 'merged') {
        throw new Error(`Merged Person '${personId}' cannot be retired independently.`);
    }
    setLifecycleStatus(db, personId, 'retired');
}

export function resolveCurrentPersonId(db: DbHandle, personId: string): string {
    loadPerson(db, personId);
    const seen = new Set<string>();
    let currentId = personId;

    while (true) {
        if (seen.has(currentId)) {
            throw new Error(`Person redirect cycle detected at '${currentId}'.`);
        }
        seen.add(currentId);
        const redirect = db.prepare(`
            SELECT current_person_id
            FROM person_redirects
            WHERE old_person_id = ?
        `).get(currentId) as { current_person_id: string } | undefined;
        if (!redirect) {
            return currentId;
        }
        currentId = redirect.current_person_id;
    }
}

export function redirectMergedPerson(
    db: DbHandle,
    oldPersonId: string,
    currentPersonId: string,
    reasonDecisionId: string | null,
): string {
    const oldPerson = loadPerson(db, oldPersonId);
    if (oldPerson.lifecycleStatus === 'merged') {
        throw new Error(`Person '${oldPersonId}' is already merged.`);
    }
    if (oldPerson.lifecycleStatus === 'retired') {
        throw new Error(`Retired Person '${oldPersonId}' cannot be merged.`);
    }

    const resolvedCurrentId = resolveCurrentPersonId(db, currentPersonId);
    if (resolvedCurrentId === oldPersonId) {
        throw new Error(`Redirecting Person '${oldPersonId}' to '${currentPersonId}' would create a cycle.`);
    }
    const target = loadPerson(db, resolvedCurrentId);
    if (target.lifecycleStatus === 'retired') {
        throw new Error(`Cannot redirect to retired Person '${resolvedCurrentId}'.`);
    }

    copyMissingDurableMetadata(db, oldPersonId, resolvedCurrentId);
    db.prepare(`
        INSERT INTO person_redirects (
            old_person_id, current_person_id, reason_decision_id
        ) VALUES (?, ?, ?)
    `).run(oldPersonId, resolvedCurrentId, reasonDecisionId);
    setLifecycleStatus(db, oldPersonId, 'merged');
    markPersonConfirmed(db, resolvedCurrentId);
    return resolvedCurrentId;
}
