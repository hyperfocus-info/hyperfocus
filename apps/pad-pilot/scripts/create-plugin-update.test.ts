import { z } from "zod";
import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { spawnSyncWithDeadline } from "./process-runner";

const tempRoots: string[] = [];
const GENERATOR_PROCESS_TIMEOUT_MS = 20_000;

setDefaultTimeout(30_000);

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
});

function createBundle(root: string, content: string) {
  const contents = path.join(root, "Contents", "x86_64-win");
  mkdirSync(contents, { recursive: true });
  writeFileSync(path.join(contents, "PadPilot.vst3"), content);
}

function runGenerator(args: string[], privateKey: string) {
  return spawnSyncWithDeadline([process.execPath, "run", "./scripts/create-plugin-update.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, PADPILOT_UPDATE_SIGNING_PRIVATE_KEY_PEM: privateKey },
    label: "create-plugin-update test fixture",
    stderr: "pipe",
    stdout: "pipe",
    timeoutMs: GENERATOR_PROCESS_TIMEOUT_MS,
  });
}

describe("create-plugin-update", () => {
  it("builds a bounded ZIP atomically and refuses to overwrite a signed release", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    const output = path.join(tempRoot, "releases");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const args = [
      "--base", base,
      "--target", target,
      "--out", output,
      "--base-version", "1.0.0",
      "--version", "1.0.1",
    ];

    const first = runGenerator(args, privateKeyPem);
    expect(first.exitCode, new TextDecoder().decode(first.stderr)).toBe(0);
    const result = z.object({ artifactPath: z.string(), manifestPath: z.string() }).passthrough().parse(JSON.parse(new TextDecoder().decode(first.stdout)));
    expect(existsSync(result.artifactPath)).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);
    expect([...readFileSync(result.artifactPath).subarray(0, 2)]).toEqual([0x50, 0x4b]);
    const originalManifest = readFileSync(result.manifestPath, "utf8");
    expect(JSON.parse(originalManifest).files.addOrReplace).toHaveLength(1);

    const second = runGenerator(args, privateKeyPem);
    expect(second.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(second.stderr)).toContain("will not be overwritten");
    expect(readFileSync(result.manifestPath, "utf8")).toBe(originalManifest);
  });

  it("rejects path-like release versions before creating output", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-invalid-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    const output = path.join(tempRoot, "releases");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", output,
      "--base-version", "1.0.0",
      "--version", "../escape",
    ], privateKeyPem);
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(path.join(tempRoot, "escape-stable-windows-x64"))).toBe(false);
  });

  it("rejects a base-version range because one diff has only one base snapshot", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-range-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", path.join(tempRoot, "releases"),
      "--base-min", "1.0.0",
      "--base-max", "1.0.1",
      "--version", "1.0.2",
    ], privateKeyPem);
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain("cannot represent multiple base versions");
  });

  it("passes PowerShell paths through environment variables without interpolation", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-shell-"));
    tempRoots.push(tempRoot);
    const unusualRoot = path.join(tempRoot, "quote'; semicolon");
    const base = path.join(unusualRoot, "base", "PadPilot.vst3");
    const target = path.join(unusualRoot, "target", "PadPilot.vst3");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", path.join(unusualRoot, "releases"),
      "--base-version", "1.0.0",
      "--version", "1.0.1",
    ], privateKeyPem);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  it("refuses to sign an empty update between identical bundle snapshots", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-empty-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    createBundle(base, "same plugin");
    createBundle(target, "same plugin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", path.join(tempRoot, "releases"),
      "--base-version", "1.0.0",
      "--version", "1.0.1",
    ], privateKeyPem);
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain("refusing to sign an empty update");
  });

  it("rejects excessive tree depth before recursive traversal can exhaust the stack", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-depth-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    let deep = path.join(target, "Contents");
    for (let index = 0; index < 65; index += 1) {
      deep = path.join(deep, "d");
    }
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, "value.dat"), "deep");

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", path.join(tempRoot, "releases"),
      "--base-version", "1.0.0",
      "--version", "1.0.1",
    ], "unused");
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain("directory levels");
  });

  it("rejects a sparse oversized entry before streaming or copying it", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-create-update-entry-limit-"));
    tempRoots.push(tempRoot);
    const base = path.join(tempRoot, "base", "PadPilot.vst3");
    const target = path.join(tempRoot, "target", "PadPilot.vst3");
    createBundle(base, "old plugin");
    createBundle(target, "new plugin");
    truncateSync(path.join(target, "Contents", "x86_64-win", "PadPilot.vst3"), 268435457);

    const result = runGenerator([
      "--base", base,
      "--target", target,
      "--out", path.join(tempRoot, "releases"),
      "--base-version", "1.0.0",
      "--version", "1.0.1",
    ], "unused");
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain("byte budget");
  });
});
