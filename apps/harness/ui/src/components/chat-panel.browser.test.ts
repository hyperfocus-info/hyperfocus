import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";

const repoRoot = path.resolve(import.meta.dir, "../../../../..");
const defaultSmokeRoot = path.join(repoRoot, ".local", "project-chat-first-paint");
const defaultFixtureSourcePath = path.join(repoRoot, "apps", "harness", "ui", "src", "components", "chat-panel.browser-fixture.tsx");
const noResizeObserverSmokeRoot = path.join(repoRoot, ".local", "project-chat-first-paint-no-resize-observer");
const noResizeObserverFixtureSourcePath = path.join(
  repoRoot,
  "apps",
  "harness",
  "ui",
  "src",
  "components",
  "chat-panel.no-resize-observer.browser-fixture.tsx"
);
const appSmokeRoot = path.join(repoRoot, ".local", "project-chat-first-paint-app");
const appFixtureSourcePath = path.join(repoRoot, "apps", "harness", "ui", "src", "components", "chat-panel.app-browser-fixture.tsx");
const assistantSmokeRoot = path.join(repoRoot, ".local", "assistant-chat-first-paint");
const assistantFixtureSourcePath = path.join(repoRoot, "apps", "harness", "ui", "src", "components", "assistants-panel.browser-fixture.tsx");
const runnerPath = path.join(import.meta.dir, "chat-panel.browser-runner.mjs");
const buildRunnerPath = path.join(import.meta.dir, "chat-panel.browser-build.ts");

test("ChatPanel renders project chat virtual transcript on first browser load", async () => {
  const fixtureUrl = await buildFixture(defaultSmokeRoot, defaultFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl);
  expect(result).toContain("browser virtual transcript first-load check passed");
}, 90_000);

test("ChatPanel recovers first project chat paint without ResizeObserver callbacks", async () => {
  const fixtureUrl = await buildFixture(noResizeObserverSmokeRoot, noResizeObserverFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl);
  expect(result).toContain("browser virtual transcript first-load check passed");
}, 90_000);

test("App websocket first load renders project chat virtual transcript", async () => {
  const fixtureUrl = await buildFixture(appSmokeRoot, appFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl);
  expect(result).toContain("browser virtual transcript first-load check passed");
}, 90_000);

test("AssistantsPanel renders assistant chat virtual transcript on first browser load", async () => {
  const fixtureUrl = await buildFixture(assistantSmokeRoot, assistantFixtureSourcePath);
  const result = await runBrowserCheck(fixtureUrl, {
    viewportSelector: '[data-test-virtual-list="assistant-chat-transcript"]',
    targetText: "Assistant chat browser message 159",
    remountMode: "assistant-chat"
  });
  expect(result).toContain("browser virtual transcript first-load check passed");
}, 90_000);

async function buildFixture(smokeRoot: string, fixtureSourcePath: string) {
  const outDir = path.join(smokeRoot, "dist");
  const proc = Bun.spawn({
    cmd: [process.execPath, buildRunnerPath, smokeRoot, fixtureSourcePath],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(`ChatPanel browser fixture build failed with exit ${exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return pathToFileURL(path.join(outDir, "index.html")).href;
}

async function runBrowserCheck(
  baseUrl: string,
  options: { viewportSelector?: string; targetText?: string; remountMode?: "project-chat" | "assistant-chat" | "none" } = {}
) {
  const proc = Bun.spawn({
    cmd: ["node", runnerPath],
    cwd: repoRoot,
    env: {
      ...process.env,
      CHAT_PANEL_BROWSER_URL: baseUrl,
      ...(options.viewportSelector ? { CHAT_PANEL_BROWSER_VIEWPORT_SELECTOR: options.viewportSelector } : {}),
      ...(options.targetText ? { CHAT_PANEL_BROWSER_TARGET_TEXT: options.targetText } : {}),
      ...(options.remountMode ? { CHAT_PANEL_BROWSER_REMOUNT_MODE: options.remountMode } : {})
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const completed = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100_000));
  const result = await Promise.race([completed, timeout]);
  if (result === "timeout") {
    proc.kill();
    await proc.exited.catch(() => undefined);
    throw new Error("ChatPanel browser runner timed out after 100000ms");
  }
  const [stdout, stderr, exitCode] = result;
  if (exitCode !== 0) {
    throw new Error(`ChatPanel browser runner failed with exit ${exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return stdout.trim();
}
