import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSession,
  openMarketplaceDatabase,
  sha256,
  upsertUserFromClerk,
} from "../db";
import { loadMarketplaceEnv } from "../env";
import { cookies, refreshSessionIfNeeded } from "./session";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
});

describe("cookies", () => {
  it("ignores malformed encoding and keeps the first duplicate cookie", () => {
    const parsed = cookies(new Request("http://localhost", {
      headers: { cookie: "broken=%E0%A4%A; pp_session=first; pp_session=second" },
    }));
    expect(parsed.has("broken")).toBe(false);
    expect(parsed.get("pp_session")).toBe("first");
  });
});

function createTestDb() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-session-"));
  tempRoots.push(tempRoot);
  return openMarketplaceDatabase({
    ...loadMarketplaceEnv(),
    dbPath: path.join(tempRoot, "db", "padpilot-session.sqlite"),
    uploadRoot: path.join(tempRoot, "uploads"),
  });
}

describe("refreshSessionIfNeeded", () => {
  it("refreshes a near-expiry session cookie to the sliding ttl window", () => {
    const db = createTestDb();
    const now = new Date("2026-03-21T12:00:00.000Z");
    const userId = upsertUserFromClerk(db, {
      clerkUserId: "clerk_user_session",
      displayName: "Session User",
      email: "session@example.com",
      username: "session-user",
    }, now.toISOString());

    const sessionToken = "session-token";
    createSession(
      db,
      userId,
      sha256(sessionToken),
      new Date(Date.now() + 3600000).toISOString(),
      now.toISOString(),
    );

    const refreshed = refreshSessionIfNeeded(new Request("http://localhost/api/bootstrap", {
      headers: {
        cookie: `pp_session=${sessionToken}`,
      },
    }), db);

    expect(refreshed).toContain("pp_session=session-token");
    expect(refreshed).toContain("HttpOnly");
    db.close(false);
  });
});
