import { z } from "zod";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";
import { isValidCapabilityId, isValidModuleId } from "@hyperfocus/pad-pilot/module-identity";

const runtimeHostModeSchema = z.enum(["plugin", "standalone"]);
export const runtimeInfoSchema = z.object({
  arch: z.string().min(1).max(64),
  canApplyUpdates: z.boolean(),
  currentVersion: z.string().min(1).max(128),
  defaultInstallPath: z.string().max(32_768).nullable(),
  hostMode: runtimeHostModeSchema,
  installPath: z.string().max(32_768).nullable(),
  platform: z.string().min(1).max(64),
});

export const stagedPluginUpdateSchema = z.object({
  hostMode: runtimeHostModeSchema,
  logPath: z.string().max(32_768),
  message: z.string().max(4_096),
  targetVersion: z.string().min(1).max(128),
});

export const hostFilePickResultSchema = z.object({
  cancelled: z.boolean(),
  path: z.string().max(32_768),
}).refine((value) => value.cancelled || value.path.length > 0, "A selected host file requires a path.");

const hostImportedFileSchema = z.object({
  byteSize: z.number().int().positive().max(PADPILOT_FILE_IMPORT_MAX_BYTES),
  contentId: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  path: z.string().min(1).max(32_768),
});

export const installedModuleResultSchema = z.object({
  capabilities: z.array(z.string().refine(isValidCapabilityId)).max(64)
    .refine((values) => new Set(values).size === values.length, "Module capabilities must be unique.")
    .optional(),
  expectedModuleVersion: z.string().max(128).optional(),
  id: z.string().refine(isValidModuleId),
  loadErrorMessage: z.string().max(4_096).optional(),
  loadStatus: z.string().max(64).optional(),
  name: z.string().min(1).max(256),
  resolvedModuleVersion: z.string().max(128).optional(),
  scriptEntryPath: z.string().max(32_768).optional(),
  uiEntryPath: z.string().max(32_768).optional(),
  version: z.string().max(128).optional(),
});

export const fileImportBeginResultSchema = z.object({
  importId: z.string().trim().min(1).max(256),
});

export function parseNativeJson<T>(schema: z.ZodType<T>, payload: string, label: string) {
  try {
    return schema.parse(JSON.parse(payload));
  } catch (error) {
    throw new Error(`PadPilot native ${label} returned an invalid response.`, { cause: error });
  }
}

export function parseImportedHostFile(payload: string, maxBytes: number) {
  const imported = parseNativeJson(hostImportedFileSchema, payload, "file import");
  if (imported.byteSize > maxBytes) {
    throw new Error("PadPilot native file import exceeded the requested size limit.");
  }
  return imported;
}
