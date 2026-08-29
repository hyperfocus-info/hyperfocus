CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  duration_seconds REAL,
  original_sample_rate INTEGER,
  channel_count INTEGER,
  codec TEXT,
  estimated_bitrate_kbps REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE source_locations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  normalized_path TEXT NOT NULL UNIQUE,
  source_path TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media_assets(id)
);

CREATE TABLE evaluation_runs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  source_location_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  evaluator_fingerprint TEXT NOT NULL,
  overall_score REAL,
  confidence REAL,
  result_json TEXT NOT NULL,
  error_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media_assets(id),
  FOREIGN KEY (source_location_id) REFERENCES source_locations(id)
);

CREATE INDEX evaluation_runs_media_finished
  ON evaluation_runs(media_id, finished_at DESC);

CREATE INDEX evaluation_runs_fingerprint
  ON evaluation_runs(media_id, evaluator_fingerprint, status, finished_at DESC);

CREATE TABLE dimension_results (
  run_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  score REAL,
  confidence REAL NOT NULL,
  valid INTEGER NOT NULL,
  weight REAL NOT NULL,
  contribution REAL,
  PRIMARY KEY (run_id, dimension_id),
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);

CREATE TABLE metric_results (
  run_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  dimension_id TEXT,
  score REAL,
  confidence REAL NOT NULL,
  valid INTEGER NOT NULL,
  weight REAL NOT NULL,
  contribution REAL,
  evidence_json TEXT NOT NULL,
  diagnosis TEXT,
  PRIMARY KEY (run_id, metric_id),
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);

CREATE TABLE time_series (
  run_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  start_seconds REAL NOT NULL,
  step_seconds REAL,
  point_count INTEGER NOT NULL,
  timestamps_blob BLOB,
  values_blob BLOB NOT NULL,
  minimum REAL,
  maximum REAL,
  PRIMARY KEY (run_id, series_id),
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);

