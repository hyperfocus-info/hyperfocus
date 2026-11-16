import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { z } from "zod";

export const swarmBillingWorkspaceId = "9725002b-c991-4e0e-bd48-fb4065ef5482";
const projectId = "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5";
const period = z.object({ start: z.string(), end: z.string() });
const money = z.number().finite().nonnegative();
const accountSchema = z.object({ data: z.object({ workspace: z.object({
  id: z.string(), name: z.string(), plan: z.enum(["FREE", "HOBBY", "PRO"]),
  customer: z.object({ state: z.string(), isTrialing: z.boolean(), appliedCredits: money,
    creditBalance: money, remainingUsageCreditBalance: z.number().finite(), currentUsage: money,
    billingPeriod: period, subscriptions: z.array(z.object({ status: z.string(),
      nextInvoiceCurrentTotal: z.number().int(), nextInvoiceDate: z.string(), cancelAtPeriodEnd: z.boolean() })) }),
}) }) });
const usageSchema = z.object({ billingPeriod: period, currentUsageDollars: money,
  currentBillDollars: money, estimatedBillDollars: money.nullable(), usageLimit: z.unknown(),
  lineItems: z.array(z.object({ label: z.string(), currentUsageDollars: money })) });
const limitSchema = z.object({ workspaceUsage: z.object({ currentUsageDollars: money,
  usageLimit: z.object({ hardLimit: money.nullish(), softLimit: money.nullish() }).nullable() }),
  agentUsage: z.object({ hardLimitDollars: money, totalUsedDollars: money }).nullable() });
const projectSchema = z.object({ currentUsageDollars: z.number().finite(),
  project: z.object({ id: z.string(), name: z.string() }),
  services: z.array(z.object({ id:z.string(),name:z.string(),totalDollars:money,
    cpuDollars:money,memoryDollars:money,egressDollars:money,volumeDollars:money,backupDollars:money })).default([]) });
const accountQuery = "query SwarmBillingReadOnly($workspaceId: String!) { workspace(workspaceId: $workspaceId) { id name plan customer { state isTrialing appliedCredits creditBalance remainingUsageCreditBalance currentUsage billingPeriod { start end } subscriptions { status nextInvoiceCurrentTotal nextInvoiceDate cancelAtPeriodEnd } } } }";

async function readCli(options: { cli: string; args: string[]; root: string }): Promise<unknown> {
  const child = spawnBackgroundProcess({ cmd: [options.cli, ...options.args], cwd: options.root,
    stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000, maxBuffer: 1_048_576 });
  const [stdout, , code] = await Promise.all([new Response(child.stdout).text(),
    new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`Read-only Railway billing lookup failed (${code}); credential details suppressed.`);
  try { return JSON.parse(stdout); } catch { throw new Error("Railway returned an invalid billing response; response details suppressed."); }
}

/** Queries only: no provisioning, credential mutation, limit changes or model calls. */
export async function inspectSwarmBilling(options: {
  railwayCli?: string; root: string;
  serviceIds?: string[];
  readJson?: (args: string[]) => Promise<unknown>;
}) {
  const cli = options.railwayCli ?? Bun.which("railway");
  if (!cli && !options.readJson) throw new Error("Railway CLI is unavailable. Supply --railway-cli <executable>.");
  const read = options.readJson ?? ((args: string[]) => readCli({ cli: cli!, args, root: options.root }));
  const workspace = ["--workspace", swarmBillingWorkspaceId];
  const [accountInput, usageInput, limitInput, projectInput] = await Promise.all([
    read(["api", accountQuery, "--raw-var", `workspaceId=${swarmBillingWorkspaceId}`, "--compact"]),
    read(["usage", ...workspace, "--period", "current", "--json"]),
    read(["usage", "limit", "status", ...workspace, "--json"]),
    read(["usage", "projects", "--project", projectId, ...workspace, "--period", "current", "--json"]),
  ]);
  const account = accountSchema.parse(accountInput).data.workspace;
  const usage = usageSchema.parse(usageInput), limits = limitSchema.parse(limitInput);
  const project = projectSchema.parse(projectInput);
  if (account.id !== swarmBillingWorkspaceId || project.project.id !== projectId) throw new Error("Railway billing response targets a different workspace or project.");
  const allowance = { FREE: 1, HOBBY: 5, PRO: 20 }[account.plan];
  // Use the greater reported usage when independently cached reads differ.
  const used = Math.max(usage.currentUsageDollars, account.customer.currentUsage,
    limits.workspaceUsage.currentUsageDollars, usage.lineItems.reduce((total, item) => total + item.currentUsageDollars, 0));
  return {
    capturedAt: new Date().toISOString(), mode: "read-only", workspace: { id: account.id, name: account.name },
    account: { plan: account.plan, state: account.customer.state, trial: account.customer.isTrialing,
      subscriptions: account.customer.subscriptions, purchasedOrPromotionalCreditBalanceUsd: account.customer.creditBalance,
      appliedCreditsUsd: account.customer.appliedCredits },
    billingPeriod: usage.billingPeriod, workspaceUsageUsd: used, hyperfocusProjectUsageUsd: project.currentUsageDollars,
    ...(options.serviceIds ? { deploymentUsage: {
      serviceIds: options.serviceIds,
      services: project.services.filter(service=>options.serviceIds!.includes(service.id)),
      reportedTotalUsd: project.services.filter(service=>options.serviceIds!.includes(service.id)).reduce((total,service)=>total+service.totalDollars,0),
      unreportedServiceIds: options.serviceIds.filter(id=>!project.services.some(service=>service.id===id)),
      limitation: "Provider-reported billing-period charges can lag. Missing services are unreported, not verified free. Sandbox admissions and measured runtime remain separate."
    }} : {}),
    includedUsage: { planAllowanceUsd: allowance, calculatedRemainingUsd: Math.max(0, allowance - used),
      sandboxEligible: true, reservedForSwarm: false,
      calculation: "Published plan allowance minus greatest reported current workspace usage. Usage may lag and unrelated services continue consuming the shared allowance.",
      undocumentedRemainingUsageCreditBalance: account.customer.remainingUsageCreditBalance,
      undocumentedFieldUsedAsDollars: false },
    reportedCurrentBillUsd: usage.currentBillDollars, reportedEstimatedBillUsd: usage.estimatedBillDollars,
    resourceLineItems: usage.lineItems, limits,
    swarmAuthorization: { computeTargetUsd: [3, 5], maximumComputeUsd: 10, maximumSeparatelyBilledInferenceUsd: 0,
      includedCreditsOnlyAssured: false, accountWideLimitChanges: false,
      inference: "Existing Codex ChatGPT subscription only; no separately billed API fallback." },
    warning: "Remaining included usage is a snapshot, not a reservation or guarantee of zero incremental billing. Do not provision until the intended spending fits the user's authorization.",
    sources: ["https://docs.railway.com/pricing/plans#included-usage", "https://docs.railway.com/pricing/plans#vm-pricing", "https://docs.railway.com/cli/usage"],
    mutationsPerformed: [], resourcesProvisioned: [], cloudExecutionVerified: false,
  };
}
