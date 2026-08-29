import { afterEach, describe, expect, it } from "bun:test";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { getLatestPluginRelease, openMarketplaceDatabase } from "./db";
import { loadMarketplaceEnv } from "./env";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
});

describe("openMarketplaceDatabase", () => {
  it("fails closed when the configured migrations directory is missing", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-missing-migrations-"));
    tempRoots.push(tempRoot);
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      migrationsDir: path.join(tempRoot, "missing-migrations"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow("migrations directory does not exist");
  });

  it("creates the db file, upload root, and applies migrations from the repo folder", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-"));
    tempRoots.push(tempRoot);

    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    const db = openMarketplaceDatabase(runtimeEnv);
    const tableNames = new Set(
      (db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
    );

    expect(existsSync(runtimeEnv.dbPath)).toBe(true);
    expect(existsSync(runtimeEnv.uploadRoot)).toBe(true);
    expect(tableNames.has("_migrations")).toBe(true);
    expect(tableNames.has("users")).toBe(true);
    expect(tableNames.has("modules")).toBe(true);
    expect(tableNames.has("module_versions")).toBe(true);
    expect(tableNames.has("billing_payments")).toBe(true);
    expect(tableNames.has("billing_refunds")).toBe(true);
    expect(tableNames.has("billing_resource_cursors")).toBe(true);
    expect(tableNames.has("module_draft_deletions")).toBe(true);

    db.close(false);
  });

  it("rejects edits to an already-applied migration", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-migration-integrity-"));
    tempRoots.push(tempRoot);
    const migrationsDir = path.join(tempRoot, "migrations");
    cpSync(loadMarketplaceEnv().migrationsDir, migrationsDir, { recursive: true });
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      migrationsDir,
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    openMarketplaceDatabase(runtimeEnv).close(false);
    appendFileSync(path.join(migrationsDir, "005-draft-cleanup-paths.sql"), "\n-- mutated after application\n");

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow("Applied marketplace migration changed");
  });

  it("rejects deletion of an already-applied migration", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-migration-deletion-"));
    tempRoots.push(tempRoot);
    const migrationsDir = path.join(tempRoot, "migrations");
    cpSync(loadMarketplaceEnv().migrationsDir, migrationsDir, { recursive: true });
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      migrationsDir,
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    openMarketplaceDatabase(runtimeEnv).close(false);
    rmSync(path.join(migrationsDir, "005-draft-cleanup-paths.sql"));

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow(
      "Applied marketplace migration files are missing: 005-draft-cleanup-paths.sql",
    );
  });

  it("rejects a migration inserted before the already-applied history", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-migration-order-"));
    tempRoots.push(tempRoot);
    const migrationsDir = path.join(tempRoot, "migrations");
    cpSync(loadMarketplaceEnv().migrationsDir, migrationsDir, { recursive: true });
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      migrationsDir,
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    openMarketplaceDatabase(runtimeEnv).close(false);
    copyFileSync(
      path.join(migrationsDir, "005-draft-cleanup-paths.sql"),
      path.join(migrationsDir, "000-inserted.sql"),
    );

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow("contiguous numbered sequence");
  });

  it("backfills a legacy migration checksum once and verifies it on later opens", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-checksum-backfill-"));
    tempRoots.push(tempRoot);
    const migrationsDir = path.join(tempRoot, "migrations");
    cpSync(loadMarketplaceEnv().migrationsDir, migrationsDir, { recursive: true });
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      migrationsDir,
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    openMarketplaceDatabase(runtimeEnv).close(false);
    const legacy = new Database(runtimeEnv.dbPath);
    legacy.query("UPDATE _migrations SET checksum_sha256 = NULL WHERE id = ?").run("005-draft-cleanup-paths.sql");
    legacy.close(false);

    const reopened = openMarketplaceDatabase(runtimeEnv);
    const row = reopened.query("SELECT checksum_sha256 FROM _migrations WHERE id = ?")
      .get("005-draft-cleanup-paths.sql") as { checksum_sha256: string };
    expect(row.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    reopened.close(false);

    appendFileSync(path.join(migrationsDir, "005-draft-cleanup-paths.sql"), "\n-- changed after backfill\n");
    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow("Applied marketplace migration changed");
  });

  it("fails closed on schema drift instead of silently reconciling it outside migrations", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-schema-drift-"));
    tempRoots.push(tempRoot);
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };
    openMarketplaceDatabase(runtimeEnv).close(false);
    const damaged = new Database(runtimeEnv.dbPath);
    damaged.exec("ALTER TABLE users DROP COLUMN subscription_status;");
    damaged.close(false);

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow(
      "schema is incomplete after migrations: users.subscription_status",
    );
  });

  it("rejects a critical uniqueness index recreated with weaker semantics", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-db-index-drift-"));
    tempRoots.push(tempRoot);
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };
    openMarketplaceDatabase(runtimeEnv).close(false);
    const damaged = new Database(runtimeEnv.dbPath);
    damaged.exec(`
      DROP INDEX billing_checkouts_active_scope;
      CREATE INDEX billing_checkouts_active_scope ON billing_checkouts(user_id, scope_key);
    `);
    damaged.close(false);

    expect(() => openMarketplaceDatabase(runtimeEnv)).toThrow(
      "schema is incomplete after migrations: billing_checkouts_active_scope",
    );
  });

  it("returns the latest compatible plugin release for a version/platform/channel", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-updates-"));
    tempRoots.push(tempRoot);

    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    const db = openMarketplaceDatabase(runtimeEnv);
    db.query(
      `INSERT INTO plugin_releases (
        id, channel, version, platform, arch, file_path, checksum_sha256, file_size_bytes, published_at,
        release_notes, artifact_kind, artifact_path, artifact_checksum_sha256, artifact_size_bytes, manifest_path,
        manifest_checksum_sha256, base_version_min, base_version_max, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "release-1",
      "stable",
      "0.1.1",
      "windows",
      "x64",
      "artifact.zip",
      "old",
      42,
      "2026-03-24T00:00:00.000Z",
      "Patch one",
      "directory_patch",
      "artifact-1.zip",
      "artifact-1",
      84,
      "manifest-1.json",
      "manifest-1",
      "0.1.0",
      "0.1.0",
      "sig-1",
    );
    db.query(
      `INSERT INTO plugin_releases (
        id, channel, version, platform, arch, file_path, checksum_sha256, file_size_bytes, published_at,
        release_notes, artifact_kind, artifact_path, artifact_checksum_sha256, artifact_size_bytes, manifest_path,
        manifest_checksum_sha256, base_version_min, base_version_max, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "release-2",
      "stable",
      "0.1.2",
      "windows",
      "x64",
      "artifact.zip",
      "new",
      42,
      "2026-03-25T00:00:00.000Z",
      "Patch two",
      "directory_patch",
      "artifact-2.zip",
      "artifact-2",
      84,
      "manifest-2.json",
      "manifest-2",
      "0.1.0",
      "0.1.0",
      "sig-2",
    );

    const release = getLatestPluginRelease(db, {
      arch: "x64",
      channel: "stable",
      currentVersion: "0.1.0",
      platform: "windows",
    });

    expect(release?.id).toBe("release-2");
    db.close(false);
  });

  it("uses semantic version ordering for plugin release selection", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-updates-semver-"));
    tempRoots.push(tempRoot);

    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-test.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    const db = openMarketplaceDatabase(runtimeEnv);
    const insertRelease = db.query(
      `INSERT INTO plugin_releases (
        id, channel, version, platform, arch, file_path, checksum_sha256, file_size_bytes, published_at,
        release_notes, artifact_kind, artifact_path, artifact_checksum_sha256, artifact_size_bytes, manifest_path,
        manifest_checksum_sha256, base_version_min, base_version_max, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertRelease.run(
      "release-9",
      "stable",
      "0.1.9",
      "windows",
      "x64",
      "artifact-9.zip",
      "old",
      42,
      "2026-03-24T00:00:00.000Z",
      "Patch nine",
      "directory_patch",
      "artifact-9.zip",
      "artifact-9",
      84,
      "manifest-9.json",
      "manifest-9",
      "0.1.8",
      "0.1.9",
      "sig-9",
    );
    insertRelease.run(
      "release-10",
      "stable",
      "0.1.10",
      "windows",
      "x64",
      "artifact-10.zip",
      "new",
      42,
      "2026-03-25T00:00:00.000Z",
      "Patch ten",
      "directory_patch",
      "artifact-10.zip",
      "artifact-10",
      84,
      "manifest-10.json",
      "manifest-10",
      "0.1.9",
      "0.1.10",
      "sig-10",
    );
    insertRelease.run(
      "release-prerelease-mislabeled",
      "stable",
      "0.2.0-beta.1",
      "windows",
      "x64",
      "artifact-beta.zip",
      "beta",
      42,
      "2026-03-26T00:00:00.000Z",
      "Mislabeled prerelease",
      "directory_patch",
      "artifact-beta.zip",
      "artifact-beta",
      84,
      "manifest-beta.json",
      "manifest-beta",
      "0.1.9",
      "0.2.0-beta.1",
      "sig-beta",
    );

    const release = getLatestPluginRelease(db, {
      arch: "x64",
      channel: "stable",
      currentVersion: "0.1.9",
      platform: "windows",
    });

    expect(release?.id).toBe("release-10");
    db.close(false);
  });
});
