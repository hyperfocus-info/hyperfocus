import path from "node:path";
import { inspectOutcome } from "./check";
import { runCriterion } from "./run";
import { executeOutcome } from "./execute";
import methods from "./methods.json";

export function parseArguments(args: readonly string[]) {
  const values = new Map<string, string>();
  const receipts: string[] = [];
  let command: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--") { command = args.slice(index + 1); break; }
    if (flag === "--help") {
      if (args.length !== 1) throw new Error("Use --help alone.");
      return { mode: "help" } as const;
    }
    if (!["--check", "--run", "--execute", "--criterion", "--receipt", "--methods", "--root", "--timeout-ms"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}.`);
    if (flag === "--receipt") receipts.push(value);
    else { if (values.has(flag)) throw new Error(`Repeated option: ${flag}`); values.set(flag, value); }
  }
  const modes = ["--check", "--run", "--execute", "--methods"].filter(flag => values.has(flag));
  if (modes.length !== 1) throw new Error("Choose --check, --run, --execute or --methods.");
  const mode = modes[0]!, value = values.get(mode)!;
  if ((mode === "--execute") !== (command.length > 0)) throw Error("--execute requires -- followed by one command and its arguments; other modes do not execute trailing arguments.");
  if (mode === "--methods") {
    if (values.size !== 1 || receipts.length) throw new Error("Use --methods alone.");
    const selected = Object.entries(methods).find(([name]) => name === value)?.[1];
    if (!selected) throw new Error(`Choose a method: ${Object.keys(methods).join(", ")}`);
    return { mode: "methods", domain: value, selected } as const;
  }
  if (mode === "--run" ? !values.has("--criterion") || receipts.length > 0 : values.has("--criterion") || mode === "--check" && values.has("--timeout-ms")) throw new Error("--run needs --criterion; --receipt belongs to --check/--execute; --timeout-ms belongs to --run/--execute.");
  const timeoutMs = Number(values.get("--timeout-ms") ?? 120000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error("Invalid timeout.");
  return { mode: mode === "--execute" ? "execute" : mode === "--run" ? "run" : "check", root: path.resolve(values.get("--root") ?? process.cwd()), file: value, criterionId: values.get("--criterion") ?? "", timeoutMs, receipts, command } as const;
}

if (import.meta.main) {
  try {
    const options = parseArguments(Bun.argv.slice(2));
    if (options.mode === "help") console.log("bun run inspect:outcome --methods <domain>\nbun run inspect:outcome --check <contract.json> [--receipt <receipt.json> ...] [--root <root>]\nbun run inspect:outcome --run <contract.json> --criterion <id> [--timeout-ms 120000] [--root <root>]\nbun run inspect:outcome --execute <task.json> [--root <root>] [--timeout-ms 120000] [--receipt <approval.json>] -- <command> [args...]\nRead docs/agent-outcomes.md for schema and trust limits. --execute uses the same runtime checks as Harness: prerequisites, work, declared verification and outcome acceptance. Exit 0 meets the declared threshold, 1 fails execution/admission, 2 leaves acceptance unverified.");
    else if (options.mode === "methods") console.log(JSON.stringify({ domain: options.domain, ...options.selected }, null, 2));
    else if (options.mode === "execute") {
      const result = await executeOutcome(options);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.exitCode;
    }
    else if (options.mode === "run") {
      const result = await runCriterion(options);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.passed ? 0 : 1;
    } else {
      const result = await inspectOutcome(options);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.thresholdMet ? 0 : 1;
    }
  } catch (error) {
    console.log(JSON.stringify({ status: "invalid", error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
