import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

type Scenario = {
  name: string;
  query?: Record<string, string | number | boolean>;
  args: string[];
};

type ProfileOptions = {
  repeat: number;
  warmupMs: number;
  durationMs: number;
  outDir: string;
  out: string;
  port?: number;
  noBuild: boolean;
  reuseExisting: boolean;
  scenarioNames: Set<string>;
};

type UnknownRecord = Record<string, unknown>;
type ScenarioProfileResult = {
  name: string;
  url: string;
  file: string;
  aggregate?: unknown;
  finalCounters?: unknown;
  finalRender?: unknown;
  finalFrameBudget?: unknown;
  finalAllocation?: unknown;
  finalHotPhases?: unknown;
  error?: string;
};

const opts = parseArgs(process.argv.slice(2));
const scenarios = selectedScenarios(opts);
const outDir = path.resolve(opts.outDir);
await mkdir(outDir, { recursive: true });

if (!opts.noBuild) await runCommand("build", [process.execPath, "run", "./build.ts"]);

const port = opts.port ?? await findOpenPort();
const server = await startServer(port);
try {
  const baseUrl = `http://127.0.0.1:${port}/client.html`;
  const results: ScenarioProfileResult[] = [];
  for (const scenario of scenarios) {
    const file = path.join(outDir, `${scenario.name}.json`);
    const url = scenarioUrl(baseUrl, scenario.query);
    try {
      const result = opts.reuseExisting && existsJson(file)
        ? await readJson(file)
        : await runBenchScenario(scenario, url, file, opts);
      results.push(summarizeScenario(scenario, url, result, file));
    } catch (error) {
      results.push({
        name: scenario.name,
        url,
        file,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const profile = {
    startedAt: new Date().toISOString(),
    repeat: opts.repeat,
    warmupMs: opts.warmupMs,
    durationMs: opts.durationMs,
    scenarios: results
  };
  const outputPath = path.resolve(opts.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(profile, null, 2)}\n`);
  console.log(JSON.stringify(profile, null, 2));
  if (results.some((result) => result.error !== undefined)) process.exitCode = 1;
} finally {
  await stopProcess(server);
}

function selectedScenarios(options: ProfileOptions): Scenario[] {
  const scenarios = defaultScenarios(options);
  const knownNames = new Set(scenarios.map((scenario) => scenario.name));
  for (const name of options.scenarioNames) {
    if (!knownNames.has(name)) throw new Error(`Unknown scenario: ${name}`);
  }
  return scenarios.filter((scenario) => options.scenarioNames.size === 0 || options.scenarioNames.has(scenario.name));
}

function defaultScenarios(options: ProfileOptions): Scenario[] {
  const duration = String(options.durationMs);
  const warmup = String(options.warmupMs);
  return [
    {
      name: "opening-live",
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--move-ms", "1500"]
    },
    {
      name: "horde-500",
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--stress-enemies", "500", "--stress-pickups", "500", "--stress-effects", "1000"]
    },
    {
      name: "horde-500-all-props",
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--stress-enemies", "500", "--stress-pickups", "500", "--stress-effects", "1000", "--stress-all-props"]
    },
    {
      name: "combat-all-props",
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--stress-enemies", "500", "--stress-pickups", "500", "--stress-effects", "1000", "--stress-all-props", "--stress-combat"]
    },
    {
      name: "animated-nearfield-24",
      query: { animatedEnemies: 24 },
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--stress-enemies", "160", "--stress-pickups", "160", "--stress-effects", "300"]
    },
    {
      name: "prop-grid-disabled-degrade",
      query: { propCollisionGrid: 0, allowSlowPropCollision: 1 },
      args: ["--warmup-ms", warmup, "--duration-ms", duration, "--stress-enemies", "500", "--stress-pickups", "500", "--stress-effects", "1000", "--stress-all-props"]
    }
  ];
}

async function runBenchScenario(scenario: Scenario, url: string, outFile: string, options: ProfileOptions) {
  const args = [
    "run",
    "./bench.ts",
    "--url",
    url,
    "--repeat",
    String(options.repeat),
    "--out",
    outFile,
    ...scenario.args
  ];
  await runCommand(`bench:${scenario.name}`, [process.execPath, ...args]);
  return await readJson(outFile);
}

function summarizeScenario(scenario: Scenario, url: string, result: unknown, file: string): ScenarioProfileResult {
  const root = requiredRecord(result, "benchmark result");
  const runs = Array.isArray(root.runs)
    ? root.runs.filter(isRecord).map(recordFrom)
    : [root];
  const last = runs.at(-1) ?? root;
  const aggregate = isRecord(root.aggregate) ? recordFrom(root.aggregate) : {
    frameP95MsMedian: numberAt(last, ["end", "frameMs", "p95"]) ?? null,
    frameP95MsWorst: numberAt(last, ["end", "frameMs", "p95"]) ?? null,
    updateP95MsWorst: numberAt(last, ["end", "updateMs", "p95"]) ?? null,
    renderP95MsWorst: numberAt(last, ["end", "renderMs", "p95"]) ?? null,
    frameGapP95MsMedian: numberAt(last, ["end", "frameGapMs", "p95"]) ?? null,
    skippedFramesMedian: numberAt(last, ["end", "frameBudget", "skippedFrames"]) ?? 0,
    dtClampFramesMedian: numberAt(last, ["end", "frameBudget", "dtClampFrames"]) ?? 0,
    positiveHeapDeltaP95BytesMedian: numberAt(last, ["end", "allocation", "positiveHeapDeltaBytes", "p95"]) ?? 0,
    hotPhaseP95MsMedianTop: arrayAt(last, ["end", "hotPhases"])
  };
  return {
    name: scenario.name,
    url,
    file,
    aggregate,
    finalCounters: valueAt(last, ["end", "counters"]) ?? null,
    finalRender: valueAt(last, ["end", "render"]) ?? null,
    finalFrameBudget: valueAt(last, ["end", "frameBudget"]) ?? null,
    finalAllocation: valueAt(last, ["end", "allocation"]) ?? null,
    finalHotPhases: arrayAt(last, ["end", "hotPhases"])
  };
}

async function readJson(file: string): Promise<UnknownRecord> {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  return requiredRecord(value, `JSON object in ${file}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordFrom(value: UnknownRecord): UnknownRecord {
  return Object.fromEntries(Object.entries(value));
}

function requiredRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`Expected ${label}.`);
  return recordFrom(value);
}

function valueAt(root: unknown, parts: readonly string[]): unknown {
  let value = root;
  for (const part of parts) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

function numberAt(root: unknown, parts: readonly string[]): number | undefined {
  const value = valueAt(root, parts);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayAt(root: unknown, parts: readonly string[]): unknown[] {
  const value = valueAt(root, parts);
  return Array.isArray(value) ? value : [];
}

function scenarioUrl(baseUrl: string, query: Scenario["query"] = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return url.toString();
}

function existsJson(file: string) {
  return existsSync(file);
}

async function startServer(port: number) {
  const server = spawn(process.execPath, ["run", "./server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stderr: string[] = [];
  let spawnError: Error | undefined;
  server.once("error", (error) => {
    spawnError = error;
  });
  server.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  await waitForHttp(`http://127.0.0.1:${port}/client.html`, 15_000, () => {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`server exited early: ${stderr.join("")}`);
  });
  return server;
}

async function waitForHttp(url: string, timeoutMs: number, tick: () => void) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    tick();
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runCommand(label: string, command: string[]) {
  const [executable, ...args] = command;
  const proc = spawn(executable, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  const stdout: string[] = [];
  const stderr: string[] = [];
  proc.stdout?.on("data", (chunk) => stdout.push(String(chunk)));
  proc.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  const code = await new Promise<number | null>((resolve, reject) => {
    proc.once("exit", resolve);
    proc.once("error", reject);
  });
  if (code !== 0) {
    throw new Error(`${label} failed with exit ${code}\n${stdout.join("")}\n${stderr.join("")}`);
  }
}

async function stopProcess(proc: ChildProcess) {
  if (!proc.pid) return;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  const exited = new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
    proc.once("error", () => resolve());
  });
  if (!proc.kill()) return;
  await exited;
}

async function findOpenPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) resolve(address.port);
        else reject(new Error("Could not allocate port"));
      });
    });
  });
}

function parseArgs(argv: string[]): ProfileOptions {
  const options: ProfileOptions = {
    repeat: 3,
    warmupMs: 6500,
    durationMs: 8000,
    outDir: ".local/perf-profile",
    out: ".local/perf-profile/current-frame-profile.json",
    noBuild: false,
    reuseExisting: false,
    scenarioNames: new Set()
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repeat") options.repeat = Number(required(argv, ++i, arg));
    else if (arg === "--warmup-ms") options.warmupMs = Number(required(argv, ++i, arg));
    else if (arg === "--duration-ms") options.durationMs = Number(required(argv, ++i, arg));
    else if (arg === "--out-dir") options.outDir = required(argv, ++i, arg);
    else if (arg === "--out") options.out = required(argv, ++i, arg);
    else if (arg === "--port") options.port = Number(required(argv, ++i, arg));
    else if (arg === "--no-build") options.noBuild = true;
    else if (arg === "--reuse-existing") options.reuseExisting = true;
    else if (arg === "--scenario") options.scenarioNames.add(required(argv, ++i, arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isSafeInteger(options.repeat) || options.repeat < 1) throw new Error("--repeat must be a positive safe integer");
  if (!Number.isFinite(options.warmupMs) || options.warmupMs < 0) throw new Error("--warmup-ms must be non-negative");
  if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) throw new Error("--duration-ms must be positive");
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port <= 0)) throw new Error("--port must be a positive integer");
  return options;
}

function required(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
