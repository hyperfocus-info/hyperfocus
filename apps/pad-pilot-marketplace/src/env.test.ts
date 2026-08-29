import { afterEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { loadMarketplaceEnv } from "./env";

const trackedKeys = [
  "CLERK_PUBLIC_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "PADPILOT_DB_PATH",
  "PADPILOT_MODULE_UPLOAD_ROOT",
  "PADPILOT_MARKETPLACE_PORT",
  "PADPILOT_FINANCING_MONTHLY_PRICE_CENTS",
  "PADPILOT_LIFETIME_PRICE_CENTS",
  "PADPILOT_PUBLIC_ORIGIN",
  "PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS",
  "PADPILOT_SESSION_TTL_HOURS",
  "NODE_ENV",
];

const originalEnv = Object.fromEntries(trackedKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of trackedKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("loadMarketplaceEnv", () => {
  it("uses the canonical marketplace db and upload defaults", () => {
    delete process.env.PADPILOT_DB_PATH;
    delete process.env.PADPILOT_MODULE_UPLOAD_ROOT;

    const env = loadMarketplaceEnv();

    const marketplaceRoot = path.resolve(import.meta.dir, "..");
    expect(env.dbPath).toBe(path.join(marketplaceRoot, "data", "db", "padpilot-dev.sqlite"));
    expect(env.uploadRoot).toBe(path.join(marketplaceRoot, "data", "module-uploads"));
    expect(env.migrationsDir).toBe(path.join(marketplaceRoot, "migrations"));
  });

  it("respects explicit db and upload overrides", () => {
    process.env.PADPILOT_DB_PATH = path.join(process.cwd(), "tmp", "custom.sqlite");
    process.env.PADPILOT_MODULE_UPLOAD_ROOT = path.join(process.cwd(), "tmp", "module-uploads");
    process.env.PADPILOT_MARKETPLACE_PORT = "4010";

    const env = loadMarketplaceEnv();

    expect(env.dbPath).toBe(process.env.PADPILOT_DB_PATH);
    expect(env.uploadRoot).toBe(process.env.PADPILOT_MODULE_UPLOAD_ROOT);
    expect(env.port).toBe(4010);
  });

  it("reads the legacy Clerk alias without mutating process environment", () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    process.env.CLERK_PUBLIC_KEY = "legacy-publishable-key";

    expect(loadMarketplaceEnv().clerkPublishableKey).toBe("legacy-publishable-key");
    expect(process.env.CLERK_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("rejects invalid numeric configuration instead of silently changing it", () => {
    process.env.PADPILOT_MARKETPLACE_PORT = "3000.5";
    expect(() => loadMarketplaceEnv()).toThrow("must be an integer");
  });

  it("requires a bare HTTPS public origin outside development", () => {
    process.env.NODE_ENV = "production";
    process.env.PADPILOT_PUBLIC_ORIGIN = "http://marketplace.example/path";
    expect(() => loadMarketplaceEnv()).toThrow("bare HTTPS origin");

    delete process.env.PADPILOT_PUBLIC_ORIGIN;
    expect(loadMarketplaceEnv().cookieSecure).toBe(true);
  });

  it("rejects pricing and session windows that violate cross-field invariants", () => {
    process.env.PADPILOT_FINANCING_MONTHLY_PRICE_CENTS = "6001";
    process.env.PADPILOT_LIFETIME_PRICE_CENTS = "6000";
    expect(() => loadMarketplaceEnv()).toThrow("cannot exceed");

    delete process.env.PADPILOT_FINANCING_MONTHLY_PRICE_CENTS;
    delete process.env.PADPILOT_LIFETIME_PRICE_CENTS;
    process.env.PADPILOT_SESSION_REFRESH_THRESHOLD_HOURS = "24";
    process.env.PADPILOT_SESSION_TTL_HOURS = "24";
    expect(() => loadMarketplaceEnv()).toThrow("must be less than");
  });
});
