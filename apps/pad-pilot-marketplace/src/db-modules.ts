import { Database } from "bun:sqlite";

import { compareVersions, nowIso } from "./db-core";
import type { ModuleListRow, ModuleRow, PluginReleaseChannel, PluginReleaseRow, UserRow, VersionRow } from "./db";
import { isSemVerInRange, parseSemVer } from "@hyperfocus/pad-pilot/semver";
export function getPluginReleaseById(db: Database, releaseId: string) {
  return db.query("SELECT * FROM plugin_releases WHERE id = ?").get(releaseId) as PluginReleaseRow | null;
}

export function listPluginReleases(
  db: Database,
  input: {
    arch: string;
    channel: PluginReleaseChannel;
    platform: string;
  },
) {
  return db
    .query(
      `SELECT *
       FROM plugin_releases
       WHERE channel = ? AND platform = ? AND arch = ?
       ORDER BY published_at DESC`,
    )
    .all(input.channel, input.platform, input.arch) as PluginReleaseRow[];
}

export function getLatestPluginRelease(
  db: Database,
  input: {
    arch: string;
    channel: PluginReleaseChannel;
    currentVersion: string;
    platform: string;
  },
) {
  const releases = listPluginReleases(db, input)
    .filter((release) => {
      const parsed = parseSemVer(release.version);
      return Boolean(parsed && (input.channel !== "stable" || parsed.prerelease.length === 0));
    })
    .filter((release) => compareVersions(release.version, input.currentVersion) > 0)
    .filter((release) => isSemVerInRange(input.currentVersion, {
      max: release.base_version_max,
      min: release.base_version_min,
    }))
    .sort((left, right) => compareVersions(right.version, left.version));

  return releases[0] ?? null;
}

export function getModuleById(db: Database, moduleId: string) {
  return db
    .query(
      `SELECT modules.*, users.username, users.display_name
       FROM modules
       LEFT JOIN users ON users.id = modules.owner_user_id
       WHERE modules.id = ?`,
    )
    .get(moduleId) as ModuleRow | null;
}

export function getLatestPublishedVersion(db: Database, moduleId: string) {
  const versions = db
    .query(
       `SELECT id, version, bundle_path, checksum_sha256, file_size_bytes, status, created_at, published_at
       FROM module_versions
       WHERE module_id = ? AND status = 'published'
       ORDER BY created_at DESC`,
    )
    .all(moduleId) as VersionRow[];
  return versions.sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
}

export function getLatestDraftVersion(db: Database, moduleId: string) {
  const versions = db
    .query(
      `SELECT id, version, bundle_path, checksum_sha256, file_size_bytes, status, created_at, published_at
       FROM module_versions
       WHERE module_id = ? AND status = 'draft'`,
    )
    .all(moduleId) as VersionRow[];
  return versions.sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
}

export function getLatestAccessibleVersion(db: Database, moduleId: string, user: UserRow | null) {
  if (!user) {
    return getLatestPublishedVersion(db, moduleId);
  }
  const versions = db
    .query(
      `SELECT module_versions.id, module_versions.version, module_versions.bundle_path, module_versions.checksum_sha256, module_versions.file_size_bytes, module_versions.status, module_versions.created_at, module_versions.published_at
       FROM module_versions
       JOIN modules ON modules.id = module_versions.module_id
       WHERE module_versions.module_id = ? AND modules.owner_user_id = ?
       ORDER BY module_versions.created_at DESC`,
    )
    .all(moduleId, user.id) as VersionRow[];
  return versions.sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
}

export function hasActiveModuleEntitlement(db: Database, moduleId: string, userId: string) {
  return Boolean(
    db.query(
      `SELECT 1
       FROM entitlements
       WHERE module_id = ? AND user_id = ? AND revoked_at IS NULL
       LIMIT 1`,
    ).get(moduleId, userId),
  );
}

export function listModulesForUser(db: Database, user: UserRow | null) {
  const visibilitySql = user
    ? "WHERE modules.visibility = 'published' OR modules.owner_user_id = ?"
    : "WHERE modules.visibility = 'published'";
  const args = user ? [user.id] : [];
  return db
    .query(
      `SELECT modules.*, users.username, users.display_name,
        (
          SELECT version FROM module_versions
          WHERE module_versions.module_id = modules.id AND module_versions.status = 'published'
          ORDER BY COALESCE(module_versions.published_at, module_versions.created_at) DESC, module_versions.created_at DESC
          LIMIT 1
        ) AS latest_published_version,
        (
          SELECT published_at FROM module_versions
          WHERE module_versions.module_id = modules.id AND module_versions.status = 'published'
          ORDER BY COALESCE(module_versions.published_at, module_versions.created_at) DESC, module_versions.created_at DESC
          LIMIT 1
        ) AS latest_published_at,
        (
          SELECT file_size_bytes FROM module_versions
          WHERE module_versions.module_id = modules.id AND module_versions.status = 'published'
          ORDER BY COALESCE(module_versions.published_at, module_versions.created_at) DESC, module_versions.created_at DESC
          LIMIT 1
        ) AS latest_file_size_bytes
       FROM modules
       LEFT JOIN users ON users.id = modules.owner_user_id
       ${visibilitySql}
       ORDER BY modules.updated_at DESC`,
    )
    .all(...args) as ModuleListRow[];
}

export function createModule(
  db: Database,
  id: string,
  ownerUserId: string,
  slug: string,
  name: string,
  description: string,
  priceCents: number,
  timestamp: string,
) {
  db.query(
    "INSERT INTO modules (id, owner_user_id, slug, name, description, price_cents, currency, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'usd', 'draft', ?, ?)",
  ).run(id, ownerUserId, slug, name, description, priceCents, timestamp, timestamp);
}

export function createModuleVersion(
  db: Database,
  id: string,
  moduleId: string,
  version: string,
  changelog: string,
  bundlePath: string,
  checksumSha256: string,
  fileSizeBytes: number,
  timestamp: string,
) {
  db.query(
    "INSERT INTO module_versions (id, module_id, version, changelog, manifest_json, bundle_path, checksum_sha256, file_size_bytes, status, created_at, published_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?, 'draft', ?, NULL)",
  ).run(id, moduleId, version, changelog, bundlePath, checksumSha256, fileSizeBytes, timestamp);
}

export function publishModule(
  db: Database,
  moduleId: string,
  ownerUserId: string,
  timestamp: string,
  expectedDraftVersionId = "",
) {
  db.transaction(() => {
    const moduleRow = db.query(
      "SELECT visibility FROM modules WHERE id = ? AND owner_user_id = ?",
    ).get(moduleId, ownerUserId) as { visibility: string } | null;
    if (!moduleRow) {
      throw new Error("Module owner did not match publish request.");
    }
    const drafts = db
      .query("SELECT id, version FROM module_versions WHERE module_id = ? AND status = 'draft'")
      .all(moduleId) as Array<{ id: string; version: string }>;
    if (moduleRow.visibility === "draft" && drafts.length === 0) {
      throw new Error("A module needs a draft version before it can be published.");
    }
    const updatedModule = db
      .query("UPDATE modules SET visibility = 'published', updated_at = ? WHERE id = ? AND owner_user_id = ?")
      .run(timestamp, moduleId, ownerUserId);
    if (updatedModule.changes !== 1) {
      throw new Error("Module owner did not match publish request.");
    }
    const latestDraft = drafts.sort((left, right) => compareVersions(right.version, left.version))[0];
    if (expectedDraftVersionId && latestDraft?.id !== expectedDraftVersionId) {
      throw new Error("The draft version changed while publication integrity was being verified.");
    }
    if (latestDraft) {
      db.query("UPDATE module_versions SET status = 'published', published_at = ? WHERE id = ?")
        .run(timestamp, latestDraft.id);
    }
  })();
}

export function updateModuleTimestamp(db: Database, moduleId: string, timestamp: string) {
  db.query("UPDATE modules SET updated_at = ? WHERE id = ?").run(timestamp, moduleId);
}

export function deleteDraftModule(db: Database, moduleId: string, ownerUserId: string) {
  return db.transaction(() => {
    const moduleRow = db.query(
      "SELECT id, visibility FROM modules WHERE id = ? AND owner_user_id = ?",
    ).get(moduleId, ownerUserId) as { id: string; visibility: string } | null;
    if (!moduleRow) {
      return null;
    }
    if (moduleRow.visibility !== "draft") {
      throw new Error("Published modules cannot be deleted through draft rollback.");
    }
    const versions = db.query(
      "SELECT id, bundle_path FROM module_versions WHERE module_id = ?",
    ).all(moduleId) as Array<{ bundle_path: string; id: string }>;
    db.query(
      `DELETE FROM module_assets
       WHERE module_version_id IN (SELECT id FROM module_versions WHERE module_id = ?)`,
    ).run(moduleId);
    db.query("DELETE FROM module_versions WHERE module_id = ?").run(moduleId);
    const deleted = db.query(
      "DELETE FROM modules WHERE id = ? AND owner_user_id = ? AND visibility = 'draft'",
    ).run(moduleId, ownerUserId);
    if (deleted.changes !== 1) {
      throw new Error("Draft module changed while rollback was in progress.");
    }
    db.query(
      `INSERT INTO module_draft_deletions (module_id, user_id, deleted_at, cleanup_paths_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(module_id) DO UPDATE SET
         user_id = excluded.user_id,
         deleted_at = excluded.deleted_at,
         cleanup_paths_json = excluded.cleanup_paths_json`,
    ).run(moduleId, ownerUserId, nowIso(), JSON.stringify(versions.map((version) => version.bundle_path)));
    return { cleanupPaths: versions.map((version) => version.bundle_path) };
  }).immediate();
}

export function getDraftModuleDeletion(db: Database, moduleId: string, userId: string) {
  const row = db.query(
    "SELECT cleanup_paths_json FROM module_draft_deletions WHERE module_id = ? AND user_id = ?",
  ).get(moduleId, userId) as { cleanup_paths_json: string } | null;
  if (!row) {
    return null;
  }
  const parsed = JSON.parse(row.cleanup_paths_json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Draft module cleanup metadata is invalid.");
  }
  const cleanupPaths: string[] = [];
  for (const value of parsed) {
    if (typeof value !== "string") {
      throw new Error("Draft module cleanup metadata is invalid.");
    }
    cleanupPaths.push(value);
  }
  return { cleanupPaths };
}

export function finishDraftModuleDeletionCleanup(db: Database, moduleId: string, userId: string) {
  db.query(
    "UPDATE module_draft_deletions SET cleanup_paths_json = '[]' WHERE module_id = ? AND user_id = ?",
  ).run(moduleId, userId);
}
