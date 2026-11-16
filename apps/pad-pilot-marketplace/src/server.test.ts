import { z } from "zod";
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCodexGeneratorTimeoutError } from "./codex-generator";
import { processStripeWebhook } from "./billing/billing-webhooks";
import {
  createModule,
  createSession,
  hasActiveModuleEntitlement,
  nowIso,
  openMarketplaceDatabase,
  sha256,
  upsertUserFromClerk,
} from "./db";
import { loadMarketplaceEnv } from "./env";
import { createMarketplaceApp, marketplaceListenOptions } from "./server";
import { resolveContainedFile, serveStatic } from "./static";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      try {
        rmSync(tempRoot, { force: true, recursive: true });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("EBUSY")) {
          throw error;
        }
      }
    }
  }
});

function createRuntime(overrides: {
  isDevelopment?: boolean;
  seedData?: boolean;
  services?: NonNullable<Parameters<typeof createMarketplaceApp>[0]>["services"];
  transferLimits?: NonNullable<Parameters<typeof createMarketplaceApp>[0]>["transferLimits"];
} = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-marketplace-server-"));
  tempRoots.push(tempRoot);

  const uiDistDir = path.join(tempRoot, "ui", "dist");
  const uiPublicDir = path.join(tempRoot, "ui", "public");
  mkdirSync(uiDistDir, { recursive: true });
  mkdirSync(uiPublicDir, { recursive: true });

  const runtimeEnv = {
    ...loadMarketplaceEnv(),
    clerkPublishableKey: "pk_test_fixture",
    clerkSecretKey: "sk_test_fixture",
    dbPath: path.join(tempRoot, "db", "padpilot-server.sqlite"),
    isClerkConfigured: true,
    isDevelopment: overrides.isDevelopment ?? false,
    isStripeConfigured: true,
    maxUploadBytes: 1048576,
    migrationsDir: path.join(process.cwd(), "migrations"),
    port: 3100,
    publicOrigin: "https://marketplace.test",
    stripeSecretKey: "stripe_secret_fixture",
    stripeWebhookSecret: "stripe_webhook_fixture",
    uiDistDir,
    uiIndexFilePath: path.join(uiDistDir, "index.html"),
    uiPublicDir,
    uploadRoot: path.join(tempRoot, "uploads"),
  };
  const db = openMarketplaceDatabase(runtimeEnv);
  const app = createMarketplaceApp({
    db,
    env: runtimeEnv,
    seedData: overrides.seedData ?? false,
    transferLimits: overrides.transferLimits,
    services: {
      cancelStripeSubscription: async (subscriptionId) => ({ alreadyCanceled: false, id: subscriptionId }),
      createStripeCheckoutSession: async (input) => ({
        amountTotal: input.amountCents,
        id: "cs_test_fixture",
        priceId: null,
        url: "https://stripe.test/checkout/cs_test_fixture",
      }),
      processStripeWebhook: () => ({ cancelSubscriptionId: null, duplicate: false, ok: true }),
      runCodexGenerator: async () => "!BPM:120!\n#TRK:Fixture,CH:0,PG:0\n[0,60,90,480]",
      verifyClerkSessionToken: async () => ({
        clerkUserId: "clerk_user_server_test",
        displayName: "Server Test User",
        email: "server@example.com",
        username: "server-test-user",
      }),
      verifyStripeWebhookSignature: () => {},
      ...overrides.services,
    },
  });

  return { app, db, runtimeEnv, tempRoot };
}

async function readJson(response: Response) {
  return z.object({ error: z.object({ code: z.string(), message: z.string() }).optional(), user: z.object({ username: z.string() }).passthrough().optional(), authenticated: z.boolean().optional(), marketplace: z.object({ modules: z.array(z.unknown()) }).passthrough().optional(), module: z.object({ id: z.string(), slug: z.string(), latestPublishedVersion: z.object({ version: z.string() }).passthrough().nullable().optional() }).passthrough().optional(), modules: z.array(z.object({ id: z.string() }).passthrough()).optional(), subscriptionStatus: z.string().optional(), checkoutUrl: z.string().optional(), checkoutId: z.string().optional(), ok: z.boolean().optional(), updateAvailable: z.boolean().optional(), release: z.object({ version: z.string() }).passthrough().optional(), alreadyDeleted: z.boolean().optional(), cleanupPending: z.boolean().optional(), deleted: z.boolean().optional() }).passthrough().parse(await response.json());
}

describe("createMarketplaceApp", () => {
  it("keeps static reads inside the configured UI root and hides dev probes in production", async () => {
    const { app, db, runtimeEnv, tempRoot } = createRuntime();
    const secretPath = path.join(tempRoot, "marketplace-secret.txt");
    await Bun.write(secretPath, "do-not-serve");

    expect(await serveStatic("../../marketplace-secret.txt", runtimeEnv)).toBeNull();
    expect(resolveContainedFile(runtimeEnv.uploadRoot, secretPath)).toBeNull();
    const probeResponse = await app.handle(new Request("http://localhost/api/dev/static-check?path=../../marketplace-secret.txt"));
    expect(probeResponse.status).toBe(404);
    await Bun.write(runtimeEnv.uiIndexFilePath, "<!doctype html><title>PadPilot</title>");
    const rootResponse = await app.handle(new Request("http://localhost/"));
    expect(rootResponse.status).toBe(200);
    expect(await rootResponse.text()).toContain("PadPilot");
    db.close(false);
  });

  it("serves root-relative built assets from the configured UI directory", async () => {
    const { app, db, runtimeEnv } = createRuntime();
    const assetPath = path.join(runtimeEnv.uiDistDir, "main.js");
    await Bun.write(assetPath, "globalThis.__padPilotLoaded = true;");

    expect(resolveContainedFile(runtimeEnv.uiDistDir, "/main.js")).toBe(assetPath);
    const assetResponse = await app.handle(new Request("http://localhost/main.js"));

    expect(assetResponse.status).toBe(200);
    expect(await assetResponse.text()).toContain("__padPilotLoaded");
    db.close(false);
  });

  it("rate limits repeated authentication attempts before remote verification", async () => {
    const { app, db } = createRuntime();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
        body: JSON.stringify({ token: "" }),
        headers: {
          "cf-connecting-ip": `203.0.113.${attempt}`,
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${attempt}`,
        },
        method: "POST",
      }));
      expect(response.status).toBe(400);
    }
    const limited = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
      body: JSON.stringify({ token: "" }),
      headers: {
        "cf-connecting-ip": "203.0.113.250",
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.250",
      },
      method: "POST",
    }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
    db.close(false);
  });

  it("rejects oversized JSON before authentication verification", async () => {
    let verificationCalls = 0;
    const { app, db } = createRuntime({
      services: {
        verifyClerkSessionToken: async () => {
          verificationCalls += 1;
          throw new Error("must not run");
        },
      },
    });
    const response = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
      body: JSON.stringify({ token: "x".repeat(20_000) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    expect(response.status).toBe(413);
    expect(verificationCalls).toBe(0);
    db.close(false);
  });

  it("rejects cookie-authenticated mutations without the exact marketplace origin", async () => {
    const { app, db } = createRuntime();
    const timestamp = nowIso();
    const userId = upsertUserFromClerk(db, {
      clerkUserId: "clerk_csrf_user",
      displayName: "CSRF User",
      email: "csrf@example.com",
      username: "csrf-user",
    }, timestamp);
    const sessionToken = "csrf-session-token";
    createSession(
      db,
      userId,
      sha256(sessionToken),
      new Date(Date.now() + 60_000).toISOString(),
      timestamp,
    );
    const mutation = (origin?: string) => new Request("http://localhost/api/modules", {
      body: JSON.stringify({ name: "Origin Protected Module" }),
      headers: {
        cookie: `pp_session=${sessionToken}`,
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      method: "POST",
    });

    const missing = await app.handle(mutation());
    const crossOrigin = await app.handle(mutation("https://evil.marketplace!.test"));
    const sameOrigin = await app.handle(mutation("https://marketplace.test"));

    expect(missing.status).toBe(403);
    expect((await readJson(missing)).error!.code).toBe("invalid_request_origin");
    expect(crossOrigin.status).toBe(403);
    expect((await readJson(crossOrigin)).error!.code).toBe("invalid_request_origin");
    expect(sameOrigin.status).toBe(201);
    db.close(false);
  });

  it("covers the shipped marketplace HTTP surface through the real app router", async () => {
    const { app, db, runtimeEnv, tempRoot } = createRuntime({
      transferLimits: { downloadGlobal: 1, downloadPerIdentity: 1 },
    });

    const authResponse = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
      body: JSON.stringify({ token: "clerk_session_fixture" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }));
    expect(authResponse.status).toBe(200);
    const authBody = await readJson(authResponse);
    expect(authBody.user!.username).toBe("server-test-user");
    const cookie = authResponse.headers.get("set-cookie");
    expect(cookie).toContain("pp_session=");

    const meResponse = await app.handle(new Request("http://localhost/api/auth/me", {
      headers: { cookie: cookie! },
    }));
    expect(meResponse.status).toBe(200);
    const meBody = await readJson(meResponse);
    expect(meBody.authenticated).toBe(true);

    const bootstrapResponse = await app.handle(new Request("http://localhost/api/bootstrap", {
      headers: { cookie: cookie! },
    }));
    expect(bootstrapResponse.status).toBe(200);
    const bootstrapBody = await readJson(bootstrapResponse);
    expect(Array.isArray(bootstrapBody.marketplace!.modules)).toBe(true);

    const createModuleResponse = await app.handle(new Request("http://localhost/api/modules", {
      body: JSON.stringify({
        description: "Acceptance fixture module",
        name: "Acceptance Fixture",
        priceCents: 1200,
        slug: "acceptance-fixture",
      }),
      headers: {
        cookie: cookie!,
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    }));
    expect(createModuleResponse.status).toBe(201);
    const createdModule = (await readJson(createModuleResponse)).module!;
    expect(createdModule.slug).toBe("acceptance-fixture");

    const uploadForm = new FormData();
    uploadForm.set("version", "1.2.3");
    uploadForm.set("changelog", "Adds acceptance coverage.");
    uploadForm.set("bundle", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "bundle.zip", { type: "application/zip" }));
    const uploadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/versions`, {
      body: uploadForm,
      headers: { cookie: cookie!, origin: "https://marketplace.test" },
      method: "POST",
    }));
    expect(uploadResponse.status).toBe(200);

    const duplicateUploadForm = new FormData();
    duplicateUploadForm.set("version", "1.2.3");
    duplicateUploadForm.set("bundle", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff])], "bundle.zip", { type: "application/zip" }));
    const duplicateUploadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/versions`, {
      body: duplicateUploadForm,
      headers: { cookie: cookie!, origin: "https://marketplace.test" },
      method: "POST",
    }));
    expect(duplicateUploadResponse.status).toBe(409);

    const publishResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/publish`, {
      headers: { cookie: cookie!, origin: "https://marketplace.test" },
      method: "POST",
    }));
    expect(publishResponse.status).toBe(200);

    const detailResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}`));
    expect(detailResponse.status).toBe(200);
    const detailBody = await readJson(detailResponse);
    expect(detailBody.module!.latestPublishedVersion!.version).toBe("1.2.3");

    const downloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`));
    expect(downloadResponse.status).toBe(403);
    expect((await readJson(downloadResponse)).error!.code).toBe("purchase_required");

    const ownerDownloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`, {
      headers: { cookie: cookie! },
    }));
    expect(ownerDownloadResponse.status).toBe(200);
    expect(ownerDownloadResponse.headers.get("content-type")).toBe("application/zip");
    expect((await ownerDownloadResponse.arrayBuffer()).byteLength).toBe(4);

    const heldDownloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`, {
      headers: { cookie: cookie! },
    }));
    expect(heldDownloadResponse.status).toBe(200);
    const blockedDownloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`, {
      headers: { cookie: cookie! },
    }));
    expect(blockedDownloadResponse.status).toBe(503);
    expect((await readJson(blockedDownloadResponse)).error!.code).toBe("transfer_busy");
    await heldDownloadResponse.body?.cancel();
    const resumedDownloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`, {
      headers: { cookie: cookie! },
    }));
    expect(resumedDownloadResponse.status).toBe(200);
    expect((await resumedDownloadResponse.arrayBuffer()).byteLength).toBe(4);

    const storedBundle = z.object({ bundle_path: z.string() }).passthrough().parse(db.query(
      "SELECT bundle_path FROM module_versions WHERE module_id = ?",
    ).get(createdModule.id));
    await Bun.write(storedBundle.bundle_path, new Uint8Array([0x50, 0x4b, 0x05, 0x06]));
    const corruptDownloadResponse = await app.handle(new Request(`http://localhost/api/modules/${createdModule.id}/download`, {
      headers: { cookie: cookie! },
    }));
    expect(corruptDownloadResponse.status).toBe(409);
    expect((await readJson(corruptDownloadResponse)).error!.code).toBe("bundle_checksum_mismatch");

    const accountModulesResponse = await app.handle(new Request("http://localhost/api/account/modules", {
      headers: { cookie: cookie! },
    }));
    expect(accountModulesResponse.status).toBe(200);
    expect((await readJson(accountModulesResponse)).modules!.map((module: { id: string }) => module.id)).toContain(createdModule.id);

    const subscriptionResponse = await app.handle(new Request("http://localhost/api/account/subscription", {
      headers: { cookie: cookie! },
    }));
    expect(subscriptionResponse.status).toBe(200);
    const subscriptionBody = await readJson(subscriptionResponse);
    expect(subscriptionBody.subscriptionStatus).toBe("free");

    const checkoutResponse = await app.handle(new Request("http://localhost/api/checkout/sessions", {
      body: JSON.stringify({ checkoutKind: "padpilot_lifetime_outright" }),
      headers: {
        cookie: cookie!,
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    }));
    expect(checkoutResponse.status).toBe(200);
    const checkoutBody = await readJson(checkoutResponse);
    expect(checkoutBody.checkoutUrl).toBe("https://stripe.test/checkout/cs_test_fixture");

    const webhookResponse = await app.handle(new Request("http://localhost/api/webhooks/stripe", {
      body: JSON.stringify({
        id: "evt_test_fixture",
        type: "checkout.session.completed",
      }),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=fake",
      },
      method: "POST",
    }));
    expect(webhookResponse.status).toBe(200);
    expect((await readJson(webhookResponse)).ok).toBe(true);

    const artifactPath = path.join(tempRoot, "releases", "padpilot-update.zip");
    const manifestPath = path.join(tempRoot, "releases", "padpilot-update-manifest.json");
    mkdirSync(path.dirname(artifactPath), { recursive: true });
    await Bun.write(artifactPath, new Uint8Array([1, 2, 3, 4]));
    await Bun.write(manifestPath, JSON.stringify({ version: "0.1.10" }));
    db.query(
      `INSERT INTO plugin_releases (
        id, channel, version, platform, arch, file_path, checksum_sha256, file_size_bytes, published_at,
        release_notes, artifact_kind, artifact_path, artifact_checksum_sha256, artifact_size_bytes,
        manifest_path, manifest_checksum_sha256, base_version_min, base_version_max, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "release_fixture",
      "stable",
      "0.1.10",
      "windows",
      "x64",
      artifactPath,
      "legacy_sha",
      4,
      "2026-03-24T00:00:00.000Z",
      "Fixture release",
      "directory_patch",
      artifactPath,
      sha256(new Uint8Array([1, 2, 3, 4])),
      4,
      manifestPath,
      sha256(new TextEncoder().encode(JSON.stringify({ version: "0.1.10" }))),
      "0.1.0",
      "0.1.9",
      "sig_fixture",
    );

    const latestResponse = await app.handle(new Request("http://localhost/api/updates/vst3/latest?platform=windows&arch=x64&channel=stable&version=0.1.8"));
    expect(latestResponse.status).toBe(200);
    const latestBody = await readJson(latestResponse);
    expect(latestBody.updateAvailable).toBe(true);
    expect(latestBody.latestVersion).toBe("0.1.10");

    const artifactResponse = await app.handle(new Request("http://localhost/api/updates/vst3/download/release_fixture"));
    expect(artifactResponse.status).toBe(200);
    expect(artifactResponse.headers.get("x-padpilot-sha256")).toBe(
      sha256(new Uint8Array([1, 2, 3, 4])),
    );
    expect((await artifactResponse.arrayBuffer()).byteLength).toBe(4);

    await Bun.write(artifactPath, new Uint8Array([4, 3, 2, 1]));
    const corruptArtifactResponse = await app.handle(
      new Request("http://localhost/api/updates/vst3/download/release_fixture"),
    );
    expect(corruptArtifactResponse.status).toBe(409);
    expect((await readJson(corruptArtifactResponse)).error!.code).toBe("bundle_checksum_mismatch");

    const manifestResponse = await app.handle(new Request("http://localhost/api/updates/vst3/manifest/release_fixture"));
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get("content-type")).toContain("application/json");
    expect((await manifestResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const notFoundResponse = await app.handle(new Request("http://localhost/api/does-not-exist"));
    expect(notFoundResponse.status).toBe(404);
    const notFoundBody = await readJson(notFoundResponse);
    expect(notFoundBody.error!.code).toBe("route_not_found");

    const logoutResponse = await app.handle(new Request("http://localhost/api/auth/logout", {
      headers: { cookie: cookie!, origin: "https://marketplace.test" },
      method: "POST",
    }));
    expect(logoutResponse.status).toBe(200);

    db.close(false);
    expect(runtimeEnv.uploadRoot).toContain(tempRoot);
  });

  it("rolls back a failed draft upload flow so its slug and files can be retried", async () => {
    const { app, db } = createRuntime();
    const authResponse = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
      body: JSON.stringify({ token: "draft-rollback-user" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    const cookie = authResponse.headers.get("set-cookie")!;
    const createRequest = () => new Request("http://localhost/api/modules", {
      body: JSON.stringify({ name: "Rollback Fixture", slug: "rollback-fixture" }),
      headers: { cookie, "content-type": "application/json", origin: "https://marketplace.test" },
      method: "POST",
    });
    const moduleResponse = await app.handle(createRequest());
    const moduleId = z.string().parse((await readJson(moduleResponse)).module!.id);
    const prematurePublish = await app.handle(new Request(`http://localhost/api/modules/${moduleId}/publish`, {
      headers: { cookie, origin: "https://marketplace.test" },
      method: "POST",
    }));
    expect(prematurePublish.status).toBe(409);
    expect((await readJson(prematurePublish)).error!.code).toBe("version_required");
    const upload = new FormData();
    upload.set("version", "1.0.0");
    upload.set("bundle", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "bundle.zip"));
    expect((await app.handle(new Request(`http://localhost/api/modules/${moduleId}/versions`, {
      body: upload,
      headers: { cookie, origin: "https://marketplace.test" },
      method: "POST",
    }))).status).toBe(200);
    const stored = z.object({ bundle_path: z.string() }).passthrough().parse(db.query("SELECT bundle_path FROM module_versions WHERE module_id = ?").get(moduleId));
    expect(existsSync(stored.bundle_path)).toBe(true);

    const deleted = await app.handle(new Request(`http://localhost/api/modules/${moduleId}`, {
      headers: { cookie, origin: "https://marketplace.test" },
      method: "DELETE",
    }));
    expect(deleted.status).toBe(200);
    expect(existsSync(stored.bundle_path)).toBe(false);
    const deleteRetry = await app.handle(new Request(`http://localhost/api/modules/${moduleId}`, {
      headers: { cookie, origin: "https://marketplace.test" },
      method: "DELETE",
    }));
    expect(deleteRetry.status).toBe(200);
    expect((await readJson(deleteRetry)).alreadyDeleted).toBe(true);
    expect((await app.handle(createRequest())).status).toBe(201);
    db.close(false);
  });

  it("persists failed draft file cleanup and completes it on a delete retry", async () => {
    let removalAttempts = 0;
    const { app, db } = createRuntime({
      services: {
        removeDirectory: (directory) => {
          removalAttempts += 1;
          if (removalAttempts === 1) {
            throw new Error("injected cleanup failure");
          }
          rmSync(directory, { force: true, recursive: true });
        },
      },
    });
    const authResponse = await app.handle(new Request("http://localhost/api/auth/clerk/exchange", {
      body: JSON.stringify({ token: "draft-cleanup-retry-user" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    const cookie = authResponse.headers.get("set-cookie")!;
    const moduleResponse = await app.handle(new Request("http://localhost/api/modules", {
      body: JSON.stringify({ name: "Cleanup Retry Fixture", slug: "cleanup-retry-fixture" }),
      headers: { cookie, "content-type": "application/json", origin: "https://marketplace.test" },
      method: "POST",
    }));
    const moduleId = z.string().parse((await readJson(moduleResponse)).module!.id);
    const upload = new FormData();
    upload.set("version", "1.0.0");
    upload.set("bundle", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "bundle.zip"));
    expect((await app.handle(new Request(`http://localhost/api/modules/${moduleId}/versions`, {
      body: upload,
      headers: { cookie, origin: "https://marketplace.test" },
      method: "POST",
    }))).status).toBe(200);
    const stored = z.object({ bundle_path: z.string() }).passthrough().parse(db.query("SELECT bundle_path FROM module_versions WHERE module_id = ?").get(moduleId));

    const firstDelete = await app.handle(new Request(`http://localhost/api/modules/${moduleId}`, {
      headers: { cookie, origin: "https://marketplace.test" },
      method: "DELETE",
    }));
    expect(firstDelete.status).toBe(200);
    expect((await readJson(firstDelete)).cleanupPending).toBe(true);
    expect(existsSync(stored.bundle_path)).toBe(true);
    const pending = z.object({ cleanup_paths_json: z.string() }).passthrough().parse(db.query(
      "SELECT cleanup_paths_json FROM module_draft_deletions WHERE module_id = ?",
    ).get(moduleId));
    expect(JSON.parse(pending.cleanup_paths_json)).toEqual([stored.bundle_path]);

    const retry = await app.handle(new Request(`http://localhost/api/modules/${moduleId}`, {
      headers: { cookie, origin: "https://marketplace.test" },
      method: "DELETE",
    }));
    const retryBody = await readJson(retry);
    expect(retry.status).toBe(200);
    expect(retryBody.alreadyDeleted).toBe(true);
    expect(retryBody.cleanupPending).toBe(false);
    expect(existsSync(stored.bundle_path)).toBe(false);
    const completed = z.object({ cleanup_paths_json: z.string() }).passthrough().parse(db.query(
      "SELECT cleanup_paths_json FROM module_draft_deletions WHERE module_id = ?",
    ).get(moduleId));
    expect(JSON.parse(completed.cleanup_paths_json)).toEqual([]);
    db.close(false);
  });

  it("reuses one live module Checkout and grants then revokes its entitlement from webhooks", async () => {
    const checkoutCalls: Array<{ checkoutId: string; orderId?: string }> = [];
    const { app, db, runtimeEnv } = createRuntime({
      services: {
        createStripeCheckoutSession: async (input) => {
          checkoutCalls.push({ checkoutId: input.checkoutId, orderId: input.orderId });
          return {
            amountTotal: input.amountCents,
            id: "cs_module_server",
            priceId: null,
            url: "https://stripe.test/checkout/cs_module_server",
          };
        },
        processStripeWebhook,
      },
    });
    const timestamp = nowIso();
    const sellerId = upsertUserFromClerk(db, {
      clerkUserId: "clerk_module_seller",
      displayName: "Seller",
      email: "seller@example.com",
      username: "seller",
    }, timestamp);
    const buyerId = upsertUserFromClerk(db, {
      clerkUserId: "clerk_module_buyer",
      displayName: "Buyer",
      email: "buyer@example.com",
      username: "buyer",
    }, timestamp);
    createModule(db, "module_server_purchase", sellerId, "server-purchase", "Server Purchase", "", 1200, timestamp);
    db.query("UPDATE modules SET visibility = 'published' WHERE id = ?").run("module_server_purchase");
    const sessionToken = "buyer-session-token";
    createSession(
      db,
      buyerId,
      sha256(sessionToken),
      new Date(Date.now() + 60_000).toISOString(),
      timestamp,
    );
    const checkoutRequest = () => new Request("http://localhost/api/checkout/sessions", {
      body: JSON.stringify({ checkoutKind: "module_purchase", moduleId: "module_server_purchase" }),
      headers: {
        cookie: `pp_session=${sessionToken}`,
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    });
    const first = await app.handle(checkoutRequest());
    const retry = await app.handle(checkoutRequest());
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await readJson(retry)).checkoutId).toBe((await readJson(first)).checkoutId);
    expect(checkoutCalls).toHaveLength(1);

    const checkout = z.object({ id: z.string(), order_id: z.string() }).passthrough().parse(db.query(
      "SELECT id, order_id FROM billing_checkouts WHERE stripe_checkout_session_id = ?",
    ).get("cs_module_server"));
    const completedEvent = {
      id: "evt_module_server_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_module_server",
          amount_total: 1200,
          created: 1774094400,
          currency: "usd",
          customer: "cus_module_server",
          metadata: {
            checkout_id: checkout.id,
            checkout_kind: "module_purchase",
            order_id: checkout.order_id,
            user_id: buyerId,
          },
          payment_intent: "pi_module_server",
          payment_status: "paid",
          subscription: null,
        },
      },
    };
    const webhook = await app.handle(new Request("http://localhost/api/webhooks/stripe", {
      body: JSON.stringify(completedEvent),
      headers: { "content-type": "application/json", "stripe-signature": "fixture" },
      method: "POST",
    }));
    expect(webhook.status).toBe(200);
    expect(hasActiveModuleEntitlement(db, "module_server_purchase", buyerId)).toBe(true);

    const refundedEvent = {
      id: "evt_module_server_refunded",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_module_server",
          amount: 1200,
          amount_refunded: 1200,
          created: 1774094500,
          currency: "usd",
          payment_intent: "pi_module_server",
        },
      },
    };
    const refunded = await app.handle(new Request("http://localhost/api/webhooks/stripe", {
      body: JSON.stringify(refundedEvent),
      headers: { "content-type": "application/json", "stripe-signature": "fixture" },
      method: "POST",
    }));
    expect(refunded.status).toBe(200);
    expect(hasActiveModuleEntitlement(db, "module_server_purchase", buyerId)).toBe(false);
    expect(runtimeEnv.publicOrigin).toBe("https://marketplace.test");
    db.close(false);
  });
});

describe("development Codex generator route", () => {
  it("binds development to loopback and seeds the configured upload root", () => {
    const { db, runtimeEnv } = createRuntime({ isDevelopment: true, seedData: true });
    expect(marketplaceListenOptions(runtimeEnv)).toEqual({ hostname: "127.0.0.1", port: 3100 });
    const seeded = z.union([z.object({ bundle_path: z.string() }).passthrough(), z.null()]).parse(db.query(
      "SELECT bundle_path FROM module_versions WHERE version = '1.0.0' ORDER BY created_at LIMIT 1",
    ).get());
    expect(seeded?.bundle_path.startsWith(runtimeEnv.uploadRoot)).toBe(true);
    expect(existsSync(seeded?.bundle_path ?? "")).toBe(true);
    db.close(false);
  });

  it("runs the injectable Codex generator service in development only", async () => {
    const calls: Array<{ model?: string; prompt: string; provider?: string; responseSchema?: unknown; responseSchemaName?: string; system: string }> = [];
    const { app, db } = createRuntime({
      isDevelopment: true,
      services: {
        runCodexGenerator: async (input) => {
          calls.push(input);
          return "!BPM:96!\n#TRK:Mock Keys,CH:0,PG:4\n[0,60,90,480]";
        },
      },
    });

    const response = await app.handle(new Request("http://localhost/api/dev/generator/codex", {
      body: JSON.stringify({
        model: "5.5 low fast",
        prompt: "Genre: Lofi",
        provider: "cursor",
        responseSchema: { properties: { tracker: { type: "string" } }, type: "object" },
        responseSchemaName: "generator-model-envelope-v1",
        system: "Return tracker text.",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      response: "!BPM:96!\n#TRK:Mock Keys,CH:0,PG:4\n[0,60,90,480]",
      source: "codex-cli",
    });
    expect(calls).toEqual([{
      model: "5.5 low fast",
      prompt: "Genre: Lofi",
      provider: "cursor",
      responseSchema: { properties: { tracker: { type: "string" } }, type: "object" },
      responseSchemaName: "generator-model-envelope-v1",
      system: "Return tracker text.",
    }]);
    db.close(false);
  });

  it("returns Codex CLI diagnostics when generation fails", async () => {
    const { app, db } = createRuntime({
      isDevelopment: true,
      services: {
        runCodexGenerator: async () => {
          throw new Error("Codex CLI exited with 1.\nCommand: codex exec <prompt>\nstderr:\nunexpected argument '--ask-for-approval'");
        },
      },
    });

    const response = await app.handle(new Request("http://localhost/api/dev/generator/codex", {
      body: JSON.stringify({
        model: "5.5 low fast",
        prompt: "Genre: Lofi",
        provider: "cursor",
        system: "Return tracker text.",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    }));

    const body = await readJson(response);
    expect(response.status).toBe(502);
    expect(body.error!.code).toBe("codex_generator_failed");
    expect(body.error!.message).toContain("Codex CLI exited with 1.");
    expect(body.error!.message).toContain("unexpected argument '--ask-for-approval'");
    db.close(false);
  });

  it("returns a gateway timeout when Codex generation exceeds the dev timeout", async () => {
    const { app, db } = createRuntime({
      isDevelopment: true,
      services: {
        runCodexGenerator: async () => {
          throw createCodexGeneratorTimeoutError("Codex CLI generation timed out after 300s.");
        },
      },
    });

    const response = await app.handle(new Request("http://localhost/api/dev/generator/codex", {
      body: JSON.stringify({
        model: "5.5 low fast",
        prompt: "Genre: Lofi",
        provider: "cursor",
        system: "Return tracker text.",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://marketplace.test",
      },
      method: "POST",
    }));

    const body = await readJson(response);
    expect(response.status).toBe(504);
    expect(body.error!.code).toBe("codex_generator_timeout");
    expect(body.error!.message).toContain("timed out after 300s");
    db.close(false);
  });

  it("rejects non-loopback or cross-origin generator requests before invoking Codex", async () => {
    let calls = 0;
    const { app, db } = createRuntime({
      isDevelopment: true,
      services: {
        runCodexGenerator: async () => {
          calls += 1;
          return "must-not-run";
        },
      },
    });
    const body = JSON.stringify({ prompt: "Genre: Lofi", system: "Return tracker text." });
    const remote = await app.handle(new Request("http://192.0.2.10/api/dev/generator/codex", {
      body,
      headers: { "content-type": "application/json", origin: "https://marketplace.test" },
      method: "POST",
    }));
    const crossOrigin = await app.handle(new Request("http://localhost/api/dev/generator/codex", {
      body,
      headers: { "content-type": "application/json", origin: "https://attacker.test" },
      method: "POST",
    }));
    expect(remote.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(calls).toBe(0);
    db.close(false);
  });

  it("holds the per-client generator permit until the process completes", async () => {
    let signalStarted = () => {};
    let releaseProcess = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const processGate = new Promise<void>((resolve) => {
      releaseProcess = resolve;
    });
    const { app, db } = createRuntime({
      isDevelopment: true,
      services: {
        runCodexGenerator: async () => {
          signalStarted();
          await processGate;
          return "!BPM:120!";
        },
      },
    });
    const request = () => new Request("http://localhost/api/dev/generator/codex", {
      body: JSON.stringify({ prompt: "Genre: Lofi", system: "Return tracker text." }),
      headers: { "content-type": "application/json", origin: "https://marketplace.test" },
      method: "POST",
    });
    const first = app.handle(request());
    await started;
    const busy = await app.handle(request());
    expect(busy.status).toBe(503);
    expect((await readJson(busy)).error!.code).toBe("dev_generator_busy");
    releaseProcess();
    expect((await first).status).toBe(200);
    db.close(false);
  });
});
