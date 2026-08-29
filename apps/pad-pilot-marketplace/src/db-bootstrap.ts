import { Database } from "bun:sqlite";
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { nowIso, sha256 } from "./db-core";
import { marketplaceEnv as env, type MarketplaceEnv } from "./env";
import { readBoundedUtf8FileSync } from "@hyperfocus/pad-pilot/bounded-file";
const maxMigrationBytes = 2 * 1024 * 1024;
const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum_sha256 TEXT
);
`;

const hasColumn = (db: Database, tableName: string, columnName: string) => {
  const statement = db.prepare("SELECT name FROM pragma_table_info(?)");
  try {
    const rows = statement.all(tableName) as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  } finally {
    statement.finalize();
  }
};

function ensureMigrationChecksumColumn(db: Database) {
  if (!hasColumn(db, "_migrations", "checksum_sha256")) {
    db.exec("ALTER TABLE _migrations ADD COLUMN checksum_sha256 TEXT;");
  }
}

function applySqlMigrations(db: Database, migrationsDir: string) {
  db.exec(MIGRATIONS_TABLE_SQL);
  ensureMigrationChecksumColumn(db);
  if (!existsSync(migrationsDir)) {
    throw new Error(`Marketplace migrations directory does not exist: ${migrationsDir}`);
  }
  const migrationsStat = lstatSync(migrationsDir);
  if (!migrationsStat.isDirectory() || migrationsStat.isSymbolicLink()) {
    throw new Error(`Marketplace migrations path must be a real directory: ${migrationsDir}`);
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => extname(fileName) === ".sql")
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const [index, fileName] of migrationFiles.entries()) {
    const match = /^(\d{3})[-_][a-z0-9][a-z0-9-]*\.sql$/.exec(fileName);
    if (!match || Number(match[1]) !== index + 1) {
      throw new Error(`Marketplace migrations must form a contiguous numbered sequence: ${fileName}`);
    }
  }
  const appliedStatement = db.prepare("SELECT id FROM _migrations ORDER BY id");
  let appliedIds: string[];
  try {
    appliedIds = (appliedStatement.all() as Array<{ id: string }>).map((row) => row.id);
  } finally {
    appliedStatement.finalize();
  }
  const migrationFileIds = new Set(migrationFiles);
  const missingAppliedFiles = appliedIds.filter((id) => !migrationFileIds.has(id));
  if (missingAppliedFiles.length > 0) {
    throw new Error(`Applied marketplace migration files are missing: ${missingAppliedFiles.join(", ")}`);
  }
  const expectedAppliedIds = migrationFiles.slice(0, appliedIds.length);
  if (appliedIds.some((id, index) => id !== expectedAppliedIds[index])) {
    throw new Error("Marketplace migration history is not an append-only prefix of the migration files.");
  }

  for (const fileName of migrationFiles) {
    const sql = readBoundedUtf8FileSync(
      join(migrationsDir, fileName),
      maxMigrationBytes,
      "Marketplace migration",
    );
    const checksum = sha256(sql);
    db.transaction(() => {
      const applied = db.query("SELECT checksum_sha256 FROM _migrations WHERE id = ?").get(fileName) as {
        checksum_sha256: string | null;
      } | null;
      if (applied) {
        if (!applied.checksum_sha256) {
          db.query("UPDATE _migrations SET checksum_sha256 = ? WHERE id = ?").run(checksum, fileName);
          return;
        }
        if (applied.checksum_sha256 !== checksum) {
          throw new Error(`Applied marketplace migration changed: ${fileName}`);
        }
        return;
      }
      db.exec(sql);
      db.query("INSERT INTO _migrations (id, applied_at, checksum_sha256) VALUES (?, ?, ?)").run(
        fileName,
        nowIso(),
        checksum,
      );
    }).immediate();
  }
}

const requiredSchema = {
  _migrations: ["id", "applied_at", "checksum_sha256"],
  api_sessions: ["id", "user_id", "token_hash", "expires_at", "last_seen_at"],
  billing_checkouts: ["id", "user_id", "checkout_kind", "scope_key", "stripe_checkout_url", "order_id", "status"],
  billing_payments: ["id", "provider_payment_id", "user_id", "payment_kind", "refunded_cents", "reversed_access_cents", "reversed_tokens"],
  billing_refunds: ["id", "provider_refund_id", "billing_payment_id", "amount_cents", "status"],
  billing_resource_cursors: ["resource_key", "event_created", "event_priority", "event_id"],
  entitlements: ["id", "user_id", "module_id", "provider_payment_id", "revoked_at"],
  first_class_memberships: ["id", "user_id", "status", "provider_subscription_id", "discount_percent"],
  module_assets: ["id", "module_version_id", "relative_path", "file_size_bytes"],
  module_draft_deletions: ["module_id", "user_id", "deleted_at", "cleanup_paths_json"],
  module_versions: ["id", "module_id", "version", "changelog", "manifest_json", "bundle_path", "checksum_sha256"],
  modules: ["id", "owner_user_id", "slug", "visibility", "updated_at"],
  orders: ["id", "user_id", "module_id", "provider_payment_intent_id", "status", "updated_at"],
  padpilot_access: ["id", "user_id", "status", "amount_paid_cents", "remaining_balance_cents", "provider_subscription_id"],
  pilot_token_ledger: ["id", "user_id", "source_ref", "delta_tokens", "balance_after"],
  plugin_releases: ["id", "version", "artifact_path", "artifact_checksum_sha256", "manifest_path", "manifest_checksum_sha256", "signature"],
  subscriptions: ["id", "user_id", "provider_customer_id", "provider_subscription_id", "status"],
  users: ["id", "clerk_user_id", "subscription_status", "pilot_token_balance", "updated_at"],
  webhook_events: ["id", "provider", "provider_event_id", "event_type", "payload_json"],
} as const;

const requiredIndexes = {
  billing_checkouts_active_scope: {
    columns: ["user_id", "scope_key"],
    table: "billing_checkouts",
    where: "scope_key is not null and status in ('created', 'pending')",
  },
  billing_payments_charge: {
    columns: ["provider", "provider_charge_id"],
    table: "billing_payments",
    where: "provider_charge_id is not null",
  },
  billing_payments_checkout: {
    columns: ["provider", "provider_checkout_session_id"],
    table: "billing_payments",
    where: "provider_checkout_session_id is not null",
  },
  billing_payments_intent: {
    columns: ["provider", "provider_payment_intent_id"],
    table: "billing_payments",
    where: "provider_payment_intent_id is not null",
  },
  billing_payments_invoice: {
    columns: ["provider", "provider_invoice_id"],
    table: "billing_payments",
    where: "provider_invoice_id is not null",
  },
  first_class_provider_subscription: {
    columns: ["provider_subscription_id"],
    table: "first_class_memberships",
    where: "provider_subscription_id is not null",
  },
  orders_active_module_purchase: {
    columns: ["user_id", "module_id"],
    table: "orders",
    where: "status in ('created', 'pending', 'paid', 'partially_refunded')",
  },
  padpilot_access_provider_subscription: {
    columns: ["provider_subscription_id"],
    table: "padpilot_access",
    where: "provider_subscription_id is not null",
  },
} as const;

function validateRequiredSchema(db: Database) {
  const problems: string[] = [];
  const columnStatement = db.prepare("SELECT name FROM pragma_table_info(?)");
  try {
    for (const [tableName, columns] of Object.entries(requiredSchema)) {
      const actualColumns = new Set(
        (columnStatement.all(tableName) as Array<{ name: string }>).map((column) => column.name),
      );
      if (actualColumns.size === 0) {
        problems.push(tableName);
        continue;
      }
      for (const column of columns) {
        if (!actualColumns.has(column)) {
          problems.push(`${tableName}.${column}`);
        }
      }
    }
  } finally {
    columnStatement.finalize();
  }
  for (const [indexName, contract] of Object.entries(requiredIndexes)) {
    const indexList = db.prepare("SELECT name, \"unique\" AS is_unique, partial FROM pragma_index_list(?)");
    let index: { is_unique: number; name: string; partial: number } | undefined;
    try {
      index = (indexList.all(contract.table) as Array<{ is_unique: number; name: string; partial: number }>)
        .find((candidate) => candidate.name === indexName);
    } finally {
      indexList.finalize();
    }
    if (!index || index.is_unique !== 1 || index.partial !== 1) {
      problems.push(indexName);
      continue;
    }
    const indexColumns = db.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno");
    let columns: string[];
    try {
      columns = (indexColumns.all(indexName) as Array<{ name: string }>).map((column) => column.name);
    } finally {
      indexColumns.finalize();
    }
    if (columns.length !== contract.columns.length || columns.some((column, columnIndex) => column !== contract.columns[columnIndex])) {
      problems.push(indexName);
      continue;
    }
    const indexSqlStatement = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?");
    let indexSql = "";
    try {
      indexSql = (indexSqlStatement.get(indexName) as { sql: string } | null)?.sql ?? "";
    } finally {
      indexSqlStatement.finalize();
    }
    const whereClause = indexSql.replace(/;\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase()
      .split(" where ", 2)[1];
    if (whereClause !== contract.where) {
      problems.push(indexName);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Marketplace database schema is incomplete after migrations: ${problems.join(", ")}`);
  }
}

export function openMarketplaceDatabase(runtimeEnv: MarketplaceEnv = env) {
  mkdirSync(dirname(runtimeEnv.dbPath), { recursive: true });
  mkdirSync(runtimeEnv.uploadRoot, { recursive: true });

  const db = new Database(runtimeEnv.dbPath, { create: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    applySqlMigrations(db, runtimeEnv.migrationsDir);
    validateRequiredSchema(db);
    return db;
  } catch (error) {
    db.close(false);
    throw error;
  }
}

export function isMigrationRequested(argv: string[]) {
  return argv.includes("--migrate");
}

export const describeMigrationRun = (migrationsDir: string) =>
  readdirSync(migrationsDir)
    .filter((fileName) => basename(fileName).endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
