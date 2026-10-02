import type Database from 'better-sqlite3';

type AssetRow = {
    id: string;
    original_path: string;
    asset_identity_guid: string | null;
    file_hash: string | null;
    file_size: number | null;
    width: number | null;
    height: number | null;
    photo_created_at: string | null;
    photo_created_at_confidence: number | null;
    exif_datetime: string | null;
    metadata_timestamp_source: string | null;
    sensitivity_score: number | null;
    binned_at: string | null;
    created_at: string;
};

type PersonRow = {
    id: string;
    name: string | null;
    thumbnail_path: string | null;
    birth_date: string | null;
    death_date: string | null;
    created_at: string;
    lifecycle_status: string;
};

type PersonRedirectRow = {
    old_person_id: string;
    current_person_id: string;
    reason_decision_id: string | null;
    created_at: string;
};

type FamilyTreeRow = {
    id: string;
    filename: string;
    file_hash: string;
    gedcom_content: string;
    tree_group_id: string;
    version_label: string | null;
    home_person_id: string | null;
    created_at: string;
};

type PeopleGedcomLinkRow = {
    person_id: string;
    gedcom_tree_id: string;
    gedcom_person_id: string;
    created_at: string;
};

type PhotoEditDocumentRow = {
    id: string;
    source_asset_id: string;
    rendered_asset_id: string | null;
    parent_edit_id: string | null;
    name: string;
    operations_json: string;
    masks_json: string;
    status: string;
    created_at: string;
    updated_at: string;
};

type PhotoEditStyleRow = {
    id: string;
    name: string;
    operations_json: string;
    masks_json: string;
    created_at: string;
    updated_at: string;
};

type PhotoMetadataAssertionRow = {
    id: string;
    asset_id: string;
    field_path: string;
    value_json: string;
    user_id: string;
    note: string | null;
    created_at: string;
};

type TagDefinitionRow = {
    id: string;
    canonical_label: string;
    description: string | null;
    status: string;
    category: string | null;
    created_at: string;
    updated_at: string;
};

type TagAliasRow = {
    id: string;
    tag_definition_id: string;
    alias_label: string;
    created_at: string;
};

type AssetTagAssignmentRow = {
    asset_id: string;
    tag_definition_id: string;
    source_kind: string;
    source_record_id: string | null;
    confidence: number | null;
    created_at: string;
    updated_at: string;
};

type AlbumRow = {
    id: string;
    title: string;
    description: string | null;
    cover_asset_id: string | null;
    rules_json: string | null;
    is_system: number;
    system_kind: string | null;
    created_at: string;
};

type AlbumItemRow = {
    album_id: string;
    asset_id: string;
    added_at: string;
};

type ReviewItemRow = {
    id: string;
    review_item_type: string;
    subject_type: string;
    subject_id: string;
    payload_json: string;
    status: string;
    reviewer_id: string | null;
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
};

export type DurableLibraryResetState = {
    assetAnchors: AssetRow[];
    people: PersonRow[];
    personRedirects: PersonRedirectRow[];
    familyTrees: FamilyTreeRow[];
    peopleGedcomLinks: PeopleGedcomLinkRow[];
    photoEditDocuments: PhotoEditDocumentRow[];
    photoEditStyles: PhotoEditStyleRow[];
    photoMetadataAssertions: PhotoMetadataAssertionRow[];
    tagDefinitions: TagDefinitionRow[];
    tagAliases: TagAliasRow[];
    manualTagAssignments: AssetTagAssignmentRow[];
    userAlbums: AlbumRow[];
    userAlbumItems: AlbumItemRow[];
    reviewedItems: ReviewItemRow[];
};

function rows<Row>(db: Database.Database, sql: string): Row[] {
    return db.prepare(sql).all() as Row[];
}

function snapshotDurablePeople(db: Database.Database): PersonRow[] {
    return rows<PersonRow>(db, `
        SELECT person.*
        FROM people person
        WHERE person.lifecycle_status != 'provisional'
           OR EXISTS (
                SELECT 1 FROM person_redirects redirect
                WHERE redirect.old_person_id = person.id OR redirect.current_person_id = person.id
           )
           OR EXISTS (SELECT 1 FROM people_gedcom_links link WHERE link.person_id = person.id)
           OR EXISTS (
                SELECT 1 FROM face_assignments assignment
                WHERE assignment.person_id = person.id AND COALESCE(assignment.is_suggested, 0) = 0
           )
           OR EXISTS (
                SELECT 1
                FROM semantic_entities entity
                JOIN semantic_propositions proposition ON proposition.object_entity_id = entity.id
                WHERE entity.kind = 'person'
                  AND entity.native_id = person.id
                  AND (
                      EXISTS (
                          SELECT 1 FROM semantic_attestations attestation
                          WHERE attestation.proposition_id = proposition.id
                            AND attestation.source_kind IN ('human', 'import')
                      )
                      OR EXISTS (
                          SELECT 1 FROM semantic_decisions decision
                          WHERE decision.proposition_id = proposition.id
                            AND decision.source_kind != 'machine'
                      )
                      OR EXISTS (
                          SELECT 1 FROM review_response_propositions response
                          WHERE response.proposition_id = proposition.id
                      )
                  )
           )
        ORDER BY person.created_at, person.id
    `);
}

function collectAssetAnchorIds(state: Omit<DurableLibraryResetState, 'assetAnchors'>): string[] {
    const ids = new Set<string>();
    for (const row of state.photoEditDocuments) {
        ids.add(row.source_asset_id);
        if (row.rendered_asset_id) { ids.add(row.rendered_asset_id); }
    }
    for (const row of state.photoMetadataAssertions) { ids.add(row.asset_id); }
    for (const row of state.manualTagAssignments) { ids.add(row.asset_id); }
    for (const row of state.userAlbums) {
        if (row.cover_asset_id) { ids.add(row.cover_asset_id); }
    }
    for (const row of state.userAlbumItems) { ids.add(row.asset_id); }
    for (const row of state.reviewedItems) {
        if (row.subject_type === 'asset') { ids.add(row.subject_id); }
    }
    return [...ids].sort();
}

function snapshotAssetAnchors(db: Database.Database, ids: readonly string[]): AssetRow[] {
    if (ids.length === 0) { return []; }
    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`SELECT * FROM assets WHERE id IN (${placeholders}) ORDER BY created_at, id`)
        .all(...ids) as AssetRow[];
}

export function snapshotDurableLibraryResetState(db: Database.Database): DurableLibraryResetState {
    const stateWithoutAnchors = {
        people: snapshotDurablePeople(db),
        personRedirects: rows<PersonRedirectRow>(db, 'SELECT * FROM person_redirects ORDER BY created_at, old_person_id'),
        familyTrees: rows<FamilyTreeRow>(db, 'SELECT * FROM family_trees ORDER BY created_at, id'),
        peopleGedcomLinks: rows<PeopleGedcomLinkRow>(db, 'SELECT * FROM people_gedcom_links ORDER BY created_at, person_id, gedcom_tree_id, gedcom_person_id'),
        photoEditDocuments: rows<PhotoEditDocumentRow>(db, 'SELECT * FROM photo_edit_documents ORDER BY created_at, id'),
        photoEditStyles: rows<PhotoEditStyleRow>(db, 'SELECT * FROM photo_edit_styles ORDER BY created_at, id'),
        photoMetadataAssertions: rows<PhotoMetadataAssertionRow>(db, 'SELECT * FROM photo_metadata_assertions ORDER BY created_at, id'),
        // Definitions and aliases have no provenance today. Preserve them all so a user rename,
        // merge, retirement, or alias cannot be mistaken for a rebuildable seed row.
        tagDefinitions: rows<TagDefinitionRow>(db, 'SELECT * FROM tag_definitions ORDER BY created_at, id'),
        tagAliases: rows<TagAliasRow>(db, 'SELECT * FROM tag_aliases ORDER BY created_at, id'),
        manualTagAssignments: rows<AssetTagAssignmentRow>(db, "SELECT * FROM asset_tag_assignments WHERE source_kind = 'manual' ORDER BY created_at, asset_id, tag_definition_id"),
        userAlbums: rows<AlbumRow>(db, 'SELECT * FROM albums WHERE is_system = 0 ORDER BY created_at, id'),
        userAlbumItems: rows<AlbumItemRow>(db, `
            SELECT item.* FROM album_items item
            JOIN albums album ON album.id = item.album_id
            WHERE album.is_system = 0
            ORDER BY item.added_at, item.album_id, item.asset_id
        `),
        reviewedItems: rows<ReviewItemRow>(db, `
            SELECT * FROM review_items
            WHERE status != 'pending'
               OR reviewer_id IS NOT NULL
               OR review_note IS NOT NULL
               OR reviewed_at IS NOT NULL
            ORDER BY created_at, id
        `),
    };
    const anchorIds = new Set(collectAssetAnchorIds(stateWithoutAnchors));
    const binnedAssets = rows<{ id: string }>(
        db,
        'SELECT id FROM assets WHERE binned_at IS NOT NULL ORDER BY id',
    );
    for (const row of binnedAssets) {
        anchorIds.add(row.id);
    }
    const assetAnchors = snapshotAssetAnchors(db, [...anchorIds].sort());
    return { assetAnchors, ...stateWithoutAnchors };
}

function restoreAssetAnchors(db: Database.Database, rowsToRestore: readonly AssetRow[]): void {
    // These live Asset rows are transitional FK anchors for durable records still keyed by
    // assets.id. Ingest must revalidate their path/fingerprint before treating them as current.
    const insert = db.prepare(`INSERT INTO assets (
        id, original_path, asset_identity_guid, file_hash, file_size, width, height, photo_created_at,
        photo_created_at_confidence, exif_datetime, metadata_timestamp_source,
        sensitivity_score, binned_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of rowsToRestore) {
        insert.run(row.id, row.original_path, row.asset_identity_guid, row.file_hash, row.file_size, row.width, row.height,
            row.photo_created_at, row.photo_created_at_confidence, row.exif_datetime,
            row.metadata_timestamp_source, row.sensitivity_score, row.binned_at, row.created_at);
    }
}

function restorePeople(db: Database.Database, state: DurableLibraryResetState): void {
    const person = db.prepare(`INSERT INTO people (
        id, name, thumbnail_path, birth_date, death_date, created_at, lifecycle_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.people) {
        person.run(row.id, row.name, row.thumbnail_path, row.birth_date, row.death_date,
            row.created_at, row.lifecycle_status);
    }
    const redirect = db.prepare(`INSERT INTO person_redirects (
        old_person_id, current_person_id, reason_decision_id, created_at
    ) VALUES (?, ?, ?, ?)`);
    for (const row of state.personRedirects) {
        redirect.run(row.old_person_id, row.current_person_id, row.reason_decision_id, row.created_at);
    }
}

function restoreGedcom(db: Database.Database, state: DurableLibraryResetState): void {
    const tree = db.prepare(`INSERT INTO family_trees (
        id, filename, file_hash, gedcom_content, tree_group_id, version_label, home_person_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.familyTrees) {
        tree.run(row.id, row.filename, row.file_hash, row.gedcom_content, row.tree_group_id,
            row.version_label, row.home_person_id, row.created_at);
    }
    const link = db.prepare(`INSERT INTO people_gedcom_links (
        person_id, gedcom_tree_id, gedcom_person_id, created_at
    ) VALUES (?, ?, ?, ?)`);
    for (const row of state.peopleGedcomLinks) {
        link.run(row.person_id, row.gedcom_tree_id, row.gedcom_person_id, row.created_at);
    }
}

function restorePhotoEdits(db: Database.Database, state: DurableLibraryResetState): void {
    const style = db.prepare(`INSERT INTO photo_edit_styles (
        id, name, operations_json, masks_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of state.photoEditStyles) {
        style.run(row.id, row.name, row.operations_json, row.masks_json, row.created_at, row.updated_at);
    }
    const document = db.prepare(`INSERT INTO photo_edit_documents (
        id, source_asset_id, rendered_asset_id, parent_edit_id, name,
        operations_json, masks_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.photoEditDocuments) {
        document.run(row.id, row.source_asset_id, row.rendered_asset_id, row.name,
            row.operations_json, row.masks_json, row.status, row.created_at, row.updated_at);
    }
    const connectParent = db.prepare('UPDATE photo_edit_documents SET parent_edit_id = ? WHERE id = ?');
    for (const row of state.photoEditDocuments) {
        if (row.parent_edit_id) { connectParent.run(row.parent_edit_id, row.id); }
    }
}

function restoreMetadataAndTags(db: Database.Database, state: DurableLibraryResetState): void {
    const assertion = db.prepare(`INSERT INTO photo_metadata_assertions (
        id, asset_id, field_path, value_json, user_id, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.photoMetadataAssertions) {
        assertion.run(row.id, row.asset_id, row.field_path, row.value_json, row.user_id, row.note, row.created_at);
    }
    const definition = db.prepare(`INSERT INTO tag_definitions (
        id, canonical_label, description, status, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.tagDefinitions) {
        definition.run(row.id, row.canonical_label, row.description, row.status,
            row.category, row.created_at, row.updated_at);
    }
    const alias = db.prepare('INSERT INTO tag_aliases (id, tag_definition_id, alias_label, created_at) VALUES (?, ?, ?, ?)');
    for (const row of state.tagAliases) {
        alias.run(row.id, row.tag_definition_id, row.alias_label, row.created_at);
    }
    const assignment = db.prepare(`INSERT INTO asset_tag_assignments (
        asset_id, tag_definition_id, source_kind, source_record_id, confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.manualTagAssignments) {
        assignment.run(row.asset_id, row.tag_definition_id, row.source_kind, row.source_record_id,
            row.confidence, row.created_at, row.updated_at);
    }
}

function restoreAlbumsAndReviews(db: Database.Database, state: DurableLibraryResetState): void {
    const album = db.prepare(`INSERT INTO albums (
        id, title, description, cover_asset_id, rules_json, is_system, system_kind, created_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`);
    for (const row of state.userAlbums) {
        album.run(row.id, row.title, row.description, row.rules_json, row.is_system, row.system_kind, row.created_at);
    }
    const item = db.prepare('INSERT INTO album_items (album_id, asset_id, added_at) VALUES (?, ?, ?)');
    for (const row of state.userAlbumItems) { item.run(row.album_id, row.asset_id, row.added_at); }
    const setCover = db.prepare('UPDATE albums SET cover_asset_id = ? WHERE id = ?');
    for (const row of state.userAlbums) {
        if (row.cover_asset_id) { setCover.run(row.cover_asset_id, row.id); }
    }
    const review = db.prepare(`INSERT INTO review_items (
        id, review_item_type, subject_type, subject_id, payload_json, status,
        reviewer_id, review_note, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of state.reviewedItems) {
        review.run(row.id, row.review_item_type, row.subject_type, row.subject_id,
            row.payload_json, row.status, row.reviewer_id, row.review_note,
            row.reviewed_at, row.created_at, row.updated_at);
    }
}

/** Restore after schema creation and semantic-state restoration, inside the caller's transaction. */
export function restoreDurableLibraryResetState(
    db: Database.Database,
    state: DurableLibraryResetState,
): void {
    restoreAssetAnchors(db, state.assetAnchors);
    restorePeople(db, state);
    restoreGedcom(db, state);
    restorePhotoEdits(db, state);
    restoreMetadataAndTags(db, state);
    restoreAlbumsAndReviews(db, state);
}
