import { z } from "zod";
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModule, nowIso, openMarketplaceDatabase, upsertUserFromClerk } from "./db";
import { loadMarketplaceEnv } from "./env";
import { ensureSeedData } from "./seed";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
});

describe("ensureSeedData", () => {
  it("writes the seed bundle into the configured module upload root", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-seed-"));
    tempRoots.push(tempRoot);

    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-seed.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };

    const db = openMarketplaceDatabase(runtimeEnv);
    ensureSeedData(db, runtimeEnv);

    const versionRow = z.union([z.object({ bundle_path: z.string() }).passthrough(), z.null()]).parse(db.query("SELECT bundle_path FROM module_versions LIMIT 1").get());

    expect(versionRow).not.toBeNull();
    expect(versionRow?.bundle_path.startsWith(runtimeEnv.uploadRoot)).toBe(true);
    expect(existsSync(versionRow!.bundle_path)).toBe(true);
    expect(versionRow?.bundle_path).toContain(path.join("module-uploads", "padpilot", "cinematic-impact", "1.0.0", "bundle.zip"));

    db.close(false);
  });

  it("replaces an oversized sparse seed bundle without reading it wholesale", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-seed-"));
    tempRoots.push(tempRoot);

    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-seed.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };
    const bundlePath = path.join(
      runtimeEnv.uploadRoot,
      "padpilot",
      "cinematic-impact",
      "1.0.0",
      "bundle.zip",
    );
    mkdirSync(path.dirname(bundlePath), { recursive: true });
    writeFileSync(bundlePath, "");
    truncateSync(bundlePath, 536870912);

    const db = openMarketplaceDatabase(runtimeEnv);
    ensureSeedData(db, runtimeEnv);

    expect(statSync(bundlePath).size).toBe(22);
    db.close(false);
  });

  it("does not touch an existing bundle when the seed slug belongs to another account", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-seed-conflict-"));
    tempRoots.push(tempRoot);
    const runtimeEnv = {
      ...loadMarketplaceEnv(),
      dbPath: path.join(tempRoot, "db", "padpilot-seed.sqlite"),
      uploadRoot: path.join(tempRoot, "module-uploads"),
    };
    const bundlePath = path.join(
      runtimeEnv.uploadRoot,
      "padpilot",
      "cinematic-impact",
      "1.0.0",
      "bundle.zip",
    );
    mkdirSync(path.dirname(bundlePath), { recursive: true });
    writeFileSync(bundlePath, "do-not-overwrite");
    const db = openMarketplaceDatabase(runtimeEnv);
    const timestamp = nowIso();
    const otherUserId = upsertUserFromClerk(db, {
      clerkUserId: "seed-conflict-owner",
      displayName: "Seed Conflict Owner",
      email: "seed-conflict@example.com",
      username: "seed-conflict-owner",
    }, timestamp);
    createModule(
      db,
      "seed-conflict-module",
      otherUserId,
      "cinematic-impact",
      "Conflicting Module",
      "",
      0,
      timestamp,
    );

    expect(() => ensureSeedData(db, runtimeEnv)).toThrow("already owned by another account");
    expect(readFileSync(bundlePath, "utf8")).toBe("do-not-overwrite");
    expect(db.query("SELECT 1 FROM users WHERE clerk_user_id = 'seed-user'").get()).toBeNull();
    db.close(false);
  });
});
