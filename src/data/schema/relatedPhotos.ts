/** Clean creation DDL: event hypotheses are separate from duplicate/Photograph identity. */
export const RELATED_PHOTOS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS related_photo_features (
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, feature_key TEXT NOT NULL, label TEXT NOT NULL,
    confidence TEXT NOT NULL, source_id TEXT NOT NULL,
    PRIMARY KEY(asset_id, kind, feature_key, source_id)
  );
  CREATE INDEX IF NOT EXISTS idx_related_features_lookup ON related_photo_features(kind, feature_key, asset_id);
  CREATE TABLE IF NOT EXISTS related_photo_order (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL, ordinal INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_related_order ON related_photo_order(context_key, ordinal, asset_id);
  CREATE TABLE IF NOT EXISTS photo_events (
    id TEXT PRIMARY KEY, seed_asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('proposed','supported','conflicted')),
    confidence TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS photo_event_members (
    event_id TEXT NOT NULL REFERENCES photo_events(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('anchored','strong','possible','conflicting')),
    confidence TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','rejected','withdrawn')),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)), revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(event_id, asset_id)
  );
  CREATE INDEX IF NOT EXISTS idx_photo_event_member_asset ON photo_event_members(asset_id, state, event_id);
  CREATE TABLE IF NOT EXISTS photo_event_decisions (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, asset_id TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK(disposition IN ('confirmed','rejected','undecided')),
    user_id TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL,
    FOREIGN KEY(event_id, asset_id) REFERENCES photo_event_members(event_id, asset_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_photo_event_decision ON photo_event_decisions(event_id, asset_id);
  CREATE TABLE IF NOT EXISTS related_photo_queue (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    cause TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK(status IN ('pending','running','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_related_photo_queue ON related_photo_queue(status, updated_at, asset_id);
  CREATE TABLE IF NOT EXISTS analysis_source_roots (
    source_id TEXT NOT NULL REFERENCES analysis_sources(id) ON DELETE CASCADE,
    root_claim_id TEXT NOT NULL REFERENCES analysis_claims(id) ON DELETE CASCADE,
    PRIMARY KEY(source_id, root_claim_id)
  );
  CREATE INDEX IF NOT EXISTS idx_analysis_source_root_dependants ON analysis_source_roots(root_claim_id, source_id);
  CREATE TABLE IF NOT EXISTS analysis_claim_roots (
    claim_id TEXT NOT NULL REFERENCES analysis_claims(id) ON DELETE CASCADE,
    root_claim_id TEXT NOT NULL REFERENCES analysis_claims(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('support','contradiction')),
    PRIMARY KEY(claim_id, root_claim_id, role), CHECK(claim_id <> root_claim_id)
  );
  CREATE INDEX IF NOT EXISTS idx_analysis_root_dependants ON analysis_claim_roots(root_claim_id, claim_id);
  CREATE TABLE IF NOT EXISTS analysis_source_memberships (
    source_id TEXT NOT NULL REFERENCES analysis_sources(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, asset_id TEXT NOT NULL, revision INTEGER NOT NULL,
    PRIMARY KEY(source_id, event_id, asset_id),
    FOREIGN KEY(event_id, asset_id) REFERENCES photo_event_members(event_id, asset_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_analysis_source_member_dependants ON analysis_source_memberships(event_id, asset_id, source_id);
  CREATE TABLE IF NOT EXISTS analysis_claim_memberships (
    claim_id TEXT NOT NULL REFERENCES analysis_claims(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, asset_id TEXT NOT NULL, revision INTEGER NOT NULL,
    PRIMARY KEY(claim_id, event_id, asset_id),
    FOREIGN KEY(event_id, asset_id) REFERENCES photo_event_members(event_id, asset_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_analysis_member_dependants ON analysis_claim_memberships(event_id, asset_id, claim_id);
  CREATE TABLE IF NOT EXISTS related_face_candidates (
    face_id TEXT NOT NULL REFERENCES faces(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES photo_events(id) ON DELETE CASCADE,
    confidence TEXT NOT NULL, evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    root_claim_ids_json TEXT NOT NULL CHECK(json_valid(root_claim_ids_json)),
    PRIMARY KEY(face_id, person_id, event_id)
  );
  CREATE INDEX IF NOT EXISTS idx_related_face_person ON related_face_candidates(person_id, face_id);
  CREATE INDEX IF NOT EXISTS idx_related_face_event ON related_face_candidates(event_id, face_id);
  CREATE TABLE IF NOT EXISTS archive_impacts (
    id TEXT PRIMARY KEY, cause TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('progress','discovery','opportunity')),
    field TEXT, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
    root_claim_ids_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_archive_impacts_asset ON archive_impacts(asset_id, created_at);
  CREATE TABLE IF NOT EXISTS related_photo_state (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL CHECK(json_valid(state_json)), updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analysis_claim_decisions (
    id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES analysis_claims(id) ON DELETE CASCADE,
    disposition TEXT NOT NULL CHECK(disposition = 'rejected'), user_id TEXT NOT NULL,
    note TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS related_refinement_opportunities (
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    field TEXT NOT NULL, subject_id TEXT NOT NULL DEFAULT '',
    context_key TEXT NOT NULL, targets_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','resolved','withdrawn')),
    PRIMARY KEY(asset_id, field, subject_id)
  );
  CREATE TRIGGER IF NOT EXISTS invalidate_deleted_analysis_root BEFORE DELETE ON analysis_claims BEGIN
    INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
      SELECT DISTINCT claim.asset_id, 'evidence-removed', 1, 'pending', 0, NULL, CURRENT_TIMESTAMP
      FROM analysis_claim_roots dependency JOIN analysis_claims claim ON claim.id = dependency.claim_id
      WHERE dependency.root_claim_id = OLD.id AND claim.state = 'active' AND claim.asset_id <> OLD.asset_id
      ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = revision + 1, status = 'pending', error = NULL;
    UPDATE analysis_claims SET state = 'superseded' WHERE id IN
      (SELECT claim_id FROM analysis_claim_roots WHERE root_claim_id = OLD.id);
  END;
  CREATE TRIGGER IF NOT EXISTS invalidate_deleted_event_member BEFORE DELETE ON photo_event_members BEGIN
    INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
      SELECT DISTINCT claim.asset_id, 'membership-removed', 1, 'pending', 0, NULL, CURRENT_TIMESTAMP
      FROM analysis_claim_memberships dependency JOIN analysis_claims claim ON claim.id = dependency.claim_id
      WHERE dependency.event_id = OLD.event_id AND dependency.asset_id = OLD.asset_id
        AND claim.state = 'active' AND claim.asset_id <> OLD.asset_id
      ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = revision + 1, status = 'pending', error = NULL;
    UPDATE analysis_claims SET state = 'superseded' WHERE id IN
      (SELECT claim_id FROM analysis_claim_memberships WHERE event_id = OLD.event_id AND asset_id = OLD.asset_id);
  END;
  CREATE TRIGGER IF NOT EXISTS invalidate_replaced_visual_context AFTER INSERT ON analysis_runs
    WHEN NEW.status = 'successful' AND NEW.stage IN ('scout','perception') BEGIN
    UPDATE photo_event_members SET revision = revision + 1
      WHERE event_id IN (SELECT event_id FROM photo_event_members WHERE asset_id = NEW.asset_id) AND (asset_id = NEW.asset_id OR EXISTS (
      SELECT 1 FROM json_each(photo_event_members.evidence_json) evidence, json_each(evidence.value, '$.sourceIds') source
      WHERE source.value IN (SELECT id FROM analysis_claims WHERE asset_id = NEW.asset_id)
        OR source.value IN (SELECT id FROM analysis_regions WHERE asset_id = NEW.asset_id)));
  END;
`;

/** Installed after the existing People/semantic tables have been created; no migration ledger. */
export const RELATED_PHOTO_RUNTIME_TRIGGER_SQL = `
  CREATE TRIGGER IF NOT EXISTS invalidate_changed_human_identity AFTER UPDATE ON semantic_decisions
    WHEN OLD.is_current = 1 AND OLD.status = 'accepted' AND OLD.source_kind = 'human'
      AND (NEW.is_current <> 1 OR NEW.status <> 'accepted') BEGIN
    UPDATE photo_event_members SET revision = revision + 1 WHERE event_id IN (
      SELECT member.event_id FROM semantic_propositions proposition JOIN faces face ON face.id = proposition.subject_entity_id
      JOIN visual_regions region ON region.id = face.visual_region_id JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
      JOIN photo_event_members member ON member.asset_id = asset.id WHERE proposition.id = OLD.proposition_id) AND EXISTS (
      SELECT 1 FROM json_each(photo_event_members.evidence_json) evidence, json_each(evidence.value, '$.sourceIds') source
      WHERE source.value = OLD.id);
  END;
  CREATE TRIGGER IF NOT EXISTS invalidate_deleted_human_identity BEFORE DELETE ON semantic_decisions
    WHEN OLD.is_current = 1 AND OLD.status = 'accepted' AND OLD.source_kind = 'human' BEGIN
    UPDATE photo_event_members SET revision = revision + 1 WHERE event_id IN (
      SELECT member.event_id FROM semantic_propositions proposition JOIN faces face ON face.id = proposition.subject_entity_id
      JOIN visual_regions region ON region.id = face.visual_region_id JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
      JOIN photo_event_members member ON member.asset_id = asset.id WHERE proposition.id = OLD.proposition_id) AND EXISTS (
      SELECT 1 FROM json_each(photo_event_members.evidence_json) evidence, json_each(evidence.value, '$.sourceIds') source
      WHERE source.value = OLD.id);
  END;
  CREATE TRIGGER IF NOT EXISTS queue_added_album_context AFTER INSERT ON album_items BEGIN
    INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
      VALUES (NEW.asset_id, 'album-context', 1, 'pending', 0, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id) DO UPDATE SET revision = revision + 1, cause = excluded.cause, status = 'pending', error = NULL;
  END;
  CREATE TRIGGER IF NOT EXISTS queue_removed_album_context AFTER DELETE ON album_items BEGIN
    INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
      SELECT id, 'album-context', 1, 'pending', 0, NULL, CURRENT_TIMESTAMP FROM assets WHERE id = OLD.asset_id
      ON CONFLICT(asset_id) DO UPDATE SET revision = revision + 1, cause = excluded.cause, status = 'pending', error = NULL;
  END;
  CREATE TRIGGER IF NOT EXISTS invalidate_binned_event_member AFTER UPDATE OF binned_at ON assets
    WHEN NEW.binned_at IS NOT NULL BEGIN
    UPDATE photo_event_members SET state = 'withdrawn', revision = revision + 1 WHERE asset_id = NEW.id AND state = 'active';
  END;
`;
