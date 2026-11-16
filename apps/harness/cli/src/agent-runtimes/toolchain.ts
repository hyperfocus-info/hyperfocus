import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveBundledBunPath as resolveBun } from "@hyperfocus/ai-runtime/quality/commands";

export function resolveBundledBunPath(input: { rootPath?: string; platform?: NodeJS.Platform } = {}) {
  return resolveBun({ ...input, resolutionBase: import.meta.url });
}

const RIPGREP_PACKAGE = "@vscode/ripgrep";

export function resolveBundledRipgrepPath(input: { rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const rootPath = input.rootPath ?? process.cwd();
  const binaryName = input.platform === "win32" || (!input.platform && process.platform === "win32") ? "rg.exe" : "rg";
  const candidates = [
    path.join(rootPath, "bin", binaryName),
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "bin", binaryName),
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "rg.exe"),
    path.join(rootPath, "node_modules", RIPGREP_PACKAGE, "rg")
  ];

  const legacyPath = candidates.find((candidate) => existsSync(candidate));
  if (legacyPath) {
    return legacyPath;
  }

  const requestedPlatform = input.platform ?? process.platform;
  return !input.rootPath && requestedPlatform === process.platform
    ? resolveInstalledRipgrepPath(requestedPlatform, process.arch, binaryName)
    : undefined;
}

function resolveInstalledRipgrepPath(platform: NodeJS.Platform, architecture: string, binaryName: string) {
  try {
    const localRequire = createRequire(import.meta.url);
    const packageEntry = localRequire.resolve(RIPGREP_PACKAGE);
    const packageRequire = createRequire(packageEntry);
    const resolved = packageRequire.resolve(`@vscode/ripgrep-${platform}-${architecture}/bin/${binaryName}`);
    return existsSync(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export function buildToolchainPath(input: { basePath?: string; rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const rgPath = resolveBundledRipgrepPath(input);
  const bunPath = resolveBundledBunPath(input);
  let nextPath = input.basePath ?? Bun.env.PATH ?? "";
  if (bunPath) nextPath = prependPath(path.dirname(bunPath), nextPath, input.platform);
  if (rgPath) nextPath = prependPath(path.dirname(rgPath), nextPath, input.platform);
  return nextPath || input.basePath;
}

export function applyHarnessToolchainToProcessEnv(input: { rootPath?: string; platform?: NodeJS.Platform } = {}) {
  const nextPath = buildToolchainPath({
    basePath: Bun.env.PATH,
    rootPath: input.rootPath,
    platform: input.platform
  });
  if (nextPath) {
    Bun.env.PATH = nextPath;
    process.env.PATH = nextPath;
  }
}

function prependPath(entry: string, basePath: string, platform: NodeJS.Platform | undefined) {
  const delimiter = platform === "win32" || (!platform && process.platform === "win32") ? ";" : ":";
  const entries = basePath.split(delimiter).filter(Boolean);
  if (entries.some((value) => value.toLowerCase() === entry.toLowerCase())) {
    return basePath;
  }
  return [entry, ...entries].join(delimiter);
}
