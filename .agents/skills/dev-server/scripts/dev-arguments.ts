import { resolveDevSurface } from "./surfaces";
import { supportsLocalAuth } from "./server-environment";

const commandFlags: Record<string, readonly string[]> = {
  start: ["--port", "--isolated", "--local-auth", "--foreground", "--json"],
  status: ["--all", "--json"],
  logs: ["--lines"],
  errors: ["--all", "--limit", "--full", "--json"],
  error: [],
  stop: ["--all", "--json"],
  _supervise: [],
};
const valuedFlags = new Set(["--port", "--lines", "--limit"]);

/** Validate the complete command before opening a registry or reconciling processes. */
export function parseDevArguments(options: { argv: readonly string[] }) {
  const argv = options.argv.filter((argument) => argument !== "--");
  let [command = "start", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) return { command: "help", args: [] };
  if (command.startsWith("-") || resolveDevSurface(command)) { args = argv; command = "start"; }
  const allowed = commandFlags[command];
  if (!allowed) throw new Error(`Unknown dev-server command: ${command}. Run bun run dev --help.`);
  const positionals: string[] = [], flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (!argument.startsWith("-")) { positionals.push(argument); continue; }
    if (!allowed.includes(argument)) throw new Error(`Unknown ${command} option: ${argument}`);
    if (flags.has(argument)) throw new Error(`Duplicate ${command} option: ${argument}`);
    flags.add(argument);
    if (valuedFlags.has(argument)) {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`${argument} requires a positive integer.`);
      if (argument === "--port" && Number(value) > 65_535) throw new Error("--port must be at most 65535.");
    }
  }
  const maximum = command === "error" ? 2 : 1;
  if (positionals.length > maximum) throw new Error(`Unexpected ${command} arguments: ${positionals.slice(maximum).join(" ")}`);
  if (command === "start" && positionals[0] && !resolveDevSurface(positionals[0])) throw new Error(`Unknown development surface: ${positionals[0]}`);
  const localAuthSurface = resolveDevSurface(positionals[0] ?? 'harness');
  if (flags.has('--local-auth') && (!flags.has('--isolated') || !localAuthSurface || !supportsLocalAuth(localAuthSurface.name))) {
    throw new Error('--local-auth requires --isolated and a Books, Trade Bot, or PadPilot surface.');
  }
  if (command === "stop" && positionals.length && flags.has("--all")) throw new Error("Choose one stop target or --all, not both.");
  if (command === "error" && positionals.length !== 2) throw new Error("error requires an error id and investigated, fixed or open.");
  if (command === "error") {
    const [id, state] = positionals;
    if (!id || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error("Error id must be a positive integer.");
    if (!["investigated", "fixed", "open", "investigate", "fix"].includes(state!)) throw new Error("Error state must be investigated, fixed, or open.");
  }
  if (command === "_supervise" && positionals.length !== 1) throw new Error("_supervise requires a server id.");
  return { command, args };
}
