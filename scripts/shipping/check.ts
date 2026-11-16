import { resolve } from "node:path";
import { isShippingTarget, profiles } from "./profiles";
import { runShippingCheck } from "./runner";

export function parseShippingArguments(args: readonly string[]) {
  const flags = new Set<string>();
  let target: string | undefined;
  for (const arg of args) {
    if (["--help", "--list", "--plan", "--json"].includes(arg)) {
      if (flags.has(arg)) throw new Error(`Repeated option: ${arg}`);
      flags.add(arg);
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (target) throw new Error(`Unexpected argument: ${arg}`);
    else target = arg;
  }
  if (target && !isShippingTarget(target)) throw new Error(`Unknown target: ${target}`);
  const informational = flags.has("--help") || flags.has("--list");
  if (informational && (target || flags.has("--plan") || flags.has("--help") && flags.has("--list"))) {
    throw new Error("Use --help or --list without a target or --plan.");
  }
  if (flags.has("--help")) return { mode: "help", json: flags.has("--json") } as const;
  if (flags.has("--list")) return { mode: "list", json: flags.has("--json") } as const;
  if (!target || !isShippingTarget(target)) throw new Error("Choose a target; use --list to see shipping profiles.");
  return { mode: "check", target, plan: flags.has("--plan"), json: flags.has("--json") } as const;
}

const help = "Usage: bun run ship-check <target> [--plan] [--json]\n       bun run ship-check --list | --help\n\nRuns existing checks sequentially and stops at the first failure. --plan validates references without running commands.\nA passing report proves only its listed automated checks; remaining release acceptance always applies.\nNever publishes, deploys, installs validators, or copies plugins into a host.";

async function main() {
  try {
    const options = parseShippingArguments(process.argv.slice(2));
    if (options.mode === "help") { console.log(options.json ? JSON.stringify({ help }) : help); return; }
    if (options.mode === "list") {
      const targets = Object.entries(profiles).map(([target, profile]) => ({ target, description: profile.description }));
      console.log(options.json ? JSON.stringify({ targets }, null, 2) : targets.map((item) => `${item.target}: ${item.description}`).join("\n"));
      return;
    }
    const report = await runShippingCheck({ root: resolve(import.meta.dir, "../.."), target: options.target, plan: options.plan });
    console.log(options.json ? JSON.stringify(report, null, 2) : [
      `${report.target}: ${report.status} (${report.durationMs} ms)`,
      ...report.steps.map((step) => `  ${step.status}: ${step.command}${step.exitCode === null ? "" : ` [exit ${step.exitCode}, ${step.durationMs} ms]`}`),
      ...(report.error ? [report.error] : []),
      "Remaining release acceptance:",
      ...report.remainingAcceptance.map((item) => `  - ${item}`),
      `References: ${report.documents.join(", ")}`,
    ].join("\n"));
    process.exitCode = report.status === "failed" ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes("--json")) console.log(JSON.stringify({ status: "failed", error: message }));
    else console.error(message);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
