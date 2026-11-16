import { spawnBackgroundProcess } from '@hyperfocus/desktop-runtime/process';
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

export type BunDependencyRequest =
  | { command: "list"; project: string }
  | { command: "install"; project: string; frozen?: boolean }
  | { command: "add"; project: string; packages: string[]; section?: DependencySection; exact?: boolean; trust?: boolean }
  | { command: "remove"; project: string; packages: string[] };

export type BunDependencyResult = {
  command: BunDependencyRequest["command"];
  project: string;
  argv: string[];
  dependencies: Record<DependencySection, Record<string, string>>;
  stdout: string;
  stderr: string;
};

export type BunCommandRunner = (options: { cwd: string; argv: string[] }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const sections: DependencySection[] = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

export async function manageBunDependencies(request: BunDependencyRequest, runner: BunCommandRunner = runBun): Promise<BunDependencyResult> {
  const project = resolve(request.project);
  await requirePackageJson(project);
  if (request.command === "list") return { command: request.command, project, argv: [], dependencies: await readDependencies(project), stdout: "", stderr: "" };

  const argv = dependencyArgv(request);
  const result = await runner({ cwd: project, argv });
  if (result.exitCode !== 0) {
    throw new Error(`Bun dependency command failed with exit code ${result.exitCode}.\n${result.stderr || result.stdout}`.trim());
  }
  return {
    command: request.command,
    project,
    argv,
    dependencies: await readDependencies(project),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function dependencyArgv(request: Exclude<BunDependencyRequest, { command: "list" }>) {
  if (request.command === "install") return ["install", ...(request.frozen ? ["--frozen-lockfile"] : [])];
  validatePackageSpecs(request.packages);
  if (request.command === "remove") return ["remove", ...request.packages];
  const sectionFlag = request.section === "devDependencies" ? "--dev"
    : request.section === "optionalDependencies" ? "--optional"
      : request.section === "peerDependencies" ? "--peer"
        : undefined;
  return ["add", ...(sectionFlag ? [sectionFlag] : []), ...(request.exact ? ["--exact"] : []), ...(request.trust ? ["--trust"] : []), ...request.packages];
}

export function validatePackageSpecs(packages: readonly string[]) {
  if (!packages.length) throw new Error("At least one package is required.");
  for (const spec of packages) {
    if (!spec || spec.length > 1024 || spec.startsWith("-") || /[\0\r\n]/.test(spec)) throw new Error(`Invalid package spec: ${JSON.stringify(spec)}`);
  }
}

async function requirePackageJson(project: string) {
  const manifest = resolve(project, "package.json");
  const info = await stat(manifest).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`No package.json exists in ${project}. Create one before managing editor dependencies.`);
}

async function readDependencies(project: string) {
  const parsed: unknown = JSON.parse(await readFile(resolve(project, "package.json"), "utf8"));
  const manifest = record(parsed);
  if (!manifest) throw new TypeError("Project package.json must contain an object.");
  const dependencies: BunDependencyResult["dependencies"] = { dependencies: {}, devDependencies: {}, optionalDependencies: {}, peerDependencies: {} };
  for (const section of sections) {
    const value = manifest[section];
    const entries = record(value);
    dependencies[section] = entries
      ? Object.fromEntries(Object.entries(entries).filter((entry): entry is [string, string] => typeof entry[1] === "string").sort(([left], [right]) => left.localeCompare(right)))
      : {};
  }
  return dependencies;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

async function runBun(options: { cwd: string; argv: string[] }) {
  const child = spawnBackgroundProcess({ cmd: [process.execPath, ...options.argv], ...({
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  }) });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
