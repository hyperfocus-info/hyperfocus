import type { Database } from "bun:sqlite";
import { assistantLearningVisibilitySql, assistantTimestampPageabilitySql, assistantTodoPageabilitySql } from "./assistant-pageability";

export function ensureAssistantPersistenceIndexes(db: Database) {
  const created = assistantTimestampPageabilitySql();
  db.exec(`CREATE INDEX IF NOT EXISTS background_jobs_assistant_idx ON background_jobs(assistant_id);
    CREATE INDEX IF NOT EXISTS background_jobs_assistant_pageable_created_idx ON background_jobs(assistant_id, created_at DESC, id DESC) WHERE ${created};
    CREATE INDEX IF NOT EXISTS background_job_runs_assistant_pageable_created_idx ON background_job_runs(assistant_id, created_at DESC, id DESC) WHERE ${created};
    DROP INDEX IF EXISTS background_jobs_assistant_created_idx; DROP INDEX IF EXISTS background_job_runs_assistant_created_idx;
    DROP INDEX IF EXISTS background_jobs_assistant_updated_idx; DROP INDEX IF EXISTS background_job_runs_assistant_updated_idx;
    CREATE INDEX IF NOT EXISTS assistants_pageable_created_idx ON assistants(created_at DESC, id DESC) WHERE ${created};
    CREATE INDEX IF NOT EXISTS assistants_active_project_scope_id_idx ON assistants(scope, project_id, id) WHERE deleted_at IS NULL;
    DROP INDEX IF EXISTS assistants_pageable_updated_idx;
    CREATE INDEX IF NOT EXISTS assistant_messages_thread_pageable_created_idx ON assistant_messages(assistant_thread_id, created_at DESC, id DESC) WHERE ${created};
    CREATE INDEX IF NOT EXISTS assistant_logs_owner_pageable_created_idx ON assistant_log_entries(assistant_id, created_at DESC, id DESC) WHERE ${created};
    CREATE INDEX IF NOT EXISTS assistant_learnings_owner_visible_pageable_created_idx ON assistant_learnings(assistant_id, created_at DESC, id DESC) WHERE ${created} AND ${assistantLearningVisibilitySql()};
    DROP INDEX IF EXISTS assistant_learnings_owner_pageable_created_idx;
    CREATE INDEX IF NOT EXISTS assistant_questions_owner_pageable_asked_idx ON assistant_questions(assistant_id, asked_at DESC, id DESC) WHERE ${assistantTimestampPageabilitySql("asked_at")};
    CREATE INDEX IF NOT EXISTS assistant_todos_owner_pageable_sort_idx ON assistant_todos(assistant_id, sort_order ASC, updated_at DESC, id ASC) WHERE ${assistantTodoPageabilitySql()};`);
}
