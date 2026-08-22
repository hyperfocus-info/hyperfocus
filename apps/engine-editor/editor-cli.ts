import { manageBunDependencies, type BunDependencyRequest, type DependencySection } from "./bun-dependencies.ts";
import { runEditorAgentDriver } from "./agent-driver.ts";
import { readEditorCommandPlan, runHeadlessEditorPlan, snapshotHeadlessEditorProject } from "./headless-editor.ts";

export async function runEditorCli(args: string[]) {
  const command = args[0];
  if (!command || command === "serve" || command === "dev") {
    const { startEditorServer } = await import("./server.ts");
    startEditorServer();
    return;
  }
  if (command === "deps") {
    const result = await manageBunDependencies(parseDependencyArgs(args.slice(1)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "agent") {
    const values = parseOptions(args.slice(1));
    validateValuedOptions(values, ["project", "api", "cdp", "url", "plan", "out"]);
    if (values.positionals.length) throw new Error("agent accepts only named options.");
    for (const name of values.values.keys()) if (!["project", "api", "cdp", "url", "plan", "out", "no-persist"].includes(name)) throw new Error(`Unknown agent option: --${name}`);
    const projectRoot = value(values, "project");
    const planPath = value(values, "plan");
    const api = value(values, "api");
    const cdp = value(values, "cdp");
    if (cdp && (projectRoot || api)) throw new Error("Choose the direct project/API agent path or --cdp, not both.");
    if (api && !projectRoot) throw new Error("--api requires --project.");
    const result = cdp
      ? await runEditorAgentDriver({ cdpUrl: cdp, editorUrl: value(values, "url"), planPath, outputPath: undefined })
      : api
        ? await runAgentApi({ api, projectRoot: projectRoot!, planPath, persist: !flag(values, "no-persist") })
        : projectRoot
          ? planPath
            ? await runHeadlessEditorPlan({ projectRoot, plan: await readEditorCommandPlan(planPath), persist: !flag(values, "no-persist") })
            : await snapshotHeadlessEditorProject(projectRoot)
          : (() => { throw new Error("agent requires --project for direct operation, --api with --project, or --cdp for visual compatibility."); })();
    const outputPath = value(values, "out");
    if (outputPath) await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(helpText());
    return;
  }
  throw new Error(`Unknown hyperfocus-editor command: ${command}\n\n${helpText()}`);
}

export function parseDependencyArgs(args: string[]): BunDependencyRequest {
  const command = args[0] as BunDependencyRequest["command"] | undefined;
  if (!command || !["list", "install", "add", "remove"].includes(command)) throw new Error("deps requires one of: list, install, add, remove.");
  const values = parseOptions(args.slice(1));
  validateValuedOptions(values, ["project"]);
  const allowed = new Set(["project", "frozen", "dev", "optional", "peer", "exact", "trust"]);
  for (const name of values.values.keys()) if (!allowed.has(name)) throw new Error(`Unknown deps option: --${name}`);
  const project = value(values, "project") ?? process.cwd();
  const packages = values.positionals;
  if (command === "list") {
    if (packages.length || [...values.values.keys()].some((name) => name !== "project")) throw new Error("deps list accepts only --project.");
    return { command, project };
  }
  if (command === "install") {
    if (packages.length || [...values.values.keys()].some((name) => !["project", "frozen"].includes(name))) throw new Error("deps install accepts only --project and --frozen.");
    return { command, project, frozen: flag(values, "frozen") };
  }
  if (command === "remove") {
    if ([...values.values.keys()].some((name) => name !== "project")) throw new Error("deps remove accepts only package names and --project.");
    return { command, project, packages };
  }
  const sectionFlags = ["dev", "optional", "peer"].filter((name) => flag(values, name));
  if (sectionFlags.length > 1) throw new Error("Choose only one dependency section: --dev, --optional, or --peer.");
  const section: DependencySection = flag(values, "dev") ? "devDependencies" : flag(values, "optional") ? "optionalDependencies" : flag(values, "peer") ? "peerDependencies" : "dependencies";
  return { command, project, packages, section, exact: flag(values, "exact"), trust: flag(values, "trust") };
}

type ParsedOptions = { positionals: string[]; values: Map<string, string | true> };

function parseOptions(args: string[]): ParsedOptions {
  const parsed: ParsedOptions = { positionals: [], values: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith("--")) { parsed.positionals.push(token); continue; }
    const [rawName, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) { parsed.values.set(rawName, inline); continue; }
    const next = args[index + 1];
    if (next && !next.startsWith("--") && ["project", "api", "cdp", "url", "plan", "out"].includes(rawName)) { parsed.values.set(rawName, next); index += 1; }
    else parsed.values.set(rawName, true);
  }
  return parsed;
}

function value(options: ParsedOptions, name: string) {
  const result = options.values.get(name);
  return typeof result === "string" ? result : undefined;
}

function flag(options: ParsedOptions, name: string) { return options.values.get(name) === true; }

function validateValuedOptions(options: ParsedOptions, names: readonly string[]) {
  for (const name of names) if (options.values.get(name) === true) throw new Error(`--${name} requires a value.`);
}

async function runAgentApi(options: { api: string; projectRoot: string; planPath?: string; persist: boolean }) {
  const base = options.api.replace(/\/$/, "");
  const response = options.planPath
    ? await fetch(`${base}/api/agent/v1/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectRoot: options.projectRoot, plan: await readEditorCommandPlan(options.planPath), persist: options.persist }),
    })
    : await fetch(`${base}/api/agent/v1/project?root=${encodeURIComponent(options.projectRoot)}`);
  const result = await response.json() as unknown;
  if (!response.ok && response.status !== 422) throw new Error(`Editor agent API failed with HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

function helpText() {
  return `Hyperfocus Editor\n\n  hyperfocus-editor serve\n  hyperfocus-editor deps list --project <directory>\n  hyperfocus-editor deps install --project <directory> [--frozen]\n  hyperfocus-editor deps add <package...> --project <directory> [--dev|--optional|--peer] [--exact] [--trust]\n  hyperfocus-editor deps remove <package...> --project <directory>\n  hyperfocus-editor agent --project <directory> [--plan commands.json|-] [--no-persist] [--out handoff.json]\n  hyperfocus-editor agent --api http://127.0.0.1:8796 --project <directory> [--plan commands.json|-]\n  hyperfocus-editor agent --cdp http://127.0.0.1:9222 [--url http://127.0.0.1:8796] [--plan ui-actions.json|-]\n`;
}
