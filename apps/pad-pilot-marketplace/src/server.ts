/**
 * Marketplace HTTP server: Elysia router delegating to db, session, modules, static, and auth helpers.
 * Serves API routes, WebSocket for ui-update, and static UI assets.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { Elysia } from "elysia";
import { z } from "zod";
import { authDto, subscriptionDto } from "./account";
import { verifyClerkSessionToken } from "./auth";
import { processStripeWebhook } from "./billing-webhooks";
import {
  CodexGeneratorOutputLimitError,
  CodexGeneratorTimeoutError,
  runCodexGenerator,
} from "./codex-generator";
import {
  createBillingCheckout,
  createModuleOrder,
  createModule,
  createModuleVersion,
  createSession,
  deleteDraftModule,
  deleteSessionsByUserId,
  deleteSessionByTokenHash,
  describeMigrationRun,
  finishDraftModuleDeletionCleanup,
  findActiveBillingCheckoutByScope,
  getDraftModuleDeletion,
  getLatestAccessibleVersion,
  getLatestDraftVersion,
  getLatestPluginRelease,
  getLatestPublishedVersion,
  getModuleById,
  getOrderById,
  getPluginReleaseById,
  isMigrationRequested,
  listModulesForUser,
  nowIso,
  openMarketplaceDatabase,
  publishModule,
  sha256,
  updateModuleTimestamp,
  updateBillingCheckoutSession,
  updateBillingCheckoutStatusById,
  updateModuleOrder,
  upsertUserFromClerk,
} from "./db";
import { marketplaceEnv as env, type MarketplaceEnv } from "./env";
import {
  canDownloadModule,
  canViewModule,
  effectiveModulePriceCents,
  moduleDetailDto,
  moduleListDto,
} from "./modules";
import { apiError, fail, isApiPath, json } from "./responses";
import { createRateLimiter } from "./rate-limit";
import {
  BundleIntegrityError,
  createBundleIntegrityVerifier,
  createInFlightLimiter,
  createPermitBoundFileStream,
  type ModuleTransferLimits,
  MultipartUploadError,
  normalizeModuleTransferLimits,
  streamModuleUploadToFile,
} from "./module-transfer";
import { ensureSeedData } from "./seed";
import { clearSessionCookie, cookies, makeCookieHeader, refreshSessionIfNeeded, userFromRequest } from "./session";
import { resolveContainedFile, serveStatic, staticCheckResponse } from "./static";
import {
  cancelStripeSubscription,
  createStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from "./stripe";
import { toSafeNameComponent } from "./safe-name";
import {
  clerkExchangeBody,
  createCheckoutSessionBody,
  createModuleBody,
  latestPluginUpdateQuery,
  moduleIdParams,
  semanticVersion,
  staticCheckQuery,
} from "@hyperfocus/pad-pilot/marketplace-schema";
import {
  cleanupDraftModuleFiles,
  existingRegularFile,
  marketplaceListenOptions,
  maxMultipartOverheadBytes,
  maxPluginUpdateArtifactBytes,
  maxStripeWebhookBytes,
  readBoundedBody,
  readBoundedJson,
  rejectCrossOriginCookieMutation,
  rejectUnsafeDevelopmentRequest,
  requireAuthUser,
  withTimeout,
} from "./server-utils";

export { marketplaceListenOptions } from "./server-utils";

const defaultServices = {
  cancelStripeSubscription,
  createStripeCheckoutSession,
  processStripeWebhook,
  removeDirectory: (directory: string) => rmSync(directory, { force: true, recursive: true }),
  runCodexGenerator,
  verifyClerkSessionToken,
  verifyStripeWebhookSignature,
};

const codexGeneratorBody = z.object({
  model: z.string().max(80).optional(),
  prompt: z.string().min(1).max(16_000),
  provider: z.string().max(40).optional(),
  responseSchema: z.unknown().optional(),
  responseSchemaName: z.string().max(120).optional(),
  system: z.string().min(1).max(8_000),
});

export function createMarketplaceApp(options: {
  db?: Database;
  env?: MarketplaceEnv;
  seedData?: boolean;
  services?: Partial<typeof defaultServices>;
  transferLimits?: Partial<ModuleTransferLimits>;
} = {}) {
  const runtimeEnv = options.env ?? env;
  const runtimeDb = options.db ?? openMarketplaceDatabase(runtimeEnv);
  if (options.seedData ?? runtimeEnv.isDevelopment) {
    ensureSeedData(runtimeDb, runtimeEnv);
  }
  const services = {
    ...defaultServices,
    ...options.services,
  };
  const rateLimiter = createRateLimiter();
  const transferLimits = normalizeModuleTransferLimits(options.transferLimits);
  const uploadLimiter = createInFlightLimiter(
    transferLimits.uploadGlobal,
    transferLimits.uploadPerIdentity,
  );
  const downloadLimiter = createInFlightLimiter(
    transferLimits.downloadGlobal,
    transferLimits.downloadPerIdentity,
  );
  const generatorLimiter = createInFlightLimiter(2, 1);
  const bundleIntegrity = createBundleIntegrityVerifier();
  const transferBusyResponse = () => json(
    { error: { code: "transfer_busy", message: "Too many file transfers are active. Try again shortly." } },
    { headers: { "retry-after": "1" }, status: 503 },
  );
  const clientIdentity = (request: Request) => {
    if (runtimeEnv.trustProxy) {
      const forwardedAddress = request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
      if (forwardedAddress) {
        return sha256(forwardedAddress);
      }
    }
    const directAddress = app.server?.requestIP(request)?.address;
    if (directAddress) {
      return sha256(directAddress);
    }
    return "unknown-client";
  };
  const enforceRateLimit = (
    scope: string,
    identity: string,
    limit: number,
    windowMs: number,
  ) => {
    const globalResult = rateLimiter.consumeGlobal(`${scope}-global`, {
      limit: limit * 100,
      windowMs,
    });
    const result = rateLimiter.consume(scope, identity, { limit, windowMs });
    const blocked = globalResult.allowed ? result : globalResult;
    return globalResult.allowed && result.allowed
      ? null
      : json(
          { error: { code: "rate_limited", message: "Too many requests. Try again later." } },
          {
            headers: { "retry-after": `${blocked.retryAfterSeconds}` },
            status: 429,
          },
        );
  };

  const app = new Elysia()
    .state("db", runtimeDb)
    .state("env", runtimeEnv)
    .state("services", services)
    .derive(({ request, store }) => ({
      authUser: isApiPath(new URL(request.url).pathname) ? userFromRequest(request, store.db) : null,
    }))
    .onBeforeHandle(({ request, store }) => {
      const rejection = rejectCrossOriginCookieMutation(request, store.env);
      if (rejection) {
        return rejection;
      }
    })
    .onError(({ code, error, request, set }) => {
      const pathname = new URL(request.url).pathname;
      if (!isApiPath(pathname)) {
        return;
      }

      if (code === "NOT_FOUND") {
        return fail(404, "route_not_found", "API route not found.");
      }

      if (code === "PARSE") {
        return apiError(400, "invalid_request", error, "The request body could not be parsed.");
      }

      if (code === "VALIDATION") {
        const status = typeof set.status === "number" && set.status >= 400 ? set.status : 422;
        return apiError(status, "invalid_request", error, "The request payload was invalid.");
      }

      if (typeof code === "number" && code >= 400) {
        if (code >= 500) {
          console.error(`[marketplace] ${request.method} ${pathname}`, error);
          return fail(500, "internal_error", "The API request failed unexpectedly.");
        }
        return apiError(code, "request_failed", error, "The API request failed.");
      }

      console.error(`[marketplace] ${request.method} ${pathname}`, error);
      return fail(500, "internal_error", "The API request failed unexpectedly.");
    })
    .post(
      "/api/auth/clerk/exchange",
      async ({ request, store }) => {
        const limited = enforceRateLimit("auth-exchange", clientIdentity(request), 20, 10 * 60 * 1000);
        if (limited) return limited;
        if (!store.env.isClerkConfigured) {
          return fail(503, "clerk_not_configured", "Clerk is not configured for this environment.");
        }
        const requestBody = await readBoundedJson(request, 16 * 1024);
        if (requestBody.response) return requestBody.response;
        const parsed = clerkExchangeBody.safeParse(requestBody.data);
        if (!parsed.success) {
          return fail(400, "missing_token", "A Clerk session token is required.");
        }
        try {
          const identity = await withTimeout(
            store.services.verifyClerkSessionToken(parsed.data.token, store.env),
            15_000,
            "Clerk session verification timed out.",
          );
          const timestamp = nowIso();
          const userId = upsertUserFromClerk(store.db, identity, timestamp);
          const sessionToken = crypto.randomUUID() + crypto.randomUUID();
          const expiresAt = new Date(
            Date.now() + store.env.sessionTtlHours * 60 * 60 * 1000,
          ).toISOString();
          store.db.transaction(() => {
            deleteSessionsByUserId(store.db, userId);
            createSession(store.db, userId, sha256(sessionToken), expiresAt, timestamp);
          }).immediate();
          return json(
            {
              ok: true,
              user: {
                clerkUserId: identity.clerkUserId,
                displayName: identity.displayName,
                email: identity.email,
                id: userId,
                username: identity.username,
              },
            },
            { headers: { "set-cookie": makeCookieHeader(sessionToken, expiresAt, store.env) } },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Clerk session token verification failed.";
          return fail(401, "invalid_clerk_token", message);
        }
      },
      {
        parse: "none",
      },
    )
    .post("/api/auth/logout", ({ request, store }) => {
      const token = cookies(request).get("pp_session");
      if (token) {
        deleteSessionByTokenHash(store.db, sha256(token));
      }
      return json(
        { ok: true },
        { headers: { "set-cookie": clearSessionCookie(store.env) } },
      );
    })
    .get("/api/auth/me", ({ request, store, authUser }) => {
      const refreshedCookie = refreshSessionIfNeeded(request, store.db, store.env);
      return json(authDto(store.db, authUser, store.env), refreshedCookie ? { headers: { "set-cookie": refreshedCookie } } : undefined);
    })
    .get("/api/bootstrap", ({ request, store, authUser }) => {
      const refreshedCookie = refreshSessionIfNeeded(request, store.db, store.env);
      return json({
        auth: authDto(store.db, authUser, store.env),
        capabilities: {
          browserDownloadsOnly: true,
          nativeModuleInstallation: false,
        },
        marketplace: {
          modules: listModulesForUser(store.db, authUser).map((row) =>
            moduleListDto(store.db, row, authUser, store.env.firstClassDiscountPercent),
          ),
        },
        updates: { latest: null },
      }, refreshedCookie ? { headers: { "set-cookie": refreshedCookie } } : undefined);
    })
    .get("/api/modules", ({ store, authUser }) =>
      json({
        modules: listModulesForUser(store.db, authUser).map((row) =>
          moduleListDto(store.db, row, authUser, store.env.firstClassDiscountPercent),
        ),
      }),
    )
    .get(
      "/api/modules/:moduleId",
      ({ params, store, authUser }) => {
        const parsed = moduleIdParams.safeParse(params);
        const moduleId = parsed.success ? parsed.data.moduleId : "";
        const moduleRow = getModuleById(store.db, moduleId);
        if (!canViewModule(authUser, moduleRow)) {
          return fail(404, "module_not_found", "Module not found.");
        }
        return json({ module: moduleDetailDto(store.db, moduleRow!, authUser, store.env.firstClassDiscountPercent) });
      },
      {
        params: moduleIdParams,
      },
    )
    .post(
      "/api/modules",
      async ({ request, store, authUser }) => {
        const auth = requireAuthUser(authUser);
        if (auth.response) return auth.response;
        const limited = enforceRateLimit("module-create", auth.user!.id, 30, 60 * 60 * 1000);
        if (limited) return limited;
        const requestBody = await readBoundedJson(request, 16 * 1024);
        if (requestBody.response) return requestBody.response;
        const parsed = createModuleBody.safeParse(requestBody.data);
        if (!parsed.success) {
          const msg = parsed.error.errors[0]?.message ?? "Module name is required.";
          return fail(400, "invalid_name", msg);
        }
        const { name, slug, description, priceCents } = parsed.data;
        const timestamp = nowIso();
        const id = crypto.randomUUID();
        try {
          createModule(
            store.db,
            id,
            auth.user!.id,
            toSafeNameComponent(slug?.trim() || name),
            name.trim(),
            description?.trim() ?? "",
            Math.max(0, Math.round(priceCents ?? 0)),
            timestamp,
          );
        } catch (error) {
          const duplicate = store.db.query("SELECT 1 FROM modules WHERE slug = ?").get(
            toSafeNameComponent(slug?.trim() || name),
          );
          if (duplicate) {
            return fail(409, "slug_exists", "A module with that slug already exists.");
          }
          throw error;
        }
        const moduleRow = getModuleById(store.db, id);
        return json({ module: moduleDetailDto(store.db, moduleRow!, auth.user, store.env.firstClassDiscountPercent) }, { status: 201 });
      },
      {
        parse: "none",
      },
    )
    .post(
      "/api/modules/:moduleId/versions",
      async ({ params, request, store, authUser }) => {
        const auth = requireAuthUser(authUser);
        if (auth.response) return auth.response;
        const limited = enforceRateLimit("module-upload", auth.user!.id, 20, 60 * 60 * 1000);
        if (limited) return limited;
        const parsed = moduleIdParams.safeParse(params);
        const moduleId = parsed.success ? parsed.data.moduleId : "";
        const moduleRow = getModuleById(store.db, moduleId);
        if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) {
          return fail(404, "module_not_found", "Module not found.");
        }
        const releaseTransfer = uploadLimiter.tryAcquire(auth.user!.id);
        if (!releaseTransfer) {
          return transferBusyResponse();
        }
        const versionId = crypto.randomUUID();
        const root = join(
          store.env.uploadRoot,
          moduleRow.id,
          versionId,
        );
        const bundlePath = join(root, "bundle.zip");
        let persisted = false;
        let requestedVersion = "";
        try {
          mkdirSync(root, { recursive: true });
          const upload = await streamModuleUploadToFile(
            request,
            bundlePath,
            store.env.maxUploadBytes,
            store.env.maxUploadBytes + maxMultipartOverheadBytes,
          );
          const parsedVersion = semanticVersion.safeParse(upload.version);
          requestedVersion = parsedVersion.success ? parsedVersion.data : upload.version;
          if (!parsedVersion.success || upload.changelog.length > 8_000) {
            return fail(
              400,
              "invalid_upload",
              parsedVersion.success
                ? "Upload requires a bundle and a changelog no longer than 8,000 characters."
                : parsedVersion.error.errors[0]?.message ?? "Version must be valid semantic version.",
            );
          }
          if (extname(upload.bundleFilename).toLowerCase() !== ".zip") {
            return fail(400, "invalid_bundle_extension", "Module bundles must be .zip files.");
          }
          await bundleIntegrity.remember(
            bundlePath,
            upload.bundleChecksumSha256,
            upload.bundleBytes,
            store.env.maxUploadBytes,
          );
          const timestamp = nowIso();
          store.db.transaction(() => {
            createModuleVersion(
              store.db,
              versionId,
              moduleRow.id,
              parsedVersion.data,
              upload.changelog,
              bundlePath,
              upload.bundleChecksumSha256,
              upload.bundleBytes,
              timestamp,
            );
            updateModuleTimestamp(store.db, moduleRow.id, timestamp);
          }).immediate();
          persisted = true;
          return json({ ok: true, version: parsedVersion.data });
        } catch (error) {
          if (error instanceof MultipartUploadError) {
            return fail(error.status, error.code, error.message);
          }
          const duplicate = store.db
            .query("SELECT 1 FROM module_versions WHERE module_id = ? AND version = ?")
            .get(moduleRow.id, requestedVersion);
          if (duplicate) {
            return fail(409, "version_exists", "A version with that identifier already exists.");
          }
          throw error;
        } finally {
          if (!persisted) {
            rmSync(root, { force: true, recursive: true });
          }
          releaseTransfer();
        }
      },
      {
        parse: "none",
        params: moduleIdParams,
      },
    )
    .post(
      "/api/modules/:moduleId/publish",
      async ({ params, store, authUser }) => {
        const auth = requireAuthUser(authUser);
        if (auth.response) return auth.response;
        const limited = enforceRateLimit("module-publish", auth.user!.id, 60, 60 * 60 * 1000);
        if (limited) return limited;
        const parsed = moduleIdParams.safeParse(params);
        const moduleId = parsed.success ? parsed.data.moduleId : "";
        const moduleRow = getModuleById(store.db, moduleId);
        if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) {
          return fail(404, "module_not_found", "Module not found.");
        }
        const releaseTransfer = uploadLimiter.tryAcquire(auth.user!.id);
        if (!releaseTransfer) {
          return transferBusyResponse();
        }
        try {
          const draftVersion = getLatestDraftVersion(store.db, moduleId);
          if (draftVersion) {
            const bundlePath = resolveContainedFile(store.env.uploadRoot, draftVersion.bundle_path);
            if (!bundlePath) {
              return fail(404, "bundle_not_found", "The publishable bundle is unavailable.");
            }
            await bundleIntegrity.verify(
              bundlePath,
              draftVersion.checksum_sha256,
              draftVersion.file_size_bytes,
              store.env.maxUploadBytes,
            );
          }
          publishModule(store.db, moduleId, auth.user!.id, nowIso(), draftVersion?.id);
        } catch (error) {
          if (error instanceof BundleIntegrityError) {
            return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
          }
          if (error instanceof Error && error.message.includes("draft version")) {
            return fail(409, "version_required", error.message);
          }
          if (error instanceof Error && error.message.includes("publication integrity")) {
            return fail(409, "version_changed", error.message);
          }
          throw error;
        } finally {
          releaseTransfer();
        }
        return json({ ok: true });
      },
      {
        params: moduleIdParams,
      },
    )
    .delete(
      "/api/modules/:moduleId",
      ({ params, store, authUser }) => {
        const auth = requireAuthUser(authUser);
        if (auth.response) return auth.response;
        const limited = enforceRateLimit("module-delete-draft", auth.user!.id, 30, 60 * 60 * 1000);
        if (limited) return limited;
        const parsed = moduleIdParams.safeParse(params);
        const moduleId = parsed.success ? parsed.data.moduleId : "";
        const moduleRow = getModuleById(store.db, moduleId);
        const priorDeletion = moduleRow ? null : getDraftModuleDeletion(store.db, moduleId, auth.user!.id);
        if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) {
          if (priorDeletion) {
            const cleanupPending = cleanupDraftModuleFiles(
              priorDeletion.cleanupPaths,
              store.env.uploadRoot,
              store.services.removeDirectory,
            );
            if (!cleanupPending && priorDeletion.cleanupPaths.length > 0) {
              finishDraftModuleDeletionCleanup(store.db, moduleId, auth.user!.id);
            }
            return json({ alreadyDeleted: true, cleanupPending, ok: true });
          }
          return fail(404, "module_not_found", "Module not found.");
        }
        if (moduleRow.visibility !== "draft") {
          return fail(409, "module_published", "Published modules cannot be deleted through draft rollback.");
        }

        const deletion = deleteDraftModule(store.db, moduleId, auth.user!.id);
        const cleanupPaths = deletion?.cleanupPaths ?? [];
        const cleanupPending = cleanupDraftModuleFiles(
          cleanupPaths,
          store.env.uploadRoot,
          store.services.removeDirectory,
        );
        if (!cleanupPending && cleanupPaths.length > 0) {
          finishDraftModuleDeletionCleanup(store.db, moduleId, auth.user!.id);
        }
        return json({ cleanupPending, ok: true });
      },
      { params: moduleIdParams },
    )
    .get(
      "/api/modules/:moduleId/download",
      async ({ params, request, store, authUser }) => {
        const limited = enforceRateLimit(
          "module-download",
          authUser?.id ?? clientIdentity(request),
          240,
          60 * 1000,
        );
        if (limited) return limited;
        const parsed = moduleIdParams.safeParse(params);
        const moduleId = parsed.success ? parsed.data.moduleId : "";
        const moduleRow = getModuleById(store.db, moduleId);
        if (!canViewModule(authUser, moduleRow)) {
          return fail(404, "module_not_found", "Module not found.");
        }
        if (!canDownloadModule(store.db, authUser, moduleRow)) {
          return fail(403, "purchase_required", "Purchase or entitlement is required to download this module.");
        }
        const version =
          moduleRow?.owner_user_id === authUser?.id
            ? getLatestAccessibleVersion(store.db, moduleId, authUser)
            : getLatestPublishedVersion(store.db, moduleId);
        if (!version) {
          return fail(404, "version_not_found", "No downloadable bundle found.");
        }
        const bundlePath = resolveContainedFile(store.env.uploadRoot, version.bundle_path);
        if (!bundlePath) {
          return fail(404, "bundle_not_found", "The downloadable bundle is unavailable.");
        }
        const transferIdentity = authUser?.id ?? clientIdentity(request);
        const releaseTransfer = downloadLimiter.tryAcquire(transferIdentity);
        if (!releaseTransfer) {
          return transferBusyResponse();
        }
        let permitTransferredToResponse = false;
        try {
          const verifiedFile = await bundleIntegrity.openVerified(
            bundlePath,
            version.checksum_sha256,
            version.file_size_bytes,
            store.env.maxUploadBytes,
          );
          const attachmentName = `${toSafeNameComponent(moduleRow!.slug)}-${toSafeNameComponent(version.version)}.zip`;
          const body = createPermitBoundFileStream(
            verifiedFile,
            version.file_size_bytes,
            releaseTransfer,
          );
          permitTransferredToResponse = true;
          return new Response(body, {
            headers: {
              "content-disposition": `attachment; filename="${attachmentName}"`,
              "content-length": `${version.file_size_bytes}`,
              "content-type": "application/zip",
              etag: `"${version.checksum_sha256}"`,
              "x-padpilot-sha256": version.checksum_sha256,
            },
          });
        } catch (error) {
          if (error instanceof BundleIntegrityError) {
            return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
          }
          throw error;
        } finally {
          if (!permitTransferredToResponse) {
            releaseTransfer();
          }
        }
      },
      {
        params: moduleIdParams,
      },
    )
    .get("/api/account/subscription", ({ request, store, authUser }) => {
      const auth = requireAuthUser(authUser);
      if (auth.response) return auth.response;
      const refreshedCookie = refreshSessionIfNeeded(request, store.db, store.env);
      return json(subscriptionDto(store.db, auth.user, store.env), refreshedCookie ? { headers: { "set-cookie": refreshedCookie } } : undefined);
    })
    .get("/api/account/modules", ({ store, authUser }) => {
      const auth = requireAuthUser(authUser);
      if (auth.response) return auth.response;
      const modules = listModulesForUser(store.db, auth.user).filter((moduleRow) =>
        moduleRow.owner_user_id === auth.user!.id || canDownloadModule(store.db, auth.user, moduleRow),
      );
      return json({
        modules: modules.map((moduleRow) =>
          moduleListDto(store.db, moduleRow, auth.user, store.env.firstClassDiscountPercent),
        ),
      });
    })
    .post("/api/checkout/sessions", async ({ request, store, authUser }) => {
      const auth = requireAuthUser(authUser);
      if (auth.response) return auth.response;
      const limited = enforceRateLimit("checkout", auth.user!.id, 12, 10 * 60 * 1000);
      if (limited) return limited;
      if (!store.env.isStripeConfigured) {
        return fail(503, "stripe_not_configured", "Stripe is not configured for this environment.");
      }
      if (!store.env.publicOrigin && !store.env.isDevelopment) {
        return fail(503, "public_origin_not_configured", "Marketplace public origin is not configured.");
      }

      const requestBody = await readBoundedJson(request, 4 * 1024);
      if (requestBody.response) return requestBody.response;
      const parsed = createCheckoutSessionBody.safeParse(requestBody.data);
      if (!parsed.success) {
        return fail(400, "invalid_checkout_kind", "A supported checkout kind is required.");
      }

      const account = authDto(store.db, auth.user, store.env);
      const { checkoutKind, moduleId } = parsed.data;
      const pricing = account.pricing;
      let amountCents = 0;
      let mode: "payment" | "subscription" = "payment";
      let moduleRow = null as ReturnType<typeof getModuleById>;
      let scopeKey = "padpilot-access";
      if (checkoutKind === "first_class_start") {
        amountCents = pricing.padpilotFinancingMonthlyPriceCents;
        mode = "subscription";
        scopeKey = "first-class";
        if (
          account.entitlements.firstClass?.status === "active" ||
          account.entitlements.firstClass?.status === "past_due"
        ) {
          return fail(409, "first_class_active", "First Class already has an active billing relationship.");
        }
      } else if (checkoutKind === "module_purchase") {
        moduleRow = getModuleById(store.db, moduleId!);
        if (!moduleRow || moduleRow.visibility !== "published") {
          return fail(404, "module_not_found", "Module not found.");
        }
        if (moduleRow.owner_user_id === auth.user!.id) {
          return fail(409, "module_owned", "Module owners already have download access.");
        }
        if (moduleRow.price_cents <= 0) {
          return fail(409, "module_free", "This module does not require a purchase.");
        }
        if (canDownloadModule(store.db, auth.user, moduleRow)) {
          return fail(409, "module_entitled", "This account already owns the module.");
        }
        amountCents = effectiveModulePriceCents(
          moduleRow,
          auth.user,
          store.env.firstClassDiscountPercent,
        );
        scopeKey = `module:${moduleRow.id}`;
      } else if (checkoutKind === "padpilot_financing_start") {
        amountCents = pricing.padpilotFinancingMonthlyPriceCents;
        mode = "subscription";
        if (account.entitlements.padpilotAccess?.status === "lifetime") {
          return fail(409, "already_lifetime", "PadPilot lifetime is already active.");
        }
        if (
          account.entitlements.padpilotAccess?.status === "financing" ||
          account.entitlements.padpilotAccess?.status === "past_due"
        ) {
          return fail(409, "already_financing", "PadPilot financing already has an active billing relationship.");
        }
      } else if (checkoutKind === "padpilot_lifetime_outright") {
        if (account.entitlements.padpilotAccess?.status === "lifetime") {
          return fail(409, "already_lifetime", "PadPilot lifetime is already active.");
        }
        if (account.entitlements.padpilotAccess && account.entitlements.padpilotAccess.amountPaidCents > 0) {
          return fail(409, "buyout_required", "Use the remaining-balance buyout for an existing financing account.");
        }
        amountCents = pricing.padpilotLifetimePriceCents;
      } else {
        const remaining = account.entitlements.padpilotAccess?.remainingBalanceCents ?? 0;
        if (!account.entitlements.padpilotAccess?.canBuyout || remaining <= 0) {
          return fail(409, "buyout_unavailable", "A lifetime buyout is not available for this account.");
        }
        amountCents = remaining;
      }

      const timestamp = nowIso();
      let checkout: ReturnType<typeof createBillingCheckout>;
      try {
        checkout = store.db.transaction(() => {
          let active = findActiveBillingCheckoutByScope(store.db, auth.user!.id, scopeKey);
          const activeCreatedAt = active ? Date.parse(active.created_at) : Number.NaN;
          if (active && (!Number.isFinite(activeCreatedAt) || Date.now() - activeCreatedAt > 24 * 60 * 60 * 1000)) {
            updateBillingCheckoutStatusById(store.db, active.id, "expired", timestamp);
            if (active.order_id) {
              updateModuleOrder(store.db, active.order_id, { status: "expired", updatedAt: timestamp });
            }
            active = null;
          }
          if (active) {
            if (
              active.checkout_kind !== checkoutKind ||
              active.amount_cents_snapshot !== amountCents ||
              (checkoutKind === "module_purchase" && getOrderById(store.db, active.order_id ?? "")?.module_id !== moduleRow!.id)
            ) {
              throw new Error("A different Checkout is already in progress for this purchase.");
            }
            return active;
          }

          const order = moduleRow
            ? createModuleOrder(store.db, {
                amountCents,
                createdAt: timestamp,
                currency: "usd",
                moduleId: moduleRow.id,
                status: "created",
                userId: auth.user!.id,
              })
            : null;
          return createBillingCheckout(store.db, {
            amountCentsSnapshot: amountCents,
            checkoutKind,
            createdAt: timestamp,
            currency: "usd",
            orderId: order?.id,
            scopeKey,
            status: "created",
            userId: auth.user!.id,
          });
        }).immediate();
      } catch (error) {
        return fail(409, "checkout_in_progress", error instanceof Error ? error.message : "A Checkout is already in progress.");
      }

      if (checkout.status === "pending" && checkout.stripe_checkout_url) {
        return json({
          amountCents,
          checkoutId: checkout.id,
          checkoutUrl: checkout.stripe_checkout_url,
          pricing: account.pricing,
        });
      }

      const origin = store.env.publicOrigin ?? new URL(request.url).origin;
      let stripeSession: Awaited<ReturnType<typeof createStripeCheckoutSession>>;
      try {
        stripeSession = await store.services.createStripeCheckoutSession({
          amountCents,
          cancelUrl: `${origin}/?checkout=cancelled`,
          checkoutId: checkout.id,
          checkoutKind,
          env: store.env,
          mode,
          moduleId: moduleRow?.id,
          orderId: checkout.order_id ?? undefined,
          productName: moduleRow?.name,
          successUrl: `${origin}/?checkout=success`,
          userId: auth.user!.id,
        });
      } catch (error) {
        return fail(502, "stripe_checkout_failed", error instanceof Error ? error.message : "Stripe Checkout failed.");
      }
      store.db.transaction(() => {
        updateBillingCheckoutSession(
          store.db,
          checkout.id,
          stripeSession.id,
          "pending",
          timestamp,
          stripeSession.url,
        );
        if (checkout.order_id) {
          updateModuleOrder(store.db, checkout.order_id, {
            providerCheckoutSessionId: stripeSession.id,
            status: "pending",
            updatedAt: timestamp,
          });
        }
      })();
      return json({
        amountCents,
        checkoutId: checkout.id,
        checkoutUrl: stripeSession.url,
        pricing: account.pricing,
      });
    }, {
      parse: "none",
    })
    .post("/api/webhooks/stripe", async ({ request, store }) => {
      const limited = enforceRateLimit("stripe-webhook", clientIdentity(request), 600, 60 * 1000);
      if (limited) return limited;
      const body = await readBoundedBody(request, maxStripeWebhookBytes);
      if (!body) {
        return fail(413, "stripe_webhook_too_large", "Stripe webhook exceeded the request limit.");
      }
      const payload = new TextDecoder().decode(body);
      try {
        store.services.verifyStripeWebhookSignature(payload, request.headers.get("stripe-signature"), store.env);
      } catch (error) {
        return fail(400, "invalid_stripe_signature", error instanceof Error ? error.message : "Invalid Stripe signature.");
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return fail(400, "invalid_stripe_payload", "Stripe webhook payload was not valid JSON.");
      }
      try {
        const result = store.services.processStripeWebhook(store.db, event, payload, store.env);
        if (result.cancelSubscriptionId) {
          await store.services.cancelStripeSubscription(result.cancelSubscriptionId, store.env);
        }
        return json({ duplicate: result.duplicate, ok: result.ok });
      } catch (error) {
        return fail(500, "stripe_webhook_failed", error instanceof Error ? error.message : "Stripe webhook processing failed.");
      }
    })
    .get("/api/updates/vst3/latest", ({ query, request, store }) => {
      const limited = enforceRateLimit("update-check", clientIdentity(request), 600, 60 * 1000);
      if (limited) return limited;
      const parsed = latestPluginUpdateQuery.safeParse(query);
      if (!parsed.success) {
        return fail(400, "invalid_update_query", parsed.error.errors[0]?.message ?? "Invalid plugin update query.");
      }

      const release = getLatestPluginRelease(store.db, {
        arch: parsed.data.arch,
        channel: parsed.data.channel,
        currentVersion: parsed.data.version,
        platform: parsed.data.platform,
      });

      if (!release) {
        return json({
          arch: parsed.data.arch,
          artifactChecksumSha256: null,
          artifactKind: null,
          artifactSizeBytes: 0,
          baseVersionRange: null,
          channel: parsed.data.channel,
          currentVersion: parsed.data.version,
          downloadUrl: null,
          latestVersion: null,
          manifestChecksumSha256: null,
          manifestUrl: null,
          platform: parsed.data.platform,
          publishedAt: null,
          releaseNotes: "",
          requiresRestart: true,
          signature: null,
          updateAvailable: false,
        });
      }

      const artifactPath = release.artifact_path || release.file_path;
      const artifactSize = release.artifact_size_bytes || release.file_size_bytes;
      const artifact = existingRegularFile(artifactPath, artifactSize);
      const manifest = existingRegularFile(release.manifest_path);
      if (!artifact || !manifest || manifest.size > 1024 * 1024) {
        return fail(503, "release_unavailable", "The selected plugin release is not fully staged.");
      }

      return json({
        artifactChecksumSha256: release.artifact_checksum_sha256 || release.checksum_sha256,
        artifactKind: release.artifact_kind,
        artifactSizeBytes: release.artifact_size_bytes || release.file_size_bytes,
        baseVersionRange: release.base_version_min || release.base_version_max
          ? { max: release.base_version_max, min: release.base_version_min }
          : null,
        channel: release.channel,
        currentVersion: parsed.data.version,
        downloadUrl: `/api/updates/vst3/download/${release.id}`,
        latestVersion: release.version,
        manifestChecksumSha256: release.manifest_checksum_sha256 || null,
        manifestUrl: `/api/updates/vst3/manifest/${release.id}`,
        platform: release.platform,
        arch: release.arch,
        publishedAt: release.published_at,
        releaseNotes: release.release_notes,
        requiresRestart: true,
        signature: release.signature || null,
        updateAvailable: true,
      });
    }, {
      query: z.object({
        arch: z.string().optional(),
        channel: z.string().optional(),
        platform: z.string().optional(),
        version: z.string().optional(),
      }),
    })
    .get("/api/updates/vst3/download/:releaseId", async ({ params, request, store }) => {
      const limited = enforceRateLimit("update-download", clientIdentity(request), 120, 60 * 1000);
      if (limited) return limited;
      const release = getPluginReleaseById(store.db, params.releaseId);
      if (!release) {
        return fail(404, "release_not_found", "No plugin release artifact was found.");
      }

      const filePath = release.artifact_path || release.file_path;
      const artifactSizeBytes = release.artifact_size_bytes || release.file_size_bytes;
      const artifact = existingRegularFile(filePath, artifactSizeBytes);
      if (!artifact) {
        return fail(404, "artifact_not_found", "The plugin release artifact is unavailable.");
      }
      const transferIdentity = clientIdentity(request);
      const releaseTransfer = downloadLimiter.tryAcquire(transferIdentity);
      if (!releaseTransfer) {
        return transferBusyResponse();
      }
      let permitTransferredToResponse = false;
      try {
        const checksum = release.artifact_checksum_sha256 || release.checksum_sha256;
        const verifiedFile = await bundleIntegrity.openVerified(
          filePath,
          checksum,
          artifactSizeBytes,
          maxPluginUpdateArtifactBytes,
        );
        const body = createPermitBoundFileStream(
          verifiedFile,
          artifactSizeBytes,
          releaseTransfer,
        );
        permitTransferredToResponse = true;
        return new Response(body, {
          headers: {
            "content-disposition": `attachment; filename="padpilot-${toSafeNameComponent(release.version)}-${toSafeNameComponent(release.channel)}.zip"`,
            "content-length": `${artifactSizeBytes}`,
            "content-type": "application/zip",
            etag: `"${checksum}"`,
            "x-padpilot-sha256": checksum,
          },
        });
      } catch (error) {
        if (error instanceof BundleIntegrityError) {
          return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
        }
        throw error;
      } finally {
        if (!permitTransferredToResponse) {
          releaseTransfer();
        }
      }
    })
    .get("/api/updates/vst3/manifest/:releaseId", async ({ params, request, store }) => {
      const limited = enforceRateLimit("update-manifest", clientIdentity(request), 300, 60 * 1000);
      if (limited) return limited;
      const release = getPluginReleaseById(store.db, params.releaseId);
      if (!release || !release.manifest_path) {
        return fail(404, "manifest_not_found", "No plugin update manifest was found.");
      }
      const manifest = existingRegularFile(release.manifest_path);
      if (!manifest || manifest.size > 1024 * 1024) {
        return fail(404, "manifest_not_found", "No plugin update manifest was found.");
      }

      const releaseTransfer = downloadLimiter.tryAcquire(clientIdentity(request));
      if (!releaseTransfer) {
        return transferBusyResponse();
      }
      let permitTransferredToResponse = false;
      try {
        const verifiedFile = await bundleIntegrity.openVerified(
          release.manifest_path,
          release.manifest_checksum_sha256,
          manifest.size,
          1024 * 1024,
        );
        const body = createPermitBoundFileStream(verifiedFile, manifest.size, releaseTransfer);
        permitTransferredToResponse = true;
        return new Response(body, {
          headers: {
            "content-length": `${manifest.size}`,
            "content-type": "application/json; charset=utf-8",
            etag: `"${release.manifest_checksum_sha256}"`,
            "x-padpilot-sha256": release.manifest_checksum_sha256,
          },
        });
      } catch (error) {
        if (error instanceof BundleIntegrityError) {
          return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
        }
        throw error;
      } finally {
        if (!permitTransferredToResponse) {
          releaseTransfer();
        }
      }
    })
    .get("/*", async ({ path, store }) => {
      if (isApiPath(path)) {
        return fail(404, "route_not_found", "API route not found.");
      }

      const res = await serveStatic(path, store.env);
      return res ?? new Response("Not Found", { status: 404 });
    });

  if (runtimeEnv.isDevelopment) {
    app
      .get(
        "/api/dev/static-check",
        ({ query, store }) => {
          const parsed = staticCheckQuery.safeParse(query);
          const path = parsed.success ? parsed.data.path : "/";
          return json(staticCheckResponse(path, store.env));
        },
        {
          query: z.object({ path: z.string().optional() }),
        },
      )
      .ws("/", {
        open(ws) {
          ws.subscribe("ui-update");
        },
        message() {},
      })
      .post(
        "/api/dev/reload", () => {
          app.server?.publish("ui-update", "ui-update");
          return json({ ok: true });
        },
      )
      .post(
        "/api/dev/generator/codex",
        async ({ request, store }) => {
          const developmentRejection = rejectUnsafeDevelopmentRequest(
            request,
            store.env,
            app.server?.requestIP(request)?.address,
          );
          if (developmentRejection) return developmentRejection;
          const limited = enforceRateLimit("dev-generator", clientIdentity(request), 20, 60 * 1000);
          if (limited) return limited;
          const requestBody = await readBoundedJson(request, 256 * 1024);
          if (requestBody.response) return requestBody.response;
          const parsed = codexGeneratorBody.safeParse(requestBody.data);
          if (!parsed.success) {
            return fail(400, "invalid_codex_generator_request", parsed.error.errors[0]?.message ?? "Invalid Codex generator request.");
          }
          const releaseGenerator = generatorLimiter.tryAcquire(clientIdentity(request));
          if (!releaseGenerator) {
            return json(
              { error: { code: "dev_generator_busy", message: "A generator request is already active for this client." } },
              { headers: { "retry-after": "1" }, status: 503 },
            );
          }
          try {
            const response = await store.services.runCodexGenerator(parsed.data);
            return json({ response, source: "codex-cli" });
          } catch (error) {
            if (error instanceof CodexGeneratorTimeoutError) {
              return fail(504, error.code, error.message);
            }
            if (error instanceof CodexGeneratorOutputLimitError) {
              return fail(502, error.code, error.message);
            }
            return fail(502, "codex_generator_failed", error instanceof Error ? error.message : "Codex generator failed.");
          } finally {
            releaseGenerator();
          }
        },
        {
          parse: "none",
        },
      );
  }

  return app;
}

if (import.meta.main) {
  if (isMigrationRequested(process.argv)) {
    openMarketplaceDatabase(env).close(false);
    console.log(`[marketplace] Applied migrations: ${describeMigrationRun(env.migrationsDir).join(", ")}`);
    process.exit(0);
  }

  const app = createMarketplaceApp();
  app.listen(marketplaceListenOptions(env));

  console.log(`[marketplace] Server running at http://localhost:${env.port}`);
  console.log(`[marketplace] SQLite: ${env.dbPath}`);
}
