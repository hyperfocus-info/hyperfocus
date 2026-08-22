export type ProductionClaim = "package" | "mmo";

type JsonRecord = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60_000;
const INCIDENT_SCENARIOS = [
  "replay-store-partition",
  "cross-process-replay",
  "graceful-drain",
  "corrupt-backup",
  "encrypted-restore",
  "signing-key-rotation",
] as const;

/** Validates release evidence without treating a local test run as production proof. */
export function validateProductionEvidence(
  input: unknown,
  claim: ProductionClaim,
  expectedVersion: string,
  now = Date.now(),
): string[] {
  const errors: string[] = [];
  const root = record(input, "evidence", errors);
  equal(root.schemaVersion, 1, "schemaVersion", errors);
  equal(root.releaseVersion, expectedVersion, "releaseVersion", errors);
  sha256(root.artifactSha256, "artifactSha256", errors);

  const browsers = record(root.browserMatrix, "browserMatrix", errors);
  equal(browsers.passed, true, "browserMatrix.passed", errors);
  recentDate(browsers.completedAt, "browserMatrix.completedAt", 30, now, errors);
  httpsUrl(browsers.evidenceUrl, "browserMatrix.evidenceUrl", errors);
  includesAll(browsers.engines, ["chromium", "firefox", "webkit"], "browserMatrix.engines", errors);
  includesAll(browsers.profiles, ["desktop", "touch-mobile"], "browserMatrix.profiles", errors);

  const security = record(root.securityAssessment, "securityAssessment", errors);
  equal(security.independent, true, "securityAssessment.independent", errors);
  recentDate(security.completedAt, "securityAssessment.completedAt", 365, now, errors);
  nonEmpty(security.assessor, "securityAssessment.assessor", errors);
  httpsUrl(security.evidenceUrl, "securityAssessment.evidenceUrl", errors);
  sha256(security.reportSha256, "securityAssessment.reportSha256", errors);
  equal(security.unresolvedCritical, 0, "securityAssessment.unresolvedCritical", errors);
  equal(security.unresolvedHigh, 0, "securityAssessment.unresolvedHigh", errors);

  const packageRelease = record(root.packageRelease, "packageRelease", errors);
  equal(packageRelease.compatibilityReviewed, true, "packageRelease.compatibilityReviewed", errors);
  equal(packageRelease.privateSecurityReportingEnabled, true, "packageRelease.privateSecurityReportingEnabled", errors);
  httpsUrl(packageRelease.securityPolicyUrl, "packageRelease.securityPolicyUrl", errors);
  stringArrayAtLeast(packageRelease.maintainers, 2, "packageRelease.maintainers", errors, true);

  if (claim === "mmo") validateMmoEvidence(root, now, errors);
  return errors;
}

function validateMmoEvidence(root: JsonRecord, now: number, errors: string[]): void {
  const canary = record(root.canary, "canary", errors);
  equal(canary.environment, "production", "canary.environment", errors);
  equal(canary.passed, true, "canary.passed", errors);
  equal(canary.rollbackTested, true, "canary.rollbackTested", errors);
  minimum(canary.durationMinutes, 30, "canary.durationMinutes", errors);
  range(canary.trafficPercent, 0.01, 25, "canary.trafficPercent", errors);
  recentDate(canary.completedAt, "canary.completedAt", 30, now, errors);
  httpsUrl(canary.targetUrl, "canary.targetUrl", errors);
  httpsUrl(canary.evidenceUrl, "canary.evidenceUrl", errors);

  const soak = record(root.soak, "soak", errors);
  equal(soak.passed, true, "soak.passed", errors);
  equal(soak.gameSpecific, true, "soak.gameSpecific", errors);
  minimum(soak.durationMinutes, 360, "soak.durationMinutes", errors);
  minimum(soak.concurrentClients, 2, "soak.concurrentClients", errors);
  recentDate(soak.completedAt, "soak.completedAt", 30, now, errors);
  sha256(soak.gameBuildSha256, "soak.gameBuildSha256", errors);
  httpsUrl(soak.evidenceUrl, "soak.evidenceUrl", errors);

  const incident = record(root.incidentDrill, "incidentDrill", errors);
  equal(incident.passed, true, "incidentDrill.passed", errors);
  recentDate(incident.completedAt, "incidentDrill.completedAt", 90, now, errors);
  httpsUrl(incident.evidenceUrl, "incidentDrill.evidenceUrl", errors);
  includesAll(incident.scenarios, INCIDENT_SCENARIOS, "incidentDrill.scenarios", errors);

  const multiplayer = record(root.multiplayerDeployment, "multiplayerDeployment", errors);
  for (const field of ["tls", "sharedReplayStore", "externalKeyManagement", "remoteDurableStorage", "autoscaling", "multiRegionCoordination"] as const) {
    equal(multiplayer[field], true, `multiplayerDeployment.${field}`, errors);
  }

  const operations = record(root.operations, "operations", errors);
  nonEmpty(operations.primaryOnCall, "operations.primaryOnCall", errors);
  nonEmpty(operations.secondaryOnCall, "operations.secondaryOnCall", errors);
  if (operations.primaryOnCall === operations.secondaryOnCall && typeof operations.primaryOnCall === "string") {
    errors.push("operations.primaryOnCall and operations.secondaryOnCall must be different people.");
  }
  httpsUrl(operations.escalationPolicyUrl, "operations.escalationPolicyUrl", errors);
  httpsUrl(operations.runbookUrl, "operations.runbookUrl", errors);
  recentDate(operations.backupRestoreDrillAt, "operations.backupRestoreDrillAt", 90, now, errors);
}

function record(value: unknown, label: string, errors: string[]): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as JsonRecord;
  errors.push(`${label} must be an object.`);
  return {};
}

function equal(value: unknown, expected: unknown, label: string, errors: string[]): void {
  if (value !== expected) errors.push(`${label} must equal ${JSON.stringify(expected)}.`);
}

function nonEmpty(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${label} must be a non-empty string.`);
}

function sha256(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || !/^[a-f\d]{64}$/i.test(value)) errors.push(`${label} must be a 64-character SHA-256 digest.`);
}

function httpsUrl(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string") { errors.push(`${label} must be an HTTPS URL.`); return; }
  try { if (new URL(value).protocol !== "https:") errors.push(`${label} must be an HTTPS URL.`); }
  catch { errors.push(`${label} must be an HTTPS URL.`); }
}

function recentDate(value: unknown, label: string, maximumAgeDays: number, now: number, errors: string[]): void {
  if (typeof value !== "string") { errors.push(`${label} must be an ISO timestamp.`); return; }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) { errors.push(`${label} must be an ISO timestamp.`); return; }
  if (timestamp > now + 5 * 60_000 || now - timestamp > maximumAgeDays * DAY_MS) {
    errors.push(`${label} must be no more than ${maximumAgeDays} days old and not in the future.`);
  }
}

function includesAll(value: unknown, required: readonly string[], label: string, errors: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${label} must be a string array containing ${required.join(", ")}.`);
    return;
  }
  for (const item of required) if (!value.includes(item)) errors.push(`${label} must include ${item}.`);
}

function stringArrayAtLeast(value: unknown, count: number, label: string, errors: string[], distinct = false): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    errors.push(`${label} must be an array of non-empty strings.`);
    return;
  }
  const size = distinct ? new Set(value).size : value.length;
  if (size < count) errors.push(`${label} must contain at least ${count}${distinct ? " distinct" : ""} entries.`);
}

function minimum(value: unknown, minimumValue: number, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimumValue) errors.push(`${label} must be at least ${minimumValue}.`);
}

function range(value: unknown, minimumValue: number, maximumValue: number, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimumValue || value > maximumValue) {
    errors.push(`${label} must be from ${minimumValue} through ${maximumValue}.`);
  }
}

if (import.meta.main) {
  const claimArgument = process.argv.find((argument) => argument.startsWith("--claim="))?.slice("--claim=".length);
  const claim = claimArgument === "package" || claimArgument === "mmo" ? claimArgument : undefined;
  const evidencePath = process.argv.find((argument) => argument.startsWith("--evidence="))?.slice("--evidence=".length)
    ?? process.env.RELEASE_EVIDENCE_FILE;
  if (!claim || !evidencePath) {
    console.error("Usage: bun scripts/production-readiness.ts --claim=package|mmo --evidence=<release-evidence.json>");
    process.exitCode = 2;
  } else {
    try {
      const packageDocument = await Bun.file(new URL("../package.json", import.meta.url)).json() as { version: string };
      const evidence = await Bun.file(evidencePath).json();
      const errors = validateProductionEvidence(evidence, claim, packageDocument.version);
      if (errors.length > 0) throw new Error(`Production readiness evidence rejected:\n- ${errors.join("\n- ")}`);
      console.log(`Production readiness evidence accepted for ${claim} ${packageDocument.version}.`);
    } catch (cause) {
      console.error(cause instanceof Error ? cause.message : String(cause));
      process.exitCode = 1;
    }
  }
}
