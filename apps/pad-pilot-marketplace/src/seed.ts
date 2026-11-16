import { z } from "zod";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { marketplaceEnv as env, type MarketplaceEnv } from "./env";
import { getModuleById, nowIso, sha256, upsertUserFromClerk } from "./db";
import { toSafeNameComponent } from "./safe-name";

function sameFileIdentity(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function ensureSeedBundle(bundlePath: string, expectedBytes: Buffer) {
  let currentDescriptor: number | null = null;
  try {
    try {
      const pathStats = lstatSync(bundlePath);
      if (!pathStats.isFile() || pathStats.isSymbolicLink() || pathStats.nlink !== 1) {
        throw new Error("Development seed bundle path must be a regular, unlinked file.");
      }
      if (pathStats.size === expectedBytes.byteLength) {
        currentDescriptor = openSync(bundlePath, "r");
        const openedStats = fstatSync(currentDescriptor);
        if (!openedStats.isFile() || openedStats.nlink !== 1 || !sameFileIdentity(pathStats, openedStats)) {
          throw new Error("Development seed bundle changed while it was being opened.");
        }
        const currentBytes = Buffer.alloc(expectedBytes.byteLength);
        const bytesRead = readSync(currentDescriptor, currentBytes, 0, currentBytes.byteLength, 0);
        const finalStats = fstatSync(currentDescriptor);
        const finalPathStats = lstatSync(bundlePath);
        if (bytesRead === currentBytes.byteLength && currentBytes.equals(expectedBytes)
            && finalStats.size === openedStats.size
            && finalPathStats.isFile()
            && !finalPathStats.isSymbolicLink()
            && finalPathStats.nlink === 1
            && sameFileIdentity(finalPathStats, finalStats)) {
          return;
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  } finally {
    if (currentDescriptor !== null) {
      closeSync(currentDescriptor);
    }
  }

  const temporaryPath = `${bundlePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
  let temporaryDescriptor: number | null = null;
  try {
    temporaryDescriptor = openSync(temporaryPath, "wx");
    let offset = 0;
    while (offset < expectedBytes.byteLength) {
      const bytesWritten = writeSync(
        temporaryDescriptor,
        expectedBytes,
        offset,
        expectedBytes.byteLength - offset,
        offset,
      );
      if (bytesWritten <= 0) {
        throw new Error("Development seed bundle could not be written completely.");
      }
      offset += bytesWritten;
    }
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor);
    temporaryDescriptor = null;
    renameSync(temporaryPath, bundlePath);
  } finally {
    if (temporaryDescriptor !== null) {
      closeSync(temporaryDescriptor);
    }
    rmSync(temporaryPath, { force: true });
  }
}

/**
 * Ensures seed data exists: padpilot/cinematic-impact module with 1.0.0 version.
 * Creates user, module, and version if they do not exist.
 *
 * @param db - Database instance
 */
export function ensureSeedData(db: Database, runtimeEnv: MarketplaceEnv = env) {
  const timestamp = nowIso();
  const version = "1.0.0";
  const ownerSlug = "padpilot";
  const moduleSlug = "cinematic-impact";
  const seedRoot = join(runtimeEnv.uploadRoot, ownerSlug, moduleSlug, toSafeNameComponent(version));
  const bundlePath = join(seedRoot, "bundle.zip");
  const bundleBytes = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64");

  const seedModuleId = db.transaction(() => {
    const seedUserId = upsertUserFromClerk(db, {
      clerkUserId: "seed-user",
      displayName: "PadPilot Dev",
      email: "dev@padpilot.local",
      username: ownerSlug,
    }, timestamp);

    let seedModule = z.union([z.object({ id: z.string(), owner_user_id: z.string() }).passthrough(), z.null()]).parse(db.query("SELECT id, owner_user_id FROM modules WHERE slug = ?").get(moduleSlug));
    if (seedModule && seedModule.owner_user_id !== seedUserId) {
      throw new Error("Development seed slug is already owned by another account.");
    }
    if (!seedModule) {
      const moduleId = crypto.randomUUID();
      db.query(
        "INSERT INTO modules (id, owner_user_id, slug, name, description, price_cents, currency, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'usd', 'published', ?, ?)",
      ).run(
        moduleId,
        seedUserId,
        moduleSlug,
        "Cinematic Impact",
        "Seed marketplace module for browser-first development.",
        timestamp,
        timestamp,
      );
      seedModule = getModuleById(db, moduleId);
    }

    return seedModule!.id;
  }).immediate();

  mkdirSync(seedRoot, { recursive: true });
  ensureSeedBundle(bundlePath, bundleBytes);

  db.transaction(() => {
    const seedModule = z.union([z.object({ id: z.string(), owner_user_id: z.string() }).passthrough(), z.null()]).parse(db.query("SELECT id, owner_user_id FROM modules WHERE id = ?").get(seedModuleId));
    if (!seedModule) {
      throw new Error("Development seed module disappeared before its bundle was registered.");
    }
    const existingVersion = z.union([z.object({ id: z.string() }).passthrough(), z.null()]).parse(db
      .query("SELECT id FROM module_versions WHERE module_id = ? AND version = ?")
      .get(seedModule.id, version));
    if (!existingVersion) {
      db.query(
        "INSERT INTO module_versions (id, module_id, version, changelog, manifest_json, bundle_path, checksum_sha256, file_size_bytes, status, created_at, published_at) VALUES (?, ?, ?, '', '{}', ?, ?, ?, 'published', ?, ?)",
      ).run(
        crypto.randomUUID(),
        seedModule.id,
        version,
        bundlePath,
        sha256(bundleBytes),
        bundleBytes.byteLength,
        timestamp,
        timestamp,
      );
      db.query("UPDATE modules SET visibility = 'published', updated_at = ? WHERE id = ?").run(
        timestamp,
        seedModule.id,
      );
    }
  }).immediate();
}
