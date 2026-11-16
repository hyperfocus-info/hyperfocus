import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnBackgroundProcess, spawnBackgroundProcessSync } from "../process/spawn";
import { terminateProcessTree } from "../process/terminate";
import { connectHeadlessBrowser, launchHeadlessBrowser } from "./index";

const executable = [process.env.CHROME_PATH,
  join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
const browserTest = executable ? test : test.skip;

test("callers cannot override headless mode, debugging ownership, or the disposable profile", async () => {
  for (const argument of ["--headless=false", "--user-data-dir=personal", "--remote-debugging-port=9222"]) {
    await expect(launchHeadlessBrowser({ executable: "unused", args: [argument] })).rejects.toThrow("cannot be overridden");
  }
});

test("a failed executable launch removes its owned temporary profile", async () => {
  const before = await profiles();
  await expect(launchHeadlessBrowser({ executable: join(tmpdir(), "missing-hyperfocus-browser.exe"), startupTimeoutMs: 500 })).rejects.toThrow();
  expect(await newProfiles(before)).toEqual([]);
}, 15_000);

browserTest("normal completion and a thrown connection/setup failure close the browser and profile", async () => {
  const browser = await launchHeadlessBrowser({ executable: executable! });
  try {
    expect(alive(browser.pid)).toBe(true);
    expect((await fetch(`http://127.0.0.1:${browser.port}/json/version`)).ok).toBe(true);
    await expect((async () => {
      try { throw new Error("Injected CDP connect failure"); }
      finally { await browser.close(); }
    })()).rejects.toThrow("Injected CDP connect failure");
    expect(alive(browser.pid)).toBe(false);
    expect(existsSync(browser.profileDir)).toBe(false);
    await browser.close();
  } finally { await browser.close(); }
}, 20_000);

browserTest("readiness timeout cleans up even before the caller receives a browser handle", async () => {
  const before = await profiles();
  await expect(launchHeadlessBrowser({ executable: executable!, startupTimeoutMs: 1 })).rejects.toThrow("did not become ready");
  expect(await newProfiles(before)).toEqual([]);
}, 20_000);

browserTest("driver rejection and connection timeout close the owned browser before returning an error", async () => {
  const before = await profiles();
  await expect(connectHeadlessBrowser({ executable: executable!, connect: async () => { throw new Error("Driver rejected connection"); } })).rejects.toThrow("Driver rejected connection");
  await expect(connectHeadlessBrowser({ executable: executable!, connectTimeoutMs: 1, connect: () => new Promise(() => {}) })).rejects.toThrow("connection timed out");
  expect(await newProfiles(before)).toEqual([]);
}, 20_000);

browserTest("hard owner termination triggers guardian EOF cleanup without a finally or signal handler", async () => {
  const owner = spawnBackgroundProcess({ cmd: [process.execPath, join(import.meta.dir, "fixtures/browser-owner.ts"), executable!], stdout: "pipe", stderr: "pipe" });
  let record: { pid: number; profileDir: string } | undefined;
  try {
    record = await ownerRecord(owner.stdout);
    expect(alive(record.pid)).toBe(true);
    // On Windows this reproduces tool timeout/taskkill behavior: only the owner is killed.
    if (process.platform === "win32") spawnBackgroundProcessSync({ cmd: ["taskkill.exe", "/PID", String(owner.pid), "/F"], stdout: "ignore", stderr: "ignore" });
    else owner.kill("SIGKILL");
    await owner.exited;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && (alive(record.pid) || existsSync(record.profileDir))) await Bun.sleep(50);
    expect(alive(record.pid)).toBe(false);
    expect(existsSync(record.profileDir)).toBe(false);
  } finally {
    await terminateProcessTree({ process: owner });
    if (record && alive(record.pid)) await terminateProcessTree({ pid: record.pid });
  }
}, 25_000);

async function ownerRecord(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const timeout = setTimeout(() => { void reader.cancel("Owner startup timed out"); }, 12_000);
  try {
    while (!text.includes("\n")) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`Owner did not publish a launch record: ${text}`);
      text += decoder.decode(value, { stream: true });
    }
    const record: unknown = JSON.parse(text.slice(0, text.indexOf("\n")));
    if (!record || typeof record !== "object" || !("pid" in record) || typeof record.pid !== "number"
      || !("profileDir" in record) || typeof record.profileDir !== "string") throw new Error("Invalid owner record");
    return { pid: record.pid, profileDir: record.profileDir };
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}

function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function profiles() { return (await readdir(tmpdir())).filter((name) => name.startsWith("hyperfocus-browser-")); }
async function newProfiles(before: string[]) { return (await profiles()).filter((name) => !before.includes(name)); }
