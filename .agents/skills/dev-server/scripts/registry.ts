import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { portReservationConflict } from "./port-selection";

export type DevServerStatus = "starting" | "running" | "stopped" | "failed";
export type DevServerMode = "shared" | "isolated";
export type DevErrorCategory = "build" | "network" | "persistence" | "process" | "runtime" | "unknown";

export type DevServerRow = {
  id: string;
  surface: string;
  worktreePath: string;
  branch: string;
  mode: DevServerMode;
  host: string;
  port: number;
  url: string;
  supervisorPid: number | null;
  childPid: number | null;
  status: DevServerStatus;
  startedAt: string;
  readyAt: string | null;
  heartbeatAt: string;
  stopRequestedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  logPath: string;
  commandJson: string;
};

export type DevErrorRow = {
  id: number;
  serverId: string;
  surface: string;
  category: DevErrorCategory;
  source: string;
  message: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  investigatedAt: string | null;
  fixedAt: string | null;
};

export function openDevServerRegistry(databasePath: string) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_servers (
      id TEXT PRIMARY KEY,
      surface TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      branch TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('shared', 'isolated')),
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      url TEXT NOT NULL,
      supervisor_pid INTEGER,
      child_pid INTEGER,
      status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopped', 'failed')),
      started_at TEXT NOT NULL,
      ready_at TEXT,
      heartbeat_at TEXT NOT NULL,
      stop_requested_at TEXT,
      stopped_at TEXT,
      exit_code INTEGER,
      log_path TEXT NOT NULL,
      command_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS dev_servers_active_lookup
      ON dev_servers(surface, worktree_path, status, started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS dev_servers_one_shared_instance
      ON dev_servers(surface, worktree_path)
      WHERE mode = 'shared' AND status IN ('starting', 'running');
    CREATE TABLE IF NOT EXISTS dev_server_ports (
      host TEXT NOT NULL,
      port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
      server_id TEXT NOT NULL REFERENCES dev_servers(id) ON DELETE CASCADE,
      PRIMARY KEY(host, port)
    );
    CREATE TRIGGER IF NOT EXISTS dev_server_ports_release
      AFTER UPDATE OF status ON dev_servers
      WHEN NEW.status IN ('stopped', 'failed')
      BEGIN DELETE FROM dev_server_ports WHERE server_id = NEW.id; END;
    INSERT OR IGNORE INTO dev_server_ports(host, port, server_id)
      SELECT host, port, id FROM dev_servers WHERE status IN ('starting', 'running');
    CREATE TABLE IF NOT EXISTS dev_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES dev_servers(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('build', 'network', 'persistence', 'process', 'runtime', 'unknown')),
      source TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      message TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      investigated_at TEXT,
      fixed_at TEXT,
      UNIQUE(server_id, fingerprint)
    );
    CREATE INDEX IF NOT EXISTS dev_error_logs_open_lookup
      ON dev_error_logs(fixed_at, last_seen_at DESC);
  `);

  const serverColumns = `id, surface, worktree_path AS worktreePath, branch, mode, host, port, url,
    supervisor_pid AS supervisorPid, child_pid AS childPid, status, started_at AS startedAt,
    ready_at AS readyAt, heartbeat_at AS heartbeatAt, stop_requested_at AS stopRequestedAt,
    stopped_at AS stoppedAt, exit_code AS exitCode, log_path AS logPath, command_json AS commandJson`;
  const errorColumns = `errors.id, errors.server_id AS serverId, servers.surface, errors.category,
    errors.source, errors.message, errors.occurrence_count AS occurrenceCount,
    errors.first_seen_at AS firstSeenAt, errors.last_seen_at AS lastSeenAt,
    errors.investigated_at AS investigatedAt, errors.fixed_at AS fixedAt`;

  const insertServer = db.transaction((input: Omit<DevServerRow, "supervisorPid" | "childPid" | "status" | "readyAt" | "stopRequestedAt" | "stoppedAt" | "exitCode"> & { supervisorPid?: number }, ports: readonly number[]) => {
    for (const port of ports) {
      if (db.query<{ serverId: string }, [string, number]>("SELECT server_id AS serverId FROM dev_server_ports WHERE host = ?1 AND port = ?2").get(input.host, port)) {
        throw portReservationConflict(input.host, port);
      }
    }
    db.query<void, [string, string, string, string, string, string, number, string, string, string, string]>(`
      INSERT INTO dev_servers (
        id, surface, worktree_path, branch, mode, host, port, url, status,
        started_at, heartbeat_at, log_path, command_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'starting', ?9, ?9, ?10, ?11)
    `).run(input.id, input.surface, input.worktreePath, input.branch, input.mode, input.host,
      input.port, input.url, input.startedAt, input.logPath, input.commandJson);
    if (input.supervisorPid !== undefined) db.query("UPDATE dev_servers SET supervisor_pid = ?1 WHERE id = ?2").run(input.supervisorPid, input.id);
    for (const port of ports) db.query("INSERT INTO dev_server_ports(host, port, server_id) VALUES (?1, ?2, ?3)").run(input.host, port, input.id);
  });

  return {
    createServer(input: Parameters<typeof insertServer>[0], ports: readonly number[] = [input.port]) {
      if (!ports.includes(input.port) || ports.some(port => !Number.isInteger(port) || port < 1 || port > 65_535)) throw new RangeError("Invalid development port reservation");
      insertServer.immediate(input, [...new Set(ports)]);
    },
    getServer(id: string) {
      return db.query<DevServerRow, [string]>(`SELECT ${serverColumns} FROM dev_servers WHERE id = ?1`).get(id) ?? undefined;
    },
    findReusable(surface: string, worktreePath: string) {
      return db.query<DevServerRow, [string, string]>(`SELECT ${serverColumns} FROM dev_servers
        WHERE surface = ?1 AND worktree_path = ?2 AND mode = 'shared'
          AND status IN ('starting', 'running')
        ORDER BY started_at DESC LIMIT 1`).get(surface, worktreePath) ?? undefined;
    },
    listServers(activeOnly = false) {
      const where = activeOnly ? "WHERE status IN ('starting', 'running')" : "";
      return db.query<DevServerRow, []>(`SELECT ${serverColumns} FROM dev_servers ${where} ORDER BY started_at DESC`).all();
    },
    setSupervisorPid(id: string, pid: number) {
      db.query<void, [number, string]>("UPDATE dev_servers SET supervisor_pid = ?1 WHERE id = ?2").run(pid, id);
    },
    setChildPid(id: string, pid: number) {
      db.query<void, [number, string]>("UPDATE dev_servers SET child_pid = ?1 WHERE id = ?2").run(pid, id);
    },
    markRunning(id: string, at: string) {
      db.query<void, [string, string]>("UPDATE dev_servers SET status = 'running', ready_at = ?1, heartbeat_at = ?1 WHERE id = ?2 AND status = 'starting'").run(at, id);
    },
    heartbeat(id: string, at: string) {
      db.query<void, [string, string]>("UPDATE dev_servers SET heartbeat_at = ?1 WHERE id = ?2").run(at, id);
    },
    requestStop(id: string, at: string) {
      db.query<void, [string, string]>("UPDATE dev_servers SET stop_requested_at = COALESCE(stop_requested_at, ?1) WHERE id = ?2").run(at, id);
    },
    finish(id: string, status: Extract<DevServerStatus, "stopped" | "failed">, at: string, exitCode?: number) {
      db.query<void, [string, string, number | null, string]>(`UPDATE dev_servers
        SET status = ?1, stopped_at = ?2, heartbeat_at = ?2, exit_code = ?3 WHERE id = ?4`
      ).run(status, at, exitCode ?? null, id);
    },
    recordError(input: { serverId: string; category: DevErrorCategory; source: string; fingerprint: string; message: string; at: string }) {
      db.query<void, [string, string, string, string, string, string]>(`
        INSERT INTO dev_error_logs (
          server_id, category, source, fingerprint, message, first_seen_at, last_seen_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        ON CONFLICT(server_id, fingerprint) DO UPDATE SET
          category = excluded.category,
          source = excluded.source,
          message = excluded.message,
          occurrence_count = dev_error_logs.occurrence_count + 1,
          last_seen_at = excluded.last_seen_at,
          fixed_at = NULL
      `).run(input.serverId, input.category, input.source, input.fingerprint, input.message, input.at);
    },
    listErrors(options: { serverId?: string; surface?: string; includeFixed?: boolean } = {}) {
      const filters: string[] = [];
      const values: string[] = [];
      if (options.serverId) { filters.push("errors.server_id = ?"); values.push(options.serverId); }
      if (options.surface) { filters.push("servers.surface = ?"); values.push(options.surface); }
      if (!options.includeFixed) filters.push("errors.fixed_at IS NULL");
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      return db.query<DevErrorRow, string[]>(`SELECT ${errorColumns}
        FROM dev_error_logs errors JOIN dev_servers servers ON servers.id = errors.server_id
        ${where} ORDER BY errors.last_seen_at DESC`).all(...values);
    },
    setErrorState(id: number, state: "investigated" | "fixed" | "open", at: string) {
      if (state === "investigated") {
        db.query<void, [string, number]>("UPDATE dev_error_logs SET investigated_at = ?1 WHERE id = ?2").run(at, id);
      } else if (state === "fixed") {
        db.query<void, [string, string, number]>("UPDATE dev_error_logs SET investigated_at = COALESCE(investigated_at, ?1), fixed_at = ?2 WHERE id = ?3").run(at, at, id);
      } else {
        db.query<void, [number]>("UPDATE dev_error_logs SET investigated_at = NULL, fixed_at = NULL WHERE id = ?1").run(id);
      }
    },
    close() { db.close(false); }
  };
}

export type DevServerRegistry = ReturnType<typeof openDevServerRegistry>;
