import { join, resolve } from "node:path";

const marketplaceRoot = resolve(import.meta.dir, "..");
const padPilotRoot = resolve(marketplaceRoot, "..", "pad-pilot");
const repositoryRoot = resolve(marketplaceRoot, "..", "..");

const readInteger = (
  value: string | undefined,
  fallback: number,
  input: { label: string; max: number; min: number },
) => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${input.label} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < input.min || parsed > input.max) {
    throw new Error(`${input.label} must be between ${input.min} and ${input.max}.`);
  }
  return parsed;
};

const readBoolean = (value: string | undefined) => {
  if (value?.trim().toLowerCase() === "true" || value?.trim() === "1") return true;
  if (value?.trim().toLowerCase() === "false" || value?.trim() === "0") return false;
  return null;
};

/**
 * Loads marketplace environment from .env files and process.env.
 *
 * @returns MarketplaceEnv with paths, Clerk config, and limits
 */
export function loadMarketplaceEnv() {
  const repoRoot = repositoryRoot;
  const isDevelopment = process.env.NODE_ENV === "development";

  const clerkPublishableKey = (
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLIC_KEY
  )?.trim() || null;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim() || null;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const configuredPublicOrigin = process.env.PADPILOT_PUBLIC_ORIGIN?.trim().replace(/\/$/, "") || null;
  let publicOrigin: string | null = null;
  if (configuredPublicOrigin) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(configuredPublicOrigin);
    } catch {
      throw new Error("PADPILOT_PUBLIC_ORIGIN must be a valid HTTP(S) origin.");
    }
    if (
      (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== "/" ||
      parsedOrigin.search ||
      parsedOrigin.hash ||
      (!isDevelopment && parsedOrigin.protocol !== "https:")
    ) {
      throw new Error("PADPILOT_PUBLIC_ORIGIN must be a bare HTTPS origin outside development.");
    }
    publicOrigin = parsedOrigin.origin;
  }
  const configuredCookieSecure = readBoolean(process.env.PADPILOT_COOKIE_SECURE);
  const padpilotFinancingMonthlyPriceCents = readInteger(process.env.PADPILOT_FINANCING_MONTHLY_PRICE_CENTS, 1000, {
    label: "PADPILOT_FINANCING_MONTHLY_PRICE_CENTS",
    max: 100_000_000,
    min: 1,
  });
  const padpilotLifetimePriceCents = readInteger(process.env.PADPILOT_LIFETIME_PRICE_CENTS, 6000, {
    label: "PADPILOT_LIFETIME_PRICE_CENTS",
    max: 100_000_000,
    min: 1,
  });
  if (padpilotFinancingMonthlyPriceCents > padpilotLifetimePriceCents) {
    throw new Error("PADPILOT_FINANCING_MONTHLY_PRICE_CENTS cannot exceed PADPILOT_LIFETIME_PRICE_CENTS.");
  }
  const sessionRefreshThresholdHours = readInteger(process.env.PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS, 24, {
    label: "PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS",
    max: 8_760,
    min: 1,
  });
  const sessionTtlHours = readInteger(process.env.PADPILOT_SESSION_TTL_HOURS, 720, {
    label: "PADPILOT_SESSION_TTL_HOURS",
    max: 8_760,
    min: 1,
  });
  if (sessionRefreshThresholdHours >= sessionTtlHours) {
    throw new Error("PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS must be less than PADPILOT_SESSION_TTL_HOURS.");
  }

  return {
    clerkPublishableKey,
    clerkSecretKey,
    cookieSecure: isDevelopment
      ? configuredCookieSecure ?? publicOrigin?.startsWith("https://") ?? false
      : true,
    dbPath: process.env.PADPILOT_DB_PATH ?? join(marketplaceRoot, "data", "db", "padpilot-dev.sqlite"),
    isClerkConfigured: Boolean(clerkPublishableKey && clerkSecretKey),
    maxUploadBytes: Math.min(
      104857600,
      readInteger(process.env.PADPILOT_MAX_UPLOAD_BYTES, 26214400, {
        label: "PADPILOT_MAX_UPLOAD_BYTES",
        max: 104857600,
        min: 1024,
      }),
    ),
    migrationsDir: join(marketplaceRoot, "migrations"),
    padpilotFinancingMonthlyPriceCents,
    padpilotLifetimePriceCents,
    port: readInteger(process.env.PADPILOT_MARKETPLACE_PORT, 3000, {
      label: "PADPILOT_MARKETPLACE_PORT",
      max: 65_535,
      min: 1,
    }),
    repoRoot,
    sessionRefreshThresholdHours,
    sessionTtlHours,
    firstClassDiscountPercent: readInteger(process.env.FIRST_CLASS_DISCOUNT_PERCENT, 20, {
      label: "FIRST_CLASS_DISCOUNT_PERCENT",
      max: 100,
      min: 0,
    }),
    publicOrigin,
    stripeProductIdFirstClass: process.env.STRIPE_PRODUCT_ID_FIRST_CLASS?.trim() || process.env.FIRST_CLASS_PRODUCT_ID?.trim() || "prod_U9xuBPWmWPLF6V",
    stripeProductIdPadPilotLifetime: process.env.STRIPE_PRODUCT_ID_PADPILOT_LIFETIME?.trim() || process.env.PADPILOT_LIFETIME_PRODUCT_ID?.trim() || "prod_U9y7YtwAUNxoqq",
    stripeSecretKey,
    stripeWebhookSecret,
    trustProxy: readBoolean(process.env.PADPILOT_TRUST_PROXY) ?? false,
    isStripeConfigured: Boolean(stripeSecretKey && stripeWebhookSecret),
    uiDistDir: join(padPilotRoot, "ui", "dist"),
    uiIndexFilePath: join(padPilotRoot, "ui", "dist", "index.html"),
    uiPublicDir: join(padPilotRoot, "ui", "public"),
    uploadRoot: process.env.PADPILOT_MODULE_UPLOAD_ROOT ?? join(marketplaceRoot, "data", "module-uploads"),
    isDevelopment,
  };
}

export const marketplaceEnv = loadMarketplaceEnv();

export type MarketplaceEnv = ReturnType<typeof loadMarketplaceEnv>;
