import { lstatSync } from "node:fs";
import { dirname } from "node:path";

import type { UserRow } from "./db";
import type { MarketplaceEnv } from "./env";
import { fail } from "./responses";
import { cookies } from "./auth/session";
import { resolveContainedFile } from "./static";
import { BoundedStreamLimitError, readBoundedStreamBytes } from "@hyperfocus/pad-pilot/bounded-stream";

export const maxMultipartOverheadBytes = 1024 * 1024;
export const maxPluginUpdateArtifactBytes = 256 * 1024 * 1024;
export const maxStripeWebhookBytes = 1024 * 1024;
const unsafeMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

function isLoopbackAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "::1" || normalized === "[::1]" || normalized === "localhost" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized) || /^::ffff:127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function rejectUnsafeDevelopmentRequest(
  request: Request,
  runtimeEnv: MarketplaceEnv,
  directAddress?: string,
) {
  const requestUrl = new URL(request.url);
  if (!isLoopbackAddress(directAddress ?? requestUrl.hostname)) {
    return fail(403, "development_only", "Development tools are restricted to the loopback interface.");
  }
  const expectedOrigin = runtimeEnv.publicOrigin ?? requestUrl.origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return fail(403, "invalid_request_origin", "Development tools require the local marketplace origin.");
  }
  return null;
}

export function marketplaceListenOptions(runtimeEnv: MarketplaceEnv) {
  return runtimeEnv.isDevelopment
    ? { hostname: "127.0.0.1", port: runtimeEnv.port }
    : { port: runtimeEnv.port };
}

export function requireAuthUser(user: UserRow | null) {
  return user
    ? { response: null, user }
    : { response: fail(401, "unauthorized", "Authentication required."), user: null };
}

export function rejectCrossOriginCookieMutation(request: Request, runtimeEnv: MarketplaceEnv) {
  if (
    !unsafeMethods.has(request.method.toUpperCase()) ||
    new URL(request.url).pathname === "/api/webhooks/stripe" ||
    !cookies(request).has("pp_session")
  ) {
    return null;
  }
  const expectedOrigin = runtimeEnv.publicOrigin ?? new URL(request.url).origin;
  return request.headers.get("origin") === expectedOrigin
    ? null
    : fail(403, "invalid_request_origin", "Authenticated mutations require the marketplace origin.");
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return null;
  }
  try {
    return await readBoundedStreamBytes(request.body, {
      label: "Request body",
      maxBytes,
    });
  } catch (error) {
    if (error instanceof BoundedStreamLimitError) {
      return null;
    }
    throw error;
  }
}

export async function readBoundedJson(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return {
      data: null,
      response: fail(415, "json_required", "Request body must use application/json."),
    };
  }
  const bytes = await readBoundedBody(request, maxBytes);
  if (!bytes) {
    return {
      data: null,
      response: fail(413, "request_too_large", `JSON request exceeded the ${maxBytes} byte limit.`),
    };
  }
  try {
    return {
      data: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      response: null,
    };
  } catch {
    return {
      data: null,
      response: fail(400, "invalid_json", "Request body was not valid JSON."),
    };
  }
}

export function existingRegularFile(filePath: string, expectedSize?: number) {
  try {
    if (!filePath) {
      return null;
    }
    const stats = lstatSync(filePath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (expectedSize !== undefined && stats.size !== expectedSize)
    ) {
      return null;
    }
    return { size: stats.size };
  } catch {
    return null;
  }
}

export function cleanupDraftModuleFiles(
  cleanupPaths: string[],
  uploadRoot: string,
  removeDirectory: (directory: string) => void,
) {
  const removedDirectories = new Set<string>();
  let cleanupPending = false;
  for (const cleanupPath of cleanupPaths) {
    const bundlePath = resolveContainedFile(uploadRoot, cleanupPath);
    if (!bundlePath) {
      cleanupPending = true;
      continue;
    }
    const versionDirectory = dirname(bundlePath);
    if (removedDirectories.has(versionDirectory)) {
      continue;
    }
    try {
      removeDirectory(versionDirectory);
    } catch {
      cleanupPending = true;
    }
    removedDirectories.add(versionDirectory);
  }
  return cleanupPending;
}
