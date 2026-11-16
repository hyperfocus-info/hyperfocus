import type { Database } from "bun:sqlite";
import { latestPluginUpdateQuery } from "@hyperfocus/pad-pilot/marketplace-schema";
import { getLatestPluginRelease, getPluginReleaseById } from "../db";
import {  isBundleIntegrityError,
  createPermitBoundFileStream,
  type createBundleIntegrityVerifier,
  type createInFlightLimiter,
} from "../module-transfer";
import { fail, json } from "../responses";
import { toSafeNameComponent } from "../safe-name";
import {
  existingRegularFile,
  maxPluginUpdateArtifactBytes,
} from "../server-utils";

type UpdateHandlerDependencies = {
  bundleIntegrity: ReturnType<typeof createBundleIntegrityVerifier>;
  clientIdentity: (request: Request) => string;
  downloadLimiter: ReturnType<typeof createInFlightLimiter>;
  enforceRateLimit: (
    scope: string,
    identity: string,
    limit: number,
    windowMs: number,
  ) => Response | null;
  transferBusyResponse: () => Response;
};

type UpdateStore = { db: Database };

export function createUpdateRouteHandlers(dependencies: UpdateHandlerDependencies) {
  const latest = ({ query, request, store }: {
    query: unknown;
    request: Request;
    store: UpdateStore;
  }) => {
    const limited = dependencies.enforceRateLimit(
      "update-check",
      dependencies.clientIdentity(request),
      600,
      60000,
    );
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
    if (!artifact || !manifest || manifest.size > 1048576) {
      return fail(503, "release_unavailable", "The selected plugin release is not fully staged.");
    }

    return json({
      arch: release.arch,
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
      publishedAt: release.published_at,
      releaseNotes: release.release_notes,
      requiresRestart: true,
      signature: release.signature || null,
      updateAvailable: true,
    });
  };

  const download = async ({ params, request, store }: {
    params: { releaseId: string };
    request: Request;
    store: UpdateStore;
  }) => {
    const limited = dependencies.enforceRateLimit(
      "update-download",
      dependencies.clientIdentity(request),
      120,
      60000,
    );
    if (limited) return limited;
    const release = getPluginReleaseById(store.db, params.releaseId);
    if (!release) return fail(404, "release_not_found", "No plugin release artifact was found.");

    const filePath = release.artifact_path || release.file_path;
    const artifactSizeBytes = release.artifact_size_bytes || release.file_size_bytes;
    const artifact = existingRegularFile(filePath, artifactSizeBytes);
    if (!artifact) return fail(404, "artifact_not_found", "The plugin release artifact is unavailable.");
    const releaseTransfer = dependencies.downloadLimiter.tryAcquire(dependencies.clientIdentity(request));
    if (!releaseTransfer) return dependencies.transferBusyResponse();

    let permitTransferredToResponse = false;
    try {
      const checksum = release.artifact_checksum_sha256 || release.checksum_sha256;
      const verifiedFile = await dependencies.bundleIntegrity.openVerified(
        filePath,
        checksum,
        artifactSizeBytes,
        maxPluginUpdateArtifactBytes,
      );
      const body = createPermitBoundFileStream(verifiedFile, artifactSizeBytes, releaseTransfer);
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
      if (isBundleIntegrityError(error)) {
        return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
      }
      throw error;
    } finally {
      if (!permitTransferredToResponse) releaseTransfer();
    }
  };

  const manifest = async ({ params, request, store }: {
    params: { releaseId: string };
    request: Request;
    store: UpdateStore;
  }) => {
    const limited = dependencies.enforceRateLimit(
      "update-manifest",
      dependencies.clientIdentity(request),
      300,
      60000,
    );
    if (limited) return limited;
    const release = getPluginReleaseById(store.db, params.releaseId);
    if (!release?.manifest_path) return fail(404, "manifest_not_found", "No plugin update manifest was found.");
    const manifestFile = existingRegularFile(release.manifest_path);
    if (!manifestFile || manifestFile.size > 1048576) {
      return fail(404, "manifest_not_found", "No plugin update manifest was found.");
    }

    const releaseTransfer = dependencies.downloadLimiter.tryAcquire(dependencies.clientIdentity(request));
    if (!releaseTransfer) return dependencies.transferBusyResponse();
    let permitTransferredToResponse = false;
    try {
      const verifiedFile = await dependencies.bundleIntegrity.openVerified(
        release.manifest_path,
        release.manifest_checksum_sha256,
        manifestFile.size,
        1048576,
      );
      const body = createPermitBoundFileStream(verifiedFile, manifestFile.size, releaseTransfer);
      permitTransferredToResponse = true;
      return new Response(body, {
        headers: {
          "content-length": `${manifestFile.size}`,
          "content-type": "application/json; charset=utf-8",
          etag: `"${release.manifest_checksum_sha256}"`,
          "x-padpilot-sha256": release.manifest_checksum_sha256,
        },
      });
    } catch (error) {
      if (isBundleIntegrityError(error)) {
        return fail(error.code === "bundle_not_found" ? 404 : 409, error.code, error.message);
      }
      throw error;
    } finally {
      if (!permitTransferredToResponse) releaseTransfer();
    }
  };

  return { download, latest, manifest };
}
