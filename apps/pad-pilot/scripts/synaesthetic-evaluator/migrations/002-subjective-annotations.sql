CREATE TABLE subjective_annotations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE INDEX subjective_annotations_media_created
  ON subjective_annotations(media_id, created_at DESC, id DESC);

