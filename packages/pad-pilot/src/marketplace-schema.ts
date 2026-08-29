import { z } from "zod";
import { parseSemVer } from "@hyperfocus/pad-pilot/semver";

/**
 * Schema for POST /api/auth/clerk/exchange request body.
 * Requires a non-empty Clerk session token.
 */
export const clerkExchangeBody = z.object({
  token: z.string().trim().min(1, "A Clerk session token is required.").max(8_192),
});

/**
 * Schema for POST /api/modules request body.
 * Name is required; slug, description, and priceCents are optional.
 */
export const createModuleBody = z.object({
  name: z.string().trim().min(1, "Module name is required.").max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i).optional(),
  description: z.string().trim().max(4_000).optional(),
  priceCents: z.number().int().min(0).max(1_000_000).optional(),
});

export const semanticVersion = z.string().trim().max(128).regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  "Version must be a valid semantic version.",
).refine((value) => parseSemVer(value) !== null, "Version components are too large.");

/**
 * Schema for route params on /api/modules/:moduleId/* endpoints.
 */
export const moduleIdParams = z.object({
  moduleId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

/**
 * Schema for GET /api/dev/static-check query params.
 * Path defaults to "/" if not provided.
 */
export const staticCheckQuery = z.object({
  path: z.string().optional().default("/"),
});

export const checkoutKind = z.enum([
  "first_class_start",
  "module_purchase",
  "padpilot_financing_start",
  "padpilot_lifetime_buyout",
  "padpilot_lifetime_outright",
]);

export const createCheckoutSessionBody = z.object({
  checkoutKind,
  moduleId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).superRefine((input, context) => {
  if (input.checkoutKind === "module_purchase" && !input.moduleId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A module id is required for a module purchase.",
      path: ["moduleId"],
    });
  }
  if (input.checkoutKind !== "module_purchase" && input.moduleId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Module id is only valid for module purchases.",
      path: ["moduleId"],
    });
  }
});

export const pluginUpdateChannel = z.enum(["beta", "stable"]);

export const latestPluginUpdateQuery = z.object({
  arch: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  channel: pluginUpdateChannel.default("stable"),
  platform: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  version: semanticVersion,
});
