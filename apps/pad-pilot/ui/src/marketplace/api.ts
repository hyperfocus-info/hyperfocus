import { resolveMarketplaceHttpBaseUrl } from "../../../utils/marketplace-runtime";
import {
  BoundedStreamLimitError,
  readBoundedStreamText,
} from "@hyperfocus/pad-pilot/bounded-stream";
import { z } from "zod";

export type MarketplaceUser = z.infer<typeof marketplaceUserSchema>;
export type MarketplaceEntitlements = z.infer<typeof marketplaceEntitlementsSchema>;
export type MarketplacePricing = z.infer<typeof marketplacePricingSchema>;
export type ModuleVersionSummary = z.infer<typeof moduleVersionSummarySchema>;
export type MarketplaceCatalogModule = z.infer<typeof marketplaceCatalogModuleSchema>;
export type MarketplaceModuleDetail = z.infer<typeof marketplaceModuleDetailSchema>;
export type MarketplaceBootstrap = z.infer<typeof marketplaceBootstrapSchema>;

export type PluginUpdateChannel = "beta" | "stable";

export type LatestPluginUpdateResponse = z.infer<typeof latestPluginUpdateResponseSchema>;

const nullableStringSchema = z.string().nullable();
const finiteNumberSchema = z.number().finite();
const nonnegativeIntegerSchema = finiteNumberSchema.int().nonnegative();
const moduleVersionSummarySchema = z.object({
  fileSizeBytes: nonnegativeIntegerSchema.nullable(),
  publishedAt: nullableStringSchema,
  status: z.string(),
  version: z.string(),
});
const marketplacePricingSchema = z.object({
  firstClassDiscountPercent: finiteNumberSchema,
  padpilotFinancingMonthlyPriceCents: nonnegativeIntegerSchema,
  padpilotLifetimePriceCents: nonnegativeIntegerSchema,
});
const marketplaceEntitlementsSchema = z.object({
  firstClass: z.object({
    discountPercent: finiteNumberSchema,
    nextBillingAt: nullableStringSchema,
    status: z.string(),
  }).nullable(),
  padpilotAccess: z.object({
    amountPaidCents: nonnegativeIntegerSchema,
    canBuyout: z.boolean(),
    lifetimePriceCents: nonnegativeIntegerSchema,
    nextBillingAt: nullableStringSchema,
    remainingBalanceCents: nonnegativeIntegerSchema,
    status: z.string(),
  }).nullable(),
});
const marketplaceUserSchema = z.object({
  clerkUserId: z.string(),
  displayName: nullableStringSchema,
  email: nullableStringSchema,
  id: z.string(),
  username: nullableStringSchema,
});
const marketplaceCatalogModuleSchema = z.object({
  canDownload: z.boolean(),
  currency: z.string(),
  description: z.string(),
  downloadUrl: nullableStringSchema,
  id: z.string(),
  latestVersion: moduleVersionSummarySchema.nullable(),
  name: z.string(),
  owner: z.string(),
  priceCents: nonnegativeIntegerSchema,
  slug: z.string(),
  visibility: z.string(),
});
const marketplaceModuleDetailSchema = z.object({
  actions: z.object({
    canDownload: z.boolean(),
    canPublish: z.boolean(),
    canUploadVersion: z.boolean(),
  }),
  currency: z.string(),
  description: z.string(),
  downloadUrl: nullableStringSchema,
  id: z.string(),
  isOwner: z.boolean(),
  latestAccessibleVersion: moduleVersionSummarySchema.nullable(),
  latestPublishedVersion: moduleVersionSummarySchema.nullable(),
  name: z.string(),
  owner: z.string(),
  priceCents: nonnegativeIntegerSchema,
  slug: z.string(),
  visibility: z.string(),
});
const marketplaceLatestSchema = z.union([
  z.null(),
  z.boolean(),
  finiteNumberSchema,
  z.string(),
  z.array(z.unknown()),
  z.record(z.unknown()),
]);
const marketplaceBootstrapSchema = z.object({
  auth: z.object({
    authenticated: z.boolean(),
    configured: z.object({
      clerk: z.boolean(),
      stripe: z.boolean(),
    }),
    entitlements: marketplaceEntitlementsSchema,
    pilotTokenBalance: nonnegativeIntegerSchema,
    pricing: marketplacePricingSchema,
    publishableKey: nullableStringSchema,
    subscriptionStatus: z.string(),
    user: marketplaceUserSchema.nullable(),
  }),
  capabilities: z.object({
    browserDownloadsOnly: z.boolean(),
    nativeModuleInstallation: z.boolean(),
  }),
  marketplace: z.object({
    modules: z.array(marketplaceCatalogModuleSchema),
  }),
  updates: z.object({ latest: marketplaceLatestSchema }),
});
const latestPluginUpdateResponseSchema = z.object({
  arch: z.string(),
  artifactChecksumSha256: nullableStringSchema,
  artifactKind: z.enum(["directory_patch", "full_bundle"]).nullable(),
  artifactSizeBytes: nonnegativeIntegerSchema,
  baseVersionRange: z.object({ max: nullableStringSchema, min: nullableStringSchema }).nullable(),
  channel: z.enum(["beta", "stable"]),
  currentVersion: z.string(),
  downloadUrl: nullableStringSchema,
  latestVersion: nullableStringSchema,
  manifestChecksumSha256: nullableStringSchema,
  manifestUrl: nullableStringSchema,
  platform: z.string(),
  publishedAt: nullableStringSchema,
  releaseNotes: z.string(),
  requiresRestart: z.boolean(),
  signature: nullableStringSchema,
  updateAvailable: z.boolean(),
});
const checkoutResponseSchema = z.object({
  amountCents: nonnegativeIntegerSchema,
  checkoutId: z.string(),
  checkoutUrl: z.string(),
  pricing: marketplacePricingSchema,
});
const subscriptionResponseSchema = z.object({
  entitlements: marketplaceEntitlementsSchema,
  pilotTokenBalance: nonnegativeIntegerSchema,
  pricing: marketplacePricingSchema,
  recentTokenLedger: z.array(z.unknown()),
  subscriptionStatus: z.string(),
});
const acknowledgementSchema = z.object({}).passthrough();
const marketplaceErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }),
});

const marketplaceErrors = new WeakSet<Error>();

export function createMarketplaceApiError(message: string, code: string | null = null) {
  const error = Object.assign(new Error(message), { name: "MarketplaceApiError", code });
  marketplaceErrors.add(error);
  return error;
}

export function isMarketplaceApiError(value: unknown): value is ReturnType<typeof createMarketplaceApiError> {
  return value instanceof Error && marketplaceErrors.has(value);
}

const baseUrl = () =>
  resolveMarketplaceHttpBaseUrl();

const MAX_MARKETPLACE_JSON_BYTES = 2097152;
const MAX_MARKETPLACE_RESPONSE_CHUNKS = 4096;
const MARKETPLACE_REQUEST_TIMEOUT_MS = 30_000;
const MARKETPLACE_UPLOAD_TIMEOUT_MS = 300000;

async function readBoundedResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MARKETPLACE_JSON_BYTES) {
    throw new Error("Marketplace response exceeded the 2 MiB limit.");
  }
  try {
    return await readBoundedStreamText(response.body, {
      label: "Marketplace response",
      maxBytes: MAX_MARKETPLACE_JSON_BYTES,
      maxChunks: MAX_MARKETPLACE_RESPONSE_CHUNKS,
    });
  } catch (error) {
    if (!(error instanceof BoundedStreamLimitError)) {
      throw error;
    }
    throw new Error(
      error.kind === "chunks"
        ? "Marketplace response was split into too many chunks."
        : "Marketplace response exceeded the 2 MiB limit.",
    );
  }
}

async function parseJson(response: Response) {
  const body = await readBoundedResponseText(response);
  let payload: unknown = null;
  let parseFailed = false;

  if (body.trim().length > 0) {
    try {
      payload = JSON.parse(body);
    } catch {
      parseFailed = true;
    }
  }

  if (!response.ok) {
    const parsedError = marketplaceErrorSchema.safeParse(payload);
    const message = parsedError.success ? parsedError.data.error.message : null;
    const code = parsedError.success ? parsedError.data.error.code ?? null : null;
    throw createMarketplaceApiError(message ?? (body || `Request failed with ${response.status}`), code);
  }
  if (parseFailed) {
    throw createMarketplaceApiError("Marketplace returned malformed JSON.");
  }
  if (payload === null) {
    throw createMarketplaceApiError("Marketplace returned an empty JSON response.");
  }
  return payload;
}

async function requestMarketplaceJson<T>(url: URL, schema: z.ZodType<T>, init?: RequestInit, timeoutMs = MARKETPLACE_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await parseJson(response);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw createMarketplaceApiError("Marketplace returned an invalid response.");
    }
    return parsed.data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Marketplace request timed out.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function fetchMarketplaceBootstrap() {
  return requestMarketplaceJson(new URL("/api/bootstrap", baseUrl()), marketplaceBootstrapSchema, {
    credentials: "include",
  });
}

export async function fetchMarketplaceModuleDetail(moduleId: string) {
  return requestMarketplaceJson(new URL(`/api/modules/${encodeURIComponent(moduleId)}`, baseUrl()), z.object({ module: marketplaceModuleDetailSchema }), {
    credentials: "include",
  });
}

export async function exchangeMarketplaceSession(token: string) {
  await requestMarketplaceJson(new URL("/api/auth/clerk/exchange", baseUrl()), acknowledgementSchema, {
    body: JSON.stringify({ token }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function logoutMarketplaceSession() {
  await requestMarketplaceJson(new URL("/api/auth/logout", baseUrl()), acknowledgementSchema, {
    credentials: "include",
    method: "POST",
  });
}

export async function createMarketplaceModule(input: {
  description: string;
  name: string;
  priceCents: number;
  slug?: string;
}) {
  return requestMarketplaceJson(new URL("/api/modules", baseUrl()), z.object({ module: marketplaceModuleDetailSchema }), {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function uploadMarketplaceModuleVersion(input: {
  bundle: File;
  changelog?: string;
  moduleId: string;
  version: string;
}) {
  const formData = new FormData();
  formData.set("bundle", input.bundle);
  formData.set("changelog", input.changelog ?? "");
  formData.set("version", input.version);
  await requestMarketplaceJson(new URL(`/api/modules/${encodeURIComponent(input.moduleId)}/versions`, baseUrl()), acknowledgementSchema, {
    body: formData,
    credentials: "include",
    method: "POST",
  }, MARKETPLACE_UPLOAD_TIMEOUT_MS);
}

export async function deleteMarketplaceModule(moduleId: string) {
  await requestMarketplaceJson(new URL(`/api/modules/${encodeURIComponent(moduleId)}`, baseUrl()), acknowledgementSchema, {
    credentials: "include",
    method: "DELETE",
  });
}

export async function publishMarketplaceModule(moduleId: string) {
  await requestMarketplaceJson(new URL(`/api/modules/${encodeURIComponent(moduleId)}/publish`, baseUrl()), acknowledgementSchema, {
    credentials: "include",
    method: "POST",
  });
}

export async function fetchMarketplaceSubscription() {
  return requestMarketplaceJson(new URL("/api/account/subscription", baseUrl()), subscriptionResponseSchema, {
    credentials: "include",
  });
}

export type MarketplaceCheckoutKind =
  | "first_class_start"
  | "module_purchase"
  | "padpilot_financing_start"
  | "padpilot_lifetime_buyout"
  | "padpilot_lifetime_outright";

export async function createMarketplaceCheckoutSession(checkoutKind: MarketplaceCheckoutKind, moduleId?: string) {
  if (checkoutKind === "module_purchase" && !moduleId) {
    throw new Error("Select a module before starting checkout.");
  }
  const checkout = await requestMarketplaceJson(new URL("/api/checkout/sessions", baseUrl()), checkoutResponseSchema, {
    body: JSON.stringify(checkoutKind === "module_purchase" ? { checkoutKind, moduleId } : { checkoutKind }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(checkout.checkoutUrl);
  } catch {
    throw new Error("Checkout returned an invalid redirect URL.");
  }
  const localDevelopmentUrl = checkoutUrl.protocol === "http:" &&
    (checkoutUrl.hostname === "localhost" || checkoutUrl.hostname === "127.0.0.1");
  if (checkoutUrl.protocol !== "https:" && !localDevelopmentUrl) {
    throw new Error("Checkout returned an unsafe redirect URL.");
  }
  return checkout;
}

export async function fetchLatestPluginUpdate(input: {
  arch: string;
  channel: PluginUpdateChannel;
  platform: string;
  version: string;
}) {
  const url = new URL("/api/updates/vst3/latest", baseUrl());
  url.searchParams.set("arch", input.arch);
  url.searchParams.set("channel", input.channel);
  url.searchParams.set("platform", input.platform);
  url.searchParams.set("version", input.version);
  return requestMarketplaceJson(url, latestPluginUpdateResponseSchema, {
    credentials: "include",
  });
}

export function resolveMarketplaceDownloadUrl(downloadUrl: string) {
  return resolveMarketplaceSameOriginUrl(downloadUrl);
}

export function resolveMarketplaceApiUrl(relativeUrl: string) {
  return resolveMarketplaceSameOriginUrl(relativeUrl);
}

function resolveMarketplaceSameOriginUrl(value: string) {
  const marketplaceUrl = new URL(baseUrl());
  const resolved = new URL(value, marketplaceUrl);
  if ((resolved.protocol !== "http:" && resolved.protocol !== "https:") ||
      resolved.origin !== marketplaceUrl.origin) {
    throw new Error("Marketplace returned an unsafe resource URL.");
  }
  return resolved.toString();
}
