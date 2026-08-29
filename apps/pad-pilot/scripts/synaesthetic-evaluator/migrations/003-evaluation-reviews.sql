CREATE TABLE evaluation_reviews (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  evaluator_fingerprint TEXT NOT NULL,
  review_schema_version INTEGER NOT NULL,
  overall_score REAL NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  dimension_scores_json TEXT NOT NULL,
  action_feedback_json TEXT NOT NULL,
  genre_tags_json TEXT NOT NULL,
  intent_tags_json TEXT NOT NULL,
  notes TEXT,
  calibration_eligible INTEGER NOT NULL CHECK (calibration_eligible IN (0, 1)),
  dataset_split TEXT NOT NULL CHECK (dataset_split IN ('train', 'validation', 'test')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE INDEX evaluation_reviews_run_created
  ON evaluation_reviews(run_id, created_at DESC);

CREATE INDEX evaluation_reviews_media_created
  ON evaluation_reviews(media_id, created_at DESC);

CREATE INDEX evaluation_reviews_split_eligible
  ON evaluation_reviews(dataset_split, calibration_eligible, created_at DESC);
