import { expect, test } from "bun:test";
import { validateProductionEvidence } from "./production-readiness.ts";

const now = Date.parse("2026-08-22T12:00:00Z");
const hash = "a".repeat(64);
const url = "https://evidence.example.invalid/run/1";

function evidence() {
  return {
    schemaVersion: 1,
    releaseVersion: "0.0.1",
    artifactSha256: hash,
    browserMatrix: { passed: true, completedAt: "2026-08-21T12:00:00Z", evidenceUrl: url, engines: ["chromium", "firefox", "webkit"], profiles: ["desktop", "touch-mobile"] },
    securityAssessment: { independent: true, completedAt: "2026-08-01T12:00:00Z", assessor: "External Security LLC", evidenceUrl: url, reportSha256: hash, unresolvedCritical: 0, unresolvedHigh: 0 },
    packageRelease: { compatibilityReviewed: true, privateSecurityReportingEnabled: true, securityPolicyUrl: url, maintainers: ["maintainer-a", "maintainer-b"] },
    canary: { environment: "production", passed: true, rollbackTested: true, durationMinutes: 60, trafficPercent: 5, completedAt: "2026-08-21T12:00:00Z", targetUrl: "https://canary.example.invalid", evidenceUrl: url },
    soak: { passed: true, gameSpecific: true, durationMinutes: 360, concurrentClients: 100, completedAt: "2026-08-21T12:00:00Z", gameBuildSha256: hash, evidenceUrl: url },
    incidentDrill: { passed: true, completedAt: "2026-08-21T12:00:00Z", evidenceUrl: url, scenarios: ["replay-store-partition", "cross-process-replay", "graceful-drain", "corrupt-backup", "encrypted-restore", "signing-key-rotation"] },
    multiplayerDeployment: { tls: true, sharedReplayStore: true, externalKeyManagement: true, remoteDurableStorage: true, autoscaling: true, multiRegionCoordination: true },
    operations: { primaryOnCall: "operator-a", secondaryOnCall: "operator-b", escalationPolicyUrl: url, runbookUrl: url, backupRestoreDrillAt: "2026-08-21T12:00:00Z" },
  };
}

test("package and MMO claims accept complete, current external evidence", () => {
  expect(validateProductionEvidence(evidence(), "package", "0.0.1", now)).toEqual([]);
  expect(validateProductionEvidence(evidence(), "mmo", "0.0.1", now)).toEqual([]);
});

test("MMO claims fail closed on local-only or stale operational evidence", () => {
  const candidate = evidence();
  candidate.browserMatrix.engines = ["chromium"];
  candidate.soak.durationMinutes = 30;
  candidate.securityAssessment.independent = false;
  candidate.multiplayerDeployment.sharedReplayStore = false;
  candidate.operations.secondaryOnCall = candidate.operations.primaryOnCall;
  candidate.canary.completedAt = "2025-01-01T00:00:00Z";
  const errors = validateProductionEvidence(candidate, "mmo", "0.0.1", now);
  expect(errors).toContain("browserMatrix.engines must include firefox.");
  expect(errors).toContain("browserMatrix.engines must include webkit.");
  expect(errors).toContain("securityAssessment.independent must equal true.");
  expect(errors).toContain("soak.durationMinutes must be at least 360.");
  expect(errors).toContain("multiplayerDeployment.sharedReplayStore must equal true.");
  expect(errors).toContain("operations.primaryOnCall and operations.secondaryOnCall must be different people.");
  expect(errors.some((error) => error.startsWith("canary.completedAt"))).toBe(true);
});
