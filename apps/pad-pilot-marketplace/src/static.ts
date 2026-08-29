import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { marketplaceEnv as env, type MarketplaceEnv } from "./env";

function toNativeFilePath(filePath: string) {
  return process.platform === "win32" ? filePath.replace(/\//g, "\\") : filePath;
}

function isContainedPath(rootPath: string, candidatePath: string) {
  const childPath = relative(rootPath, candidatePath);
  return childPath !== ".." &&
    !childPath.startsWith(`..${sep}`) &&
    !isAbsolute(childPath);
}

export function resolveContainedFile(rootPath: string, requestedPath: string) {
  const root = resolve(toNativeFilePath(rootPath));
  const normalizedRequest = requestedPath.replaceAll("\\", "/");
  // Incoming values are URL paths. A leading slash means "from the static
  // root", not an absolute filesystem path (notably on Windows).
  const candidate = resolve(root, normalizedRequest.replace(/^\/+/, ""));
  if (!isContainedPath(root, candidate) || !existsSync(candidate)) {
    return null;
  }

  try {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    return isContainedPath(realRoot, realCandidate) && statSync(realCandidate).isFile()
      ? realCandidate
      : null;
  } catch {
    return null;
  }
}

const resolveExistingStaticFile = resolveContainedFile;

/**
 * Builds the static-check JSON payload for GET /api/dev/static-check.
 *
 * @param requestedPath - Requested path from query (default "/")
 * @returns Object with path existence info for debugging
 */
export function staticCheckResponse(requestedPath: string, runtimeEnv: MarketplaceEnv = env) {
  const distPrefixedPath = requestedPath.startsWith("/dist/")
    ? resolveExistingStaticFile(runtimeEnv.uiDistDir, requestedPath.slice("/dist/".length))
    : null;
  const distDirectPath = resolveExistingStaticFile(runtimeEnv.uiDistDir, requestedPath);
  const publicPath = resolveExistingStaticFile(runtimeEnv.uiPublicDir, requestedPath);

  return {
    requestedPath,
    distDirectPath,
    distDirectExists: distDirectPath !== null,
    distPrefixedPath,
    distPrefixedExists: distPrefixedPath !== null,
    publicPath,
    publicExists: publicPath !== null,
    uiIndexFilePath: resolveExistingStaticFile(
      runtimeEnv.uiDistDir,
      relative(resolve(runtimeEnv.uiDistDir), resolve(runtimeEnv.uiIndexFilePath)),
    ),
    uiIndexExists: existsSync(toNativeFilePath(runtimeEnv.uiIndexFilePath)),
  };
}

/**
 * Resolves and serves a static file: index, dist assets, or public assets.
 * Returns the file Response if found, otherwise null.
 *
 * @param path - Request path (e.g. "/", "/dist/main.js", "/favicon.ico")
 * @returns Response if file exists, null otherwise
 */
export async function serveStatic(path: string, runtimeEnv: MarketplaceEnv = env) {
  const indexPath = resolveExistingStaticFile(
    runtimeEnv.uiDistDir,
    relative(resolve(runtimeEnv.uiDistDir), resolve(runtimeEnv.uiIndexFilePath)),
  );
  if ((path === "/" || path === "/index.html") && indexPath) {
    return new Response(Bun.file(indexPath));
  }
  const staticPath = resolveExistingStaticFile(runtimeEnv.uiDistDir, path);
  if (staticPath) {
    return new Response(Bun.file(staticPath));
  }
  const publicPath = resolveExistingStaticFile(runtimeEnv.uiPublicDir, path);
  if (publicPath) {
    return new Response(Bun.file(publicPath));
  }
  return null;
}
