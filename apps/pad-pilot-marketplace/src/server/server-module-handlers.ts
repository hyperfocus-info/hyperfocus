import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { createModuleBody, moduleIdParams, semanticVersion } from "@hyperfocus/pad-pilot/marketplace-schema";
import {
  createModule,
  createModuleVersion,
  deleteDraftModule,
  finishDraftModuleDeletionCleanup,
  getDraftModuleDeletion,
  getLatestAccessibleVersion,
  getLatestDraftVersion,
  getLatestPublishedVersion,
  getModuleById,
  listModulesForUser,
  nowIso,
  publishModule,
  updateModuleTimestamp,
  type UserRow,
} from "../db";
import type { MarketplaceEnv } from "../env";
import {
  canDownloadModule,
  canViewModule,
  moduleDetailDto,
  moduleListDto,
} from "../modules";
import {  isBundleIntegrityError,
  createPermitBoundFileStream, isMultipartUploadError,
  streamModuleUploadToFile,
  type createBundleIntegrityVerifier,
  type createInFlightLimiter,
} from "../module-transfer";
import { fail, json } from "../responses";
import { toSafeNameComponent } from "../safe-name";
import { resolveContainedFile } from "../static";
import {
  cleanupDraftModuleFiles,
  maxMultipartOverheadBytes,
  readBoundedJson,
  requireAuthUser,
} from "../server-utils";

type ModuleStore = {
  db: Database;
  env: MarketplaceEnv;
  services: { removeDirectory: (directory: string) => void };
};
type ModuleContext = { authUser: UserRow | null; store: ModuleStore };
type ModuleRequestContext = ModuleContext & { request: Request };
type ModuleParamsContext = ModuleContext & { params: { moduleId: string } };
type ModuleRequestParamsContext = ModuleParamsContext & { request: Request };

type ModuleHandlerDependencies = {
  bundleIntegrity: ReturnType<typeof createBundleIntegrityVerifier>;
  clientIdentity: (request: Request) => string;
  downloadLimiter: ReturnType<typeof createInFlightLimiter>;
  enforceRateLimit: (scope: string, identity: string, limit: number, windowMs: number) => Response | null;
  transferBusyResponse: () => Response;
  uploadLimiter: ReturnType<typeof createInFlightLimiter>;
};

export function createModuleRouteHandlers(dependencies: ModuleHandlerDependencies) {
  const list = ({ store, authUser }: ModuleContext) => json({
    modules: listModulesForUser(store.db, authUser).map((row) =>
      moduleListDto(store.db, row, authUser, store.env.firstClassDiscountPercent)),
  });

  const detail = ({ params, store, authUser }: ModuleParamsContext) => {
    const parsed = moduleIdParams.safeParse(params);
    const moduleRow = getModuleById(store.db, parsed.success ? parsed.data.moduleId : "");
    if (!canViewModule(authUser, moduleRow)) return fail(404, "module_not_found", "Module not found.");
    return json({ module: moduleDetailDto(store.db, moduleRow!, authUser, store.env.firstClassDiscountPercent) });
  };

  const create = async ({ request, store, authUser }: ModuleRequestContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const limited = dependencies.enforceRateLimit("module-create", auth.user!.id, 30, 3600000);
    if (limited) return limited;
    const requestBody = await readBoundedJson(request, 16384);
    if (requestBody.response) return requestBody.response;
    const parsed = createModuleBody.safeParse(requestBody.data);
    if (!parsed.success) return fail(400, "invalid_name", parsed.error.errors[0]?.message ?? "Module name is required.");
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
      const duplicate = store.db.query("SELECT 1 FROM modules WHERE slug = ?").get(toSafeNameComponent(slug?.trim() || name));
      if (duplicate) return fail(409, "slug_exists", "A module with that slug already exists.");
      throw error;
    }
    const moduleRow = getModuleById(store.db, id);
    return json({ module: moduleDetailDto(store.db, moduleRow!, auth.user, store.env.firstClassDiscountPercent) }, { status: 201 });
  };

  const uploadVersion = async ({ params, request, store, authUser }: ModuleRequestParamsContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const limited = dependencies.enforceRateLimit("module-upload", auth.user!.id, 20, 3600000);
    if (limited) return limited;
    const parsed = moduleIdParams.safeParse(params);
    const moduleId = parsed.success ? parsed.data.moduleId : "";
    const moduleRow = getModuleById(store.db, moduleId);
    if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) return fail(404, "module_not_found", "Module not found.");
    const releaseTransfer = dependencies.uploadLimiter.tryAcquire(auth.user!.id);
    if (!releaseTransfer) return dependencies.transferBusyResponse();
    const versionId = crypto.randomUUID();
    const root = join(store.env.uploadRoot, moduleRow.id, versionId);
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
        return fail(400, "invalid_upload", parsedVersion.success
          ? "Upload requires a bundle and a changelog no longer than 8,000 characters."
          : parsedVersion.error.errors[0]?.message ?? "Version must be valid semantic version.");
      }
      if (extname(upload.bundleFilename).toLowerCase() !== ".zip") {
        return fail(400, "invalid_bundle_extension", "Module bundles must be .zip files.");
      }
      await dependencies.bundleIntegrity.remember(
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
      if (isMultipartUploadError(error)) return fail(error.status, error.code, error.message);
      const duplicate = store.db.query("SELECT 1 FROM module_versions WHERE module_id = ? AND version = ?")
        .get(moduleRow.id, requestedVersion);
      if (duplicate) return fail(409, "version_exists", "A version with that identifier already exists.");
      throw error;
    } finally {
      if (!persisted) rmSync(root, { force: true, recursive: true });
      releaseTransfer();
    }
  };

  const publish = async ({ params, store, authUser }: ModuleParamsContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const limited = dependencies.enforceRateLimit("module-publish", auth.user!.id, 60, 3600000);
    if (limited) return limited;
    const parsed = moduleIdParams.safeParse(params);
    const moduleId = parsed.success ? parsed.data.moduleId : "";
    const moduleRow = getModuleById(store.db, moduleId);
    if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) return fail(404, "module_not_found", "Module not found.");
    const releaseTransfer = dependencies.uploadLimiter.tryAcquire(auth.user!.id);
    if (!releaseTransfer) return dependencies.transferBusyResponse();
    try {
      const draftVersion = getLatestDraftVersion(store.db, moduleId);
      if (draftVersion) {
        const bundlePath = resolveContainedFile(store.env.uploadRoot, draftVersion.bundle_path);
        if (!bundlePath) return fail(404, "bundle_not_found", "The publishable bundle is unavailable.");
        await dependencies.bundleIntegrity.verify(
          bundlePath,
          draftVersion.checksum_sha256,
          draftVersion.file_size_bytes,
          store.env.maxUploadBytes,
        );
      }
      publishModule(store.db, moduleId, auth.user!.id, nowIso(), draftVersion?.id);
    } catch (error) {
      if (isBundleIntegrityError(error)) {
        return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
      }
      if (error instanceof Error && error.message.includes("draft version")) return fail(409, "version_required", error.message);
      if (error instanceof Error && error.message.includes("publication integrity")) return fail(409, "version_changed", error.message);
      throw error;
    } finally {
      releaseTransfer();
    }
    return json({ ok: true });
  };

  const remove = ({ params, store, authUser }: ModuleParamsContext) => {
    const auth = requireAuthUser(authUser);
    if (auth.response) return auth.response;
    const limited = dependencies.enforceRateLimit("module-delete-draft", auth.user!.id, 30, 3600000);
    if (limited) return limited;
    const parsed = moduleIdParams.safeParse(params);
    const moduleId = parsed.success ? parsed.data.moduleId : "";
    const moduleRow = getModuleById(store.db, moduleId);
    const priorDeletion = moduleRow ? null : getDraftModuleDeletion(store.db, moduleId, auth.user!.id);
    if (!moduleRow || moduleRow.owner_user_id !== auth.user!.id) {
      if (!priorDeletion) return fail(404, "module_not_found", "Module not found.");
      const cleanupPending = cleanupDraftModuleFiles(priorDeletion.cleanupPaths, store.env.uploadRoot, store.services.removeDirectory);
      if (!cleanupPending && priorDeletion.cleanupPaths.length > 0) finishDraftModuleDeletionCleanup(store.db, moduleId, auth.user!.id);
      return json({ alreadyDeleted: true, cleanupPending, ok: true });
    }
    if (moduleRow.visibility !== "draft") {
      return fail(409, "module_published", "Published modules cannot be deleted through draft rollback.");
    }
    const deletion = deleteDraftModule(store.db, moduleId, auth.user!.id);
    const cleanupPaths = deletion?.cleanupPaths ?? [];
    const cleanupPending = cleanupDraftModuleFiles(cleanupPaths, store.env.uploadRoot, store.services.removeDirectory);
    if (!cleanupPending && cleanupPaths.length > 0) finishDraftModuleDeletionCleanup(store.db, moduleId, auth.user!.id);
    return json({ cleanupPending, ok: true });
  };

  const download = async ({ params, request, store, authUser }: ModuleRequestParamsContext) => {
    const limited = dependencies.enforceRateLimit("module-download", authUser?.id ?? dependencies.clientIdentity(request), 240, 60000);
    if (limited) return limited;
    const parsed = moduleIdParams.safeParse(params);
    const moduleId = parsed.success ? parsed.data.moduleId : "";
    const moduleRow = getModuleById(store.db, moduleId);
    if (!canViewModule(authUser, moduleRow)) return fail(404, "module_not_found", "Module not found.");
    if (!canDownloadModule(store.db, authUser, moduleRow)) {
      return fail(403, "purchase_required", "Purchase or entitlement is required to download this module.");
    }
    const version = moduleRow?.owner_user_id === authUser?.id
      ? getLatestAccessibleVersion(store.db, moduleId, authUser)
      : getLatestPublishedVersion(store.db, moduleId);
    if (!version) return fail(404, "version_not_found", "No downloadable bundle found.");
    const bundlePath = resolveContainedFile(store.env.uploadRoot, version.bundle_path);
    if (!bundlePath) return fail(404, "bundle_not_found", "The downloadable bundle is unavailable.");
    const releaseTransfer = dependencies.downloadLimiter.tryAcquire(authUser?.id ?? dependencies.clientIdentity(request));
    if (!releaseTransfer) return dependencies.transferBusyResponse();
    let permitTransferredToResponse = false;
    try {
      const verifiedFile = await dependencies.bundleIntegrity.openVerified(
        bundlePath,
        version.checksum_sha256,
        version.file_size_bytes,
        store.env.maxUploadBytes,
      );
      const attachmentName = `${toSafeNameComponent(moduleRow!.slug)}-${toSafeNameComponent(version.version)}.zip`;
      const body = createPermitBoundFileStream(verifiedFile, version.file_size_bytes, releaseTransfer);
      permitTransferredToResponse = true;
      return new Response(body, { headers: {
        "content-disposition": `attachment; filename="${attachmentName}"`,
        "content-length": `${version.file_size_bytes}`,
        "content-type": "application/zip",
        etag: `"${version.checksum_sha256}"`,
        "x-padpilot-sha256": version.checksum_sha256,
      } });
    } catch (error) {
      if (isBundleIntegrityError(error)) {
        return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
      }
      throw error;
    } finally {
      if (!permitTransferredToResponse) releaseTransfer();
    }
  };

  return { create, detail, download, list, publish, remove, uploadVersion };
}
