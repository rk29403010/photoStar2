import { RELATED_PHOTOS_SCHEMA_SQL } from './relatedPhotos';

/** Clean target schema. No migration or interpretation of historical AI blobs. */
export const PHOTO_ANALYSIS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS analysis_runs (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK(stage IN ('local','perception','scout','context','refine','user')),
    provider TEXT NOT NULL,
    model_version TEXT,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('successful','failed')),
    telemetry_json TEXT NOT NULL CHECK(json_valid(telemetry_json)),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    targets_json TEXT NOT NULL CHECK(json_valid(targets_json)),
    created_at TEXT NOT NULL,
    UNIQUE(id, asset_id)
  );
  CREATE TABLE IF NOT EXISTS analysis_images (
    id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
    PRIMARY KEY(id, run_id),
    UNIQUE(id, run_id, asset_id),
    FOREIGN KEY(run_id, asset_id) REFERENCES analysis_runs(id, asset_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS analysis_sources (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref_id TEXT,
    image_id TEXT,
    display_text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','withdrawn')),
    evidence_confidence TEXT CHECK(evidence_confidence IN ('high','medium','low','unknown')),
    UNIQUE(id, asset_id),
    FOREIGN KEY(run_id, asset_id) REFERENCES analysis_runs(id, asset_id) ON DELETE CASCADE,
    FOREIGN KEY(image_id, run_id, asset_id) REFERENCES analysis_images(id, run_id, asset_id)
  );
  CREATE TABLE IF NOT EXISTS analysis_claims (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    field TEXT NOT NULL,
    subject_id TEXT,
    value_json TEXT NOT NULL CHECK(json_valid(value_json)),
    confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low','unknown')),
    kind TEXT NOT NULL CHECK(kind IN ('observation','known_fact','hypothesis','inferred_conclusion','user_confirmed')),
    state TEXT NOT NULL CHECK(state IN ('active','rejected','superseded')),
    supersedes_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(id, asset_id),
    FOREIGN KEY(run_id, asset_id) REFERENCES analysis_runs(id, asset_id) ON DELETE CASCADE,
    FOREIGN KEY(supersedes_id, asset_id) REFERENCES analysis_claims(id, asset_id)
  );
  CREATE TABLE IF NOT EXISTS analysis_claim_sources (
    claim_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('evidence','contradiction','provenance')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    source_ordinal INTEGER NOT NULL CHECK(source_ordinal >= 0),
    source_id TEXT NOT NULL,
    display_text TEXT,
    PRIMARY KEY(claim_id, role, ordinal, source_ordinal),
    CHECK(role != 'evidence' OR ordinal < 3),
    CHECK(role != 'contradiction' OR ordinal < 2),
    FOREIGN KEY(claim_id, asset_id) REFERENCES analysis_claims(id, asset_id) ON DELETE CASCADE,
    FOREIGN KEY(source_id, asset_id) REFERENCES analysis_sources(id, asset_id)
  );
  CREATE TABLE IF NOT EXISTS analysis_regions (
    id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    image_id TEXT NOT NULL,
    label TEXT NOT NULL,
    source_box_json TEXT NOT NULL CHECK(json_valid(source_box_json)),
    photo_box_json TEXT NOT NULL CHECK(json_valid(photo_box_json)),
    PRIMARY KEY(id, run_id),
    FOREIGN KEY(run_id, asset_id) REFERENCES analysis_runs(id, asset_id) ON DELETE CASCADE,
    FOREIGN KEY(image_id, run_id, asset_id) REFERENCES analysis_images(id, run_id, asset_id)
  );
  CREATE INDEX IF NOT EXISTS idx_analysis_claims_resolution ON analysis_claims(asset_id, field, subject_id, state);
  CREATE INDEX IF NOT EXISTS idx_analysis_runs_asset ON analysis_runs(asset_id, created_at);
  ${RELATED_PHOTOS_SCHEMA_SQL}
`;
