import type { Database } from "bun:sqlite";
import { runPersistenceMigrationOnce, type PersistenceMigrationScope } from "./persistence-migrations";

const MAX_SAFE_SEQUENCE = Number.MAX_SAFE_INTEGER;
const REPAIR_MIGRATION = "run-lifecycle-sequence-v1";

export function ensureRunLifecycleSequences(db: Database, scope: PersistenceMigrationScope) {
  db.exec(`CREATE TABLE IF NOT EXISTS thread_run_sequences (
    thread_id TEXT PRIMARY KEY,
    current_sequence INTEGER NOT NULL CHECK(typeof(current_sequence) = 'integer' AND
      current_sequence >= 0 AND current_sequence <= ${MAX_SAFE_SEQUENCE})
  );
  DROP TRIGGER IF EXISTS agent_runs_validate_sequence_owner;
  DROP TRIGGER IF EXISTS agent_runs_validate_thread_sequence;
  DROP TABLE IF EXISTS run_sequence_assignments;
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_insert;
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_update;
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_delete;`);
  runPersistenceMigrationOnce(db, REPAIR_MIGRATION, () => db.exec(`
  DROP INDEX IF EXISTS agent_runs_thread_sequence_idx;
  CREATE TEMP TABLE IF NOT EXISTS run_sequence_repair_threads(thread_id TEXT PRIMARY KEY);
  DELETE FROM run_sequence_repair_threads;
  INSERT INTO run_sequence_repair_threads(thread_id) SELECT thread_id FROM agent_runs GROUP BY thread_id HAVING
    SUM(CASE WHEN typeof(thread_run_sequence) != 'integer' OR thread_run_sequence <= 0 OR
      thread_run_sequence > ${MAX_SAFE_SEQUENCE} THEN 1 ELSE 0 END) > 0 OR COUNT(*) != COUNT(DISTINCT thread_run_sequence);
  UPDATE agent_runs SET thread_run_sequence = 1 + (SELECT COUNT(*) FROM agent_runs prior
    WHERE prior.thread_id = agent_runs.thread_id AND (prior.created_at < agent_runs.created_at OR
      (prior.created_at = agent_runs.created_at AND prior.id < agent_runs.id)))
    WHERE thread_id IN (SELECT thread_id FROM run_sequence_repair_threads);
  UPDATE thread_run_sequences SET current_sequence = COALESCE((SELECT MAX(thread_run_sequence) FROM agent_runs
    WHERE thread_id = thread_run_sequences.thread_id), 0) WHERE typeof(current_sequence) != 'integer' OR
    current_sequence < 0 OR current_sequence > ${MAX_SAFE_SEQUENCE};
  INSERT INTO thread_run_sequences(thread_id, current_sequence)
    SELECT thread_id, MAX(thread_run_sequence) FROM agent_runs GROUP BY thread_id
    ON CONFLICT(thread_id) DO UPDATE SET current_sequence = MAX(current_sequence, excluded.current_sequence);
  CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_thread_sequence_idx
    ON agent_runs(thread_id, thread_run_sequence) WHERE thread_run_sequence > 0;
  DROP TABLE run_sequence_repair_threads;`), scope);
  db.exec(`
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_insert;
  CREATE TRIGGER thread_run_sequences_validate_insert BEFORE INSERT ON thread_run_sequences WHEN
    typeof(NEW.current_sequence) != 'integer' OR NEW.current_sequence != 1
    BEGIN SELECT RAISE(ABORT, 'invalid thread run sequence counter'); END;
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_update;
  CREATE TRIGGER thread_run_sequences_validate_update BEFORE UPDATE OF current_sequence ON thread_run_sequences WHEN
    typeof(NEW.current_sequence) != 'integer' OR NEW.current_sequence != OLD.current_sequence + 1 OR
    NEW.current_sequence > ${MAX_SAFE_SEQUENCE}
    BEGIN SELECT RAISE(ABORT, 'invalid thread run sequence counter'); END;
  DROP TRIGGER IF EXISTS thread_run_sequences_validate_delete;
  CREATE TRIGGER thread_run_sequences_validate_delete BEFORE DELETE ON thread_run_sequences
    BEGIN SELECT RAISE(ABORT, 'thread run sequence counter is durable'); END;
  DROP TRIGGER IF EXISTS agent_runs_validate_thread_sequence_insert;
  CREATE TRIGGER agent_runs_validate_thread_sequence_insert BEFORE INSERT ON agent_runs WHEN
    typeof(NEW.thread_run_sequence) != 'integer' OR NEW.thread_run_sequence != 0 OR NOT EXISTS(
      SELECT 1 FROM project_threads WHERE id = NEW.thread_id AND project_id = NEW.project_id)
    BEGIN SELECT RAISE(ABORT, 'new run sequence must have a valid owner and be allocator-assigned'); END;
  DROP TRIGGER IF EXISTS agent_runs_validate_thread_sequence;
  CREATE TRIGGER agent_runs_validate_thread_sequence BEFORE UPDATE OF thread_run_sequence ON agent_runs WHEN
    typeof(NEW.thread_run_sequence) != 'integer' OR NEW.thread_run_sequence < 1 OR
    NEW.thread_run_sequence > ${MAX_SAFE_SEQUENCE} OR (NEW.thread_run_sequence != OLD.thread_run_sequence AND NOT
      (OLD.thread_run_sequence = 0 AND NEW.thread_run_sequence = COALESCE((SELECT current_sequence
        FROM thread_run_sequences WHERE thread_id = NEW.thread_id), 0)))
    BEGIN SELECT RAISE(ABORT, 'run sequence is immutable'); END;
  DROP TRIGGER IF EXISTS agent_runs_validate_sequence_owner;
  CREATE TRIGGER agent_runs_validate_sequence_owner BEFORE UPDATE OF project_id, thread_id ON agent_runs WHEN
    NEW.project_id != OLD.project_id OR NEW.thread_id != OLD.thread_id
    BEGIN SELECT RAISE(ABORT, 'run sequence owner is immutable'); END;
  DROP TRIGGER IF EXISTS agent_runs_assign_thread_sequence;
  CREATE TRIGGER agent_runs_assign_thread_sequence AFTER INSERT ON agent_runs BEGIN
    SELECT CASE WHEN COALESCE((SELECT current_sequence FROM thread_run_sequences WHERE thread_id = NEW.thread_id), 0)
      >= ${MAX_SAFE_SEQUENCE} THEN RAISE(ABORT, 'thread run sequence exhausted') END;
    INSERT INTO thread_run_sequences(thread_id, current_sequence) VALUES(NEW.thread_id, 1)
      ON CONFLICT(thread_id) DO UPDATE SET current_sequence = current_sequence + 1;
    UPDATE agent_runs SET thread_run_sequence = (SELECT current_sequence FROM thread_run_sequences
      WHERE thread_id = NEW.thread_id) WHERE id = NEW.id;
  END;`);
}
