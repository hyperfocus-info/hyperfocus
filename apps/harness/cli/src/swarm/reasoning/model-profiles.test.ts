import { expect, test } from "bun:test";
import { swarmSubscriptionProfiles, swarmWeeklyQuotaWindow } from "./model-profiles";

test("subscription phase defaults preserve requested intelligence and reject paid providers", () => {
  const profiles = swarmSubscriptionProfiles();
  expect(profiles.planning.modelId).toBe("gpt-6-astra");
  expect(profiles.planning.reasoning).toBe("xhigh");
  expect(profiles.review).toEqual(profiles.planning);
  expect(profiles.implementation.modelId).toBe("gpt-6.1-sol");
  expect(profiles.implementation.reasoning).toBe("high");
  expect(() => swarmSubscriptionProfiles(JSON.stringify({ ...profiles, review: { ...profiles.review, providerId: "openai" } }))).toThrow("subscription");
});

test("weekly quota detection uses window length and fails closed without reset metadata", () => {
  const status = { authenticated: true, available: true, plan: "pro", checkedAt: 1, separatelyBilledUsd: 0 as const,
    limits: { primary: { usedPercent: 17, windowDurationMins: 10080, resetsAt: 100 }, secondary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 50 } } };
  expect(swarmWeeklyQuotaWindow(status)).toEqual(status.limits.primary);
  expect(() => swarmWeeklyQuotaWindow({ ...status, limits: { primary: null, secondary: status.limits.secondary } })).toThrow("weekly");
  expect(() => swarmWeeklyQuotaWindow({ ...status, limits: { primary: { usedPercent: 1, windowDurationMins: 10080 }, secondary: null } })).toThrow("weekly");
});
