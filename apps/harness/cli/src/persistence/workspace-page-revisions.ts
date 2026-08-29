import type { Database } from "bun:sqlite";

const CATALOG_KEY = "workspace_page_revision";
const THREAD_KEY_PREFIX = "workspace_thread_page_revision:";
const PROJECT_INCARNATION_PREFIX = "workspace_project_incarnation:";
const THREAD_INCARNATION_PREFIX = "workspace_thread_incarnation:";
const RUN_INCARNATION_PREFIX = "workspace_run_incarnation:";
const operations = ["INSERT", "UPDATE", "DELETE"] as const;
const aliases = (operation: typeof operations[number]) => operation === "INSERT" ? ["NEW"] : operation === "DELETE" ? ["OLD"] : ["OLD", "NEW"];
const rotate = (keySql: string, whereSql = "1", fromSql = "") => `INSERT INTO workspace_meta(key, value) SELECT ${keySql}, lower(hex(randomblob(16))) ${fromSql} WHERE ${whereSql}
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;`;

export function ensureWorkspacePageRevisionTriggers(db: Database) {
  seedIncarnations(db, "projects", PROJECT_INCARNATION_PREFIX);
  seedIncarnations(db, "project_threads", THREAD_INCARNATION_PREFIX);
  seedIncarnations(db, "agent_runs", RUN_INCARNATION_PREFIX);
  for (const table of ["projects", "project_modes"] as const) for (const operation of operations) replace(db, table, operation,
    rotate(`'${CATALOG_KEY}'`) + (table === "projects" && operation === "INSERT"
      ? rotate(`'${THREAD_KEY_PREFIX}' || NEW.id`) + rotate(`'${PROJECT_INCARNATION_PREFIX}' || NEW.id`)
      : table === "projects" && operation === "DELETE" ? `DELETE FROM workspace_meta WHERE key IN
        ('${THREAD_KEY_PREFIX}' || OLD.id, '${PROJECT_INCARNATION_PREFIX}' || OLD.id);` : ""));
  for (const operation of operations) {
    const refs = aliases(operation); const threadIds = refs.map((row) => `${row}.id`).join(", ");
    const threadProjects = refs.map((row) => `${row}.project_id`).join(", ");
    replace(db, "project_threads", operation, rotate(`'${THREAD_KEY_PREFIX}' || id`, `id IN (${threadProjects})`, "FROM projects") + rotate(`'${CATALOG_KEY}'`,
      `EXISTS (SELECT 1 FROM projects WHERE active_thread_id IN (${threadIds}))`) + (operation === "INSERT" ? rotate(`'${THREAD_INCARNATION_PREFIX}' || NEW.id`)
        : operation === "DELETE" ? `DELETE FROM workspace_meta WHERE key = '${THREAD_INCARNATION_PREFIX}' || OLD.id;` : ""));
    for (const table of ["thread_messages", "agent_runs"] as const) {
      const ids = refs.map((row) => `${row}.thread_id`).join(", ");
      const projects = table === "agent_runs" ? refs.map((row) => `${row}.project_id`).join(", ")
        : `SELECT project_id FROM project_threads WHERE id IN (${ids})`;
      replace(db, table, operation, rotate(`'${THREAD_KEY_PREFIX}' || id`, `id IN (${projects})`, "FROM projects") + rotate(`'${CATALOG_KEY}'`,
        `EXISTS (SELECT 1 FROM projects WHERE active_thread_id IN (${ids}))`) + (table === "agent_runs" && operation === "INSERT"
        ? rotate(`'${RUN_INCARNATION_PREFIX}' || NEW.id`) : table === "agent_runs" && operation === "DELETE"
          ? `DELETE FROM workspace_meta WHERE key = '${RUN_INCARNATION_PREFIX}' || OLD.id;` : ""));
    }
  }
}

function seedIncarnations(db: Database, table: string, prefix: string) {
  db.run(`INSERT INTO workspace_meta(key, value) SELECT '${prefix}' || id, lower(hex(randomblob(16))) FROM ${table} WHERE 1
    ON CONFLICT(key) DO NOTHING`);
}

function replace(db: Database, table: string, operation: string, body: string) {
  const name = `${table}_workspace_page_revision_${operation.toLowerCase()}`; db.run(`DROP TRIGGER IF EXISTS ${name}`);
  db.run(`CREATE TRIGGER ${name} AFTER ${operation} ON ${table} BEGIN ${body} END`);
}

export const workspacePageRevisionSql = `(SELECT value FROM workspace_meta WHERE key = '${CATALOG_KEY}')`;
export const workspaceThreadPageRevisionSql = `(SELECT value FROM workspace_meta WHERE key = '${THREAD_KEY_PREFIX}' || ?1)`;
export const workspaceThreadIncarnationSql = (parameter: number) =>
  `(SELECT value FROM workspace_meta WHERE key = '${THREAD_INCARNATION_PREFIX}' || ?${parameter})`;
export const workspaceProjectIncarnationSql = (parameter: number) =>
  `(SELECT value FROM workspace_meta WHERE key = '${PROJECT_INCARNATION_PREFIX}' || ?${parameter})`;
export const workspaceRunIncarnationSql = (parameter: number) =>
  `(SELECT value FROM workspace_meta WHERE key = '${RUN_INCARNATION_PREFIX}' || ?${parameter})`;
