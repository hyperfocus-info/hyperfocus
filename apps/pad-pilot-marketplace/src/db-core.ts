import { createHash } from "node:crypto";

import { compareSemVer } from "@hyperfocus/pad-pilot/semver";

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(input: string | Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

export const compareVersions = compareSemVer;
