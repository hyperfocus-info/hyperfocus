export type StandaloneRelease = {
  version: string;
  downloadUrl?: string;
  notesUrl?: string;
};

export type StandaloneUpdateSource = {
  getLatestRelease: (signal?: AbortSignal) => Promise<StandaloneRelease>;
};

export type StandaloneUpdateInstaller<TReceipt = unknown> = {
  installRelease: (release: StandaloneRelease, signal?: AbortSignal) => Promise<TReceipt>;
};

export type StandaloneUpdateResult =
  | { status: "disabled"; currentVersion: string }
  | { status: "current"; currentVersion: string; latest: StandaloneRelease }
  | { status: "available"; currentVersion: string; latest: StandaloneRelease };

/** Checks only when a consumer opts in; choosing when and how to install remains consumer-owned. */
export async function checkStandaloneUpdate(options: {
  enabled?: boolean;
  currentVersion: string;
  source: StandaloneUpdateSource;
  signal?: AbortSignal;
}): Promise<StandaloneUpdateResult> {
  if (!options.enabled) {
    return { status: "disabled", currentVersion: options.currentVersion };
  }
  const latest = await options.source.getLatestRelease(options.signal);
  return compareVersions(latest.version, options.currentVersion) > 0
    ? { status: "available", currentVersion: options.currentVersion, latest }
    : { status: "current", currentVersion: options.currentVersion, latest };
}

/** Applies only an already-discovered update that the embedding consumer explicitly approved. */
export async function installStandaloneUpdate<TReceipt>(options: {
  approved?: boolean;
  update: StandaloneUpdateResult;
  installer: StandaloneUpdateInstaller<TReceipt>;
  signal?: AbortSignal;
}) {
  if (!options.approved || options.update.status !== "available") {
    return { status: "skipped" as const };
  }
  const receipt = await options.installer.installRelease(options.update.latest, options.signal);
  return { status: "installed" as const, release: options.update.latest, receipt };
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.core.length, rightParts.core.length);
  for (let index = 0; index < length; index += 1) {
    const difference = compareNumericIdentifier(leftParts.core[index] ?? "0", rightParts.core[index] ?? "0");
    if (difference !== 0) return difference;
  }
  if (!leftParts.pre.length || !rightParts.pre.length) return Math.sign(Number(!leftParts.pre.length) - Number(!rightParts.pre.length));
  for (let index = 0; index < Math.max(leftParts.pre.length, rightParts.pre.length); index += 1) {
    const a = leftParts.pre[index];
    const b = rightParts.pre[index];
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return compareNumericIdentifier(a, b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

function parseVersion(version: string) {
  const value = version.trim();
  const match = value.length <= 256
    ? /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/i.exec(value)
    : null;
  if (!match?.[1]) {
    throw new Error(`Invalid version: ${version}`);
  }
  const core = match[1].split(".");
  const pre = match[2]?.split(".") ?? [];
  if ([...core, ...pre].some((part) => /^0\d+$/.test(part))) throw new Error(`Invalid version: ${version}`);
  return { core, pre };
}

function compareNumericIdentifier(left: string, right: string) {
  if (left.length !== right.length) return Math.sign(left.length - right.length);
  return left === right ? 0 : left < right ? -1 : 1;
}
