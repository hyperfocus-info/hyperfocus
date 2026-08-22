import { manageBunDependencies, type BunDependencyRequest, type DependencySection } from "./bun-dependencies.ts";
import { runEditorAgentDriver } from "./agent-driver.ts";

export async function runEditorCli(args: string[]) {
  const command = args[0];
  if (!command || command === "serve" || command === "dev") {
    await import("./server.ts");
    return;
  }
  if (command === "deps") {
    const result = await manageBunDependencies(parseDependencyArgs(args.slice(1)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "agent") {
    const values = parseOptions(args.slice(1));
    validateValuedOptions(values, ["cdp", "url", "plan", "out"]);
    if (values.positionals.length) throw new Error("agent accepts only --cdp, --url, --plan, and --out options.");
    for (const name of values.values.keys()) if (!["cdp", "url", "plan", "out"].includes(name)) throw new Error(`Unknown agent option: --${name}`);
    const result = await runEditorAgentDriver({
      cdpUrl: value(values, "cdp") ?? "http://127.0.0.1:9222",
      editorUrl: value(values, "url"),
      planPath: value(values, "plan"),
      outputPath: value(values, "out"),
    });
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
    if (next && !next.startsWith("--") && ["project", "cdp", "url", "plan", "out"].includes(rawName)) { parsed.values.set(rawName, next); index += 1; }
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

function helpText() {
  return `Hyperfocus Editor\n\n  hyperfocus-editor serve\n  hyperfocus-editor deps list --project <directory>\n  hyperfocus-editor deps install --project <directory> [--frozen]\n  hyperfocus-editor deps add <package...> --project <directory> [--dev|--optional|--peer] [--exact] [--trust]\n  hyperfocus-editor deps remove <package...> --project <directory>\n  hyperfocus-editor agent [--cdp http://127.0.0.1:9222] [--url http://127.0.0.1:8796] [--plan plan.json|-] [--out handoff.json]\n`;
}
