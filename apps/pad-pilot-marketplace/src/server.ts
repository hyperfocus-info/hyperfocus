/**
 * Marketplace HTTP server: Elysia router delegating to db, session, modules, static, and auth helpers.
 * Serves API routes, WebSocket for ui-update, and static UI assets.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { Elysia } from "elysia";
import { z } from "zod";
import { authDto, subscriptionDto } from "./auth/account";
import { verifyClerkSessionToken } from "./auth/auth";
import { processStripeWebhook } from "./billing/billing-webhooks";
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
  getLatestPublishedVersion,
  getModuleById,
  getOrderById,
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
import { fail, isApiPath, json } from "./responses";
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
import { clearSessionCookie, cookies, makeCookieHeader, refreshSessionIfNeeded, userFromRequest } from "./auth/session";
import { resolveContainedFile, serveStatic, staticCheckResponse } from "./static";
import {
  cancelStripeSubscription,
  createStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from "./billing/stripe";
import { toSafeNameComponent } from "./safe-name";
import { createUpdateRouteHandlers } from "./server/server-update-handlers";
import { handleMarketplaceError } from "./server/server-error-handler";
import { createModuleRouteHandlers } from "./server/server-module-handlers";
import { createAccountRouteHandlers } from "./server/server-account-handlers";
import {
  clerkExchangeBody,
  createCheckoutSessionBody,
  createModuleBody,
  moduleIdParams,
  semanticVersion,
  staticCheckQuery,
} from "@hyperfocus/pad-pilot/marketplace-schema";
import {
  cleanupDraftModuleFiles,
  marketplaceListenOptions,
  maxMultipartOverheadBytes,
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
  const updateHandlers = createUpdateRouteHandlers({
    bundleIntegrity,
    clientIdentity,
    downloadLimiter,
    enforceRateLimit,
    transferBusyResponse,
  });
  const moduleHandlers = createModuleRouteHandlers({
    bundleIntegrity,
    clientIdentity,
    downloadLimiter,
    enforceRateLimit,
    transferBusyResponse,
    uploadLimiter,
  });
  const accountHandlers = createAccountRouteHandlers({ clientIdentity, enforceRateLimit });

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
    .onError(handleMarketplaceError)
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
    .get("/api/modules", moduleHandlers.list)
    .get(
      "/api/modules/:moduleId",
      moduleHandlers.detail,
      {
        params: moduleIdParams,
      },
    )
    .post(
      "/api/modules",
      moduleHandlers.create,
      {
        parse: "none",
      },
    )
    .post(
      "/api/modules/:moduleId/versions",
      moduleHandlers.uploadVersion,
      {
        parse: "none",
        params: moduleIdParams,
      },
    )
    .post(
      "/api/modules/:moduleId/publish",
      moduleHandlers.publish,
      {
        params: moduleIdParams,
      },
    )
    .delete(
      "/api/modules/:moduleId",
      moduleHandlers.remove,
      { params: moduleIdParams },
    )
    .get(
      "/api/modules/:moduleId/download",
      moduleHandlers.download,
      {
        params: moduleIdParams,
      },
    )
    .get("/api/account/subscription", accountHandlers.subscription)
    .get("/api/account/modules", accountHandlers.modules)
    .post("/api/checkout/sessions", accountHandlers.checkout, {
      parse: "none",
    })
    .post("/api/webhooks/stripe", accountHandlers.stripeWebhook)
    .get("/api/updates/vst3/latest", updateHandlers.latest, {
      query: z.object({
        arch: z.string().optional(),
        channel: z.string().optional(),
        platform: z.string().optional(),
        version: z.string().optional(),
      }),
    })
    .get("/api/updates/vst3/download/:releaseId", updateHandlers.download)
    .get("/api/updates/vst3/manifest/:releaseId", updateHandlers.manifest)
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
