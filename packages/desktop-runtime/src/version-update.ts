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
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function parseVersion(version: string) {
  const match = version.trim().replace(/^v/i, "").match(/^\d+(?:\.\d+)*/)?.[0];
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }
  return match.split(".").map(Number);
}
