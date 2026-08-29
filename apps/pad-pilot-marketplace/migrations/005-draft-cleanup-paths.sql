ALTER TABLE module_draft_deletions
ADD COLUMN cleanup_paths_json TEXT NOT NULL DEFAULT '[]';
