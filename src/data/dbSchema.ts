function joinLegacyName(...parts: string[]): string {
    return parts.join('_');
}

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    original_path TEXT NOT NULL,
    file_hash TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    photo_created_at TEXT,
    photo_created_at_confidence REAL,
    exif_datetime TEXT,
    metadata_timestamp_source TEXT,
    sensitivity_score INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS asset_identities (
    guid TEXT PRIMARY KEY,
    original_path TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets_manual (
    identity_guid TEXT PRIMARY KEY,
    sensitivity_status TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(identity_guid) REFERENCES asset_identities(guid)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL,
    input_subjects_json TEXT NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workflow_run_milestones (
    workflow_run_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workflow_run_id, milestone_id),
    FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS step_runs (
    id TEXT PRIMARY KEY,
    workflow_run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL,
    expected_items INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subject_executions (
    id TEXT PRIMARY KEY,
    workflow_run_id TEXT NOT NULL,
    step_run_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    FOREIGN KEY(step_run_id) REFERENCES step_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    cancelable INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    finished_at TEXT,
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    current_item_path TEXT,
    throughput_ips REAL DEFAULT 0,
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS previews (
    asset_id TEXT NOT NULL,
    size TEXT NOT NULL,
    path TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id, size),
    FOREIGN KEY(asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS derived_results (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    task TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_version TEXT,
    data JSON,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS photo_metadata_blocks (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_version TEXT,
    schema_version INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS photo_metadata_assertions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    field_path TEXT NOT NULL,
    value_json TEXT NOT NULL,
    user_id TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS photo_metadata_projection (
    asset_id TEXT PRIMARY KEY,
    type TEXT,
    type_source_kind TEXT,
    type_source_id TEXT,
    caption TEXT,
    caption_source_kind TEXT,
    caption_source_id TEXT,
    description TEXT,
    description_source_kind TEXT,
    description_source_id TEXT,
    location TEXT,
    location_source_kind TEXT,
    location_source_id TEXT,
    estimated_date_most_likely TEXT,
    estimated_date_min TEXT,
    estimated_date_max TEXT,
    estimated_date_display_label TEXT,
    estimated_date_rationale TEXT,
    estimated_date_source_kind TEXT,
    estimated_date_source_id TEXT,
    keywords_json TEXT,
    keywords_source_kind TEXT,
    keywords_source_id TEXT,
    emotional_impact TEXT,
    emotional_impact_source_kind TEXT,
    emotional_impact_source_id TEXT,
    quality_technical REAL,
    quality_lighting REAL,
    quality_composition REAL,
    quality_emotional REAL,
    quality_discard INTEGER,
    quality_source_kind TEXT,
    quality_source_id TEXT,
    recommended_enhancements_json TEXT,
    recommended_enhancements_source_kind TEXT,
    recommended_enhancements_source_id TEXT,
    authenticity_score REAL,
    authenticity_reasons_json TEXT,
    authenticity_source_kind TEXT,
    authenticity_source_id TEXT,
    subjects_json TEXT,
    subjects_source_kind TEXT,
    subjects_source_id TEXT,
    regions_of_interest_json TEXT,
    regions_of_interest_source_kind TEXT,
    regions_of_interest_source_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT,
    thumbnail_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS face_assignments (
    asset_id TEXT NOT NULL,
    face_index INTEGER NOT NULL,
    person_id TEXT NOT NULL,
    confidence REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id, face_index),
    FOREIGN KEY(asset_id) REFERENCES assets(id),
    FOREIGN KEY(person_id) REFERENCES people(id)
  );

  CREATE TABLE IF NOT EXISTS folder_history (
    path TEXT PRIMARY KEY,
    last_scanned_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS processing_issues (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    job_id TEXT,
    task TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS manual_face_names (
    original_path TEXT NOT NULL,
    face_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (original_path, face_index)
  );

  CREATE TABLE IF NOT EXISTS manual_face_isolations (
    original_path TEXT NOT NULL,
    face_index INTEGER NOT NULL,
    from_person_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (original_path, face_index)
  );

  CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(original_path);
  CREATE INDEX IF NOT EXISTS idx_assets_photo_created_at ON assets(photo_created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_derived_task ON derived_results(task);
  CREATE INDEX IF NOT EXISTS idx_derived_task_asset ON derived_results(task, asset_id);
  CREATE INDEX IF NOT EXISTS idx_photo_metadata_blocks_asset_created ON photo_metadata_blocks(asset_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_photo_metadata_blocks_source_created ON photo_metadata_blocks(source_kind, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_photo_metadata_assertions_asset_created ON photo_metadata_assertions(asset_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_photo_metadata_assertions_field_created ON photo_metadata_assertions(field_path, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_assignments_person ON face_assignments(person_id);
  CREATE INDEX IF NOT EXISTS idx_issues_asset ON processing_issues(asset_id);
  CREATE INDEX IF NOT EXISTS idx_issues_task ON processing_issues(task);
  CREATE INDEX IF NOT EXISTS idx_issues_task_created ON processing_issues(task, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_status_started ON jobs(status, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_status_id ON jobs(status, id);
  CREATE INDEX IF NOT EXISTS idx_previews_size_asset ON previews(size, asset_id);
  CREATE INDEX IF NOT EXISTS idx_identities_path ON asset_identities(original_path);
  CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_created ON workflow_runs(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_step_runs_run_status ON step_runs(workflow_run_id, status);
  CREATE INDEX IF NOT EXISTS idx_subject_executions_run_status ON subject_executions(workflow_run_id, status);
  CREATE INDEX IF NOT EXISTS idx_workflow_milestones_run_status ON workflow_run_milestones(workflow_run_id, status);

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS asset_groups (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT,
    description TEXT,
    canonical_asset_id TEXT,
    algorithm_version TEXT,
    params_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (canonical_asset_id) REFERENCES assets(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS asset_group_members (
    group_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    role TEXT NOT NULL,
    rank INTEGER,
    evidence_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, asset_id),
    FOREIGN KEY (group_id) REFERENCES asset_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_group_children (
    parent_group_id TEXT NOT NULL,
    child_group_id TEXT NOT NULL,
    rank INTEGER,
    evidence_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_group_id, child_group_id),
    FOREIGN KEY (parent_group_id) REFERENCES asset_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (child_group_id) REFERENCES asset_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_similarity_edges (
    asset_id_a TEXT NOT NULL,
    asset_id_b TEXT NOT NULL,
    kind TEXT NOT NULL,
    score REAL NOT NULL,
    reason TEXT,
    evidence_json TEXT,
    algorithm_version TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (asset_id_a, asset_id_b, kind),
    FOREIGN KEY (asset_id_a) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id_b) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_features (
    asset_id TEXT PRIMARY KEY,
    file_hash TEXT,
    phash64 TEXT,
    dhash64 TEXT,
    ahash64 TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    cover_asset_id TEXT,
    rules_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS album_items (
    album_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (album_id, asset_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_asset_groups_type ON asset_groups(type);
  CREATE INDEX IF NOT EXISTS idx_asset_groups_canonical ON asset_groups(canonical_asset_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_asset ON asset_group_members(asset_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON asset_group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_children_parent ON asset_group_children(parent_group_id);
  CREATE INDEX IF NOT EXISTS idx_group_children_child ON asset_group_children(child_group_id);
  CREATE INDEX IF NOT EXISTS idx_edges_a ON asset_similarity_edges(asset_id_a);
  CREATE INDEX IF NOT EXISTS idx_edges_b ON asset_similarity_edges(asset_id_b);
  CREATE INDEX IF NOT EXISTS idx_edges_kind_score ON asset_similarity_edges(kind, score);
  CREATE INDEX IF NOT EXISTS idx_asset_features_phash ON asset_features(phash64);
  CREATE INDEX IF NOT EXISTS idx_album_items_asset ON album_items(asset_id);
`;

export const MIGRATIONS = [
    "ALTER TABLE assets ADD COLUMN width INTEGER",
    "ALTER TABLE assets ADD COLUMN height INTEGER",
    "ALTER TABLE assets ADD COLUMN caption TEXT",
    "ALTER TABLE assets ADD COLUMN sensitivity_score INTEGER",
    "ALTER TABLE manual_face_isolations ADD COLUMN from_person_id TEXT",
    "ALTER TABLE jobs RENAME COLUMN type TO stage",
    "ALTER TABLE jobs ADD COLUMN started_at TEXT",
    "ALTER TABLE jobs ADD COLUMN finished_at TEXT",
    "ALTER TABLE jobs ADD COLUMN total_items INTEGER DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN processed_items INTEGER DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN error_count INTEGER DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN current_item_path TEXT",
    "ALTER TABLE jobs ADD COLUMN throughput_ips REAL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN last_error TEXT",
    "ALTER TABLE workflow_runs ADD COLUMN parameters_json TEXT DEFAULT '{}'",
    "ALTER TABLE step_runs ADD COLUMN expected_items INTEGER",
    "ALTER TABLE step_runs ADD COLUMN error_message TEXT",
    "ALTER TABLE assets ADD COLUMN metadata_timestamp_source TEXT",
    "ALTER TABLE assets ADD COLUMN photo_created_at TEXT",
    "ALTER TABLE assets ADD COLUMN photo_created_at_confidence REAL",
];

export const LEGACY_QUEUE_TABLE_NAME = joinLegacyName('task', 'queue');
export const LEGACY_WORKFLOW_SETTINGS = [
    joinLegacyName('cleanup', 'legacy', 'ai', 'metadata', 'split', 'v1'),
    joinLegacyName('dashboard', 'paused', 'modules', 'json'),
    joinLegacyName('workflow', 'generate', 'previews', 'on', 'ingest'),
    joinLegacyName('workflow', 'modules', 'json'),
    joinLegacyName('workflow', 'stage', 'overrides', 'json'),
] as const;
