import { z } from "zod";
import { isValidCapabilityId, isValidModuleId } from "./module-identity";
import { parseSemVer } from "./semver";

export const PADPILOT_MANIFEST_MAX_BYTES = 1024 * 1024;
export const PADPILOT_MANIFEST_MAX_CAPABILITIES = 64;
export const PADPILOT_MANIFEST_MAX_ENTRY_BYTES = 1024;
export const PADPILOT_MANIFEST_MAX_NAME_BYTES = 256;
export const PADPILOT_MANIFEST_MAX_SCHEMA_VERSION = 64;
export const PADPILOT_MANIFEST_MAX_VERSION_BYTES = 128;

const encoder = new TextEncoder();

function hasMaximumBytes(value: string, maximumBytes: number) {
  return encoder.encode(value).length <= maximumBytes;
}

function isSafeBundleRelativePath(value: string) {
  if (!value || !hasMaximumBytes(value, PADPILOT_MANIFEST_MAX_ENTRY_BYTES)) return false;
  if (value.startsWith("/") || value.includes(":")) return false;
  if (value.includes("\\") || value.includes("//") || value.includes("?") || value.includes("#") || value.includes("\0")) return false;
  const segments = value.replace(/^\.\//, "").split("/");
  return segments.length > 0 && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const semanticVersion = z.string().trim().min(1).superRefine((value, context) => {
  if (!hasMaximumBytes(value, PADPILOT_MANIFEST_MAX_VERSION_BYTES)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Version exceeds 128 UTF-8 bytes." });
  } else if (!parseSemVer(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Version must use semantic versioning." });
  }
});

const bundlePath = z.string().trim().refine(isSafeBundleRelativePath, "Entry must be a safe bundle-relative path.");

const moduleMigration = z.union([
  bundlePath,
  z.object({
    path: bundlePath.optional(),
    metadataPath: bundlePath.optional(),
  }).passthrough().refine(
    (migration) => Boolean(migration.path || migration.metadataPath),
    "Migration metadata requires path or metadataPath.",
  ),
]);

export const padPilotModuleManifestSchema = z.object({
  id: z.string().trim().refine(isValidModuleId, "Module id must be canonical kebab-case."),
  name: z.string().trim().min(1).refine(
    (value) => hasMaximumBytes(value, PADPILOT_MANIFEST_MAX_NAME_BYTES),
    "Module name exceeds 256 UTF-8 bytes.",
  ),
  version: semanticVersion,
  moduleApiVersion: semanticVersion,
  uiEntry: z.string().trim().min(1).refine(
    (value) => isSafeBundleRelativePath(value) || /^builtin:\/\/factory\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    "UI entry must be a safe bundle path or reserved factory entry.",
  ),
  scriptEntry: bundlePath.optional(),
  stateSchemaVersion: z.number().int().min(1).max(PADPILOT_MANIFEST_MAX_SCHEMA_VERSION),
  capabilities: z.array(
    z.string().refine(isValidCapabilityId, "Capability ids must be lowercase kebab-case."),
  ).max(PADPILOT_MANIFEST_MAX_CAPABILITIES).refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    "Capabilities must be unique.",
  ),
  minHostVersion: semanticVersion,
  assets: z.record(bundlePath).default({}),
  migrations: z.array(moduleMigration).max(PADPILOT_MANIFEST_MAX_SCHEMA_VERSION - 1).default([]),
}).strict().superRefine((manifest, context) => {
  const factoryPrefix = "builtin://factory/";
  if (manifest.uiEntry.startsWith(factoryPrefix) && manifest.uiEntry.slice(factoryPrefix.length) !== manifest.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reserved factory entry must match the Module id.",
      path: ["uiEntry"],
    });
  }
});

export type PadPilotModuleManifest = z.input<typeof padPilotModuleManifestSchema>;
export type ResolvedPadPilotModuleManifest = z.output<typeof padPilotModuleManifestSchema>;

export function validatePadPilotModuleManifest(input: unknown) {
  const result = padPilotModuleManifestSchema.safeParse(input);
  if (result.success) return { success: true as const, manifest: result.data };
  return {
    success: false as const,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`),
  };
}

export function definePadPilotModuleManifest(input: unknown) {
  const result = validatePadPilotModuleManifest(input);
  if (!result.success) {
    throw new Error(`Invalid PadPilot Module manifest: ${result.issues.join("; ")}`);
  }
  return result.manifest;
}
