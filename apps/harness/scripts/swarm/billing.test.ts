import { expect, test } from "bun:test";
import { inspectSwarmBilling, swarmBillingWorkspaceId } from "./billing";

function fixture(options: { usage?: number; cachedUsage?: number; workspaceId?: string } = {}) {
  const usage = options.usage ?? 3.435685565175617;
  const billingPeriod = { start: "2026-09-26T01:14:49Z", end: "2026-10-26T01:14:49Z" };
  const commands: string[][] = [];
  return { commands, readJson: async (args: string[]) => {
    commands.push(args);
    if (args[0] === "api") return { data: { workspace: {
      id: options.workspaceId ?? swarmBillingWorkspaceId, name: "Test workspace", plan: "HOBBY",
      billingSecret: "must-not-be-exported", customer: { state: "ACTIVE", isTrialing: false,
        appliedCredits: 0, creditBalance: 0, remainingUsageCreditBalance: 1,
        currentUsage: options.cachedUsage ?? usage, billingPeriod,
        subscriptions: [{ status: "active", nextInvoiceCurrentTotal: 500,
          nextInvoiceDate: billingPeriod.end, cancelAtPeriodEnd: false }] },
    } } };
    if (args[1] === "projects") return { currentUsageDollars: 0,
      project: { id: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", name: "hyperfocus" } };
    if (args[1] === "limit") return { workspaceUsage: { currentUsageDollars: usage, usageLimit: null },
      agentUsage: { hardLimitDollars: 5, totalUsedDollars: 0 } };
    return { billingPeriod, currentUsageDollars: usage, currentBillDollars: usage,
      estimatedBillDollars: 5.396448318912021, usageLimit: null,
      lineItems: [{ label: "Memory", currentUsageDollars: usage }] };
  } };
}

test("billing calculates shared included allowance without mistaking undocumented API balance for dollars", async () => {
  const source = fixture();
  const report = await inspectSwarmBilling({ root: process.cwd(), readJson: source.readJson });
  expect(report.includedUsage.calculatedRemainingUsd).toBeCloseTo(1.5643144348243831, 12);
  expect(report.includedUsage.undocumentedRemainingUsageCreditBalance).toBe(1);
  expect(report.includedUsage.reservedForSwarm).toBe(false);
  expect(report.swarmAuthorization.includedCreditsOnlyAssured).toBe(false);
  expect(report.swarmAuthorization.maximumSeparatelyBilledInferenceUsd).toBe(0);
  expect(JSON.stringify(report)).not.toContain("must-not-be-exported");
  expect(source.commands).toHaveLength(4);
  expect(source.commands.every(args => args[0] === "usage" || args[0] === "api" && args[1]?.startsWith("query "))).toBe(true);
  expect(source.commands.some(args => args.includes("set") || args.includes("mutation"))).toBe(false);
});

test("billing uses the more conservative cached usage and rejects a foreign workspace", async () => {
  const source = fixture({ usage: 3, cachedUsage: 6 });
  const report = await inspectSwarmBilling({ root: process.cwd(), readJson: source.readJson });
  expect(report.workspaceUsageUsd).toBe(6);
  expect(report.includedUsage.calculatedRemainingUsd).toBe(0);
  await expect(inspectSwarmBilling({ root: process.cwd(), readJson: fixture({ workspaceId: "different" }).readJson })).rejects.toThrow("different workspace");
});

test("deployment usage excludes unrelated services and distinguishes unreported charges",async()=>{
  const source=fixture();
  const report=await inspectSwarmBilling({root:process.cwd(),serviceIds:["coordinator","bridge"],readJson:async args=>{
    const value=await source.readJson(args);
    if(args[1]!=="projects")return value;
    const service={cpuDollars:0.01,memoryDollars:0.02,egressDollars:0,volumeDollars:0,backupDollars:0,totalDollars:0.03};
    return {...value,services:[{...service,id:"coordinator",name:"Swarm"},{...service,id:"unrelated",name:"Existing app",totalDollars:5}]};
  }});
  expect(report.deploymentUsage?.reportedTotalUsd).toBe(0.03);
  expect(report.deploymentUsage?.unreportedServiceIds).toEqual(["bridge"]);
  expect(report.deploymentUsage?.services).toHaveLength(1);
});
