import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { worldAreaCaptureAnchors } from "../src/data/world-landmarks.ts";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function viewportDimension(name: string, fallback: number) {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) {
    throw new Error(`${name} must be an integer from 1 through 16384.`);
  }
  return value;
}

function findFirst(root: string, filename: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === filename) return path;
    }
  }
  return undefined;
}

const baseUrl = argValue("--base-url") ?? process.env.MMO_SKILL_DEMO_URL ?? "http://localhost:8792/examples/mmo-skill-demo/client.html";
const width = viewportDimension("--width", 1440);
const height = viewportDimension("--height", 900);
const only = argValue("--only") ?? "";
const url = new URL(baseUrl);
if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("--base-url must use http: or https:.");
const rootDir = resolve(import.meta.dir, "../../..");
const browserPath = process.env.CHROME_PATH ?? findFirst(join(process.env.LOCALAPPDATA ?? "", "ms-playwright"), "chrome-headless-shell.exe");
const areas = worldAreaCaptureAnchors.filter((area) => !only || area.id === only);
if (!areas.length) throw new Error(`Unknown world area: ${only}`);
const args = [
  "run",
  "screenshot",
  "--",
  "--base-url",
  `${url.protocol}//${url.host}`,
  "--viewport",
  `${width}x${height}`,
  ...areas.flatMap((area) => ["--route", `${url.pathname}?login=visual-${area.id}#area=${area.id}`])
];

if (!browserPath || (resolve(browserPath) === browserPath && !existsSync(browserPath))) {
  throw new Error("No headless browser found. Set CHROME_PATH to an existing executable.");
}

const proc = Bun.spawn([process.execPath, ...args], {
  cwd: rootDir,
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, CHROME_PATH: browserPath }
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited
]);

if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
if (exitCode !== 0) process.exit(exitCode);
