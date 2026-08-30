import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deployUiAssets } from "./deploy-ui";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("deployUiAssets", () => {
  it("places the built entry files together and replaces old assets atomically", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-"));
    tempRoots.push(root);
    const project = path.join(root, "project");
    const dist = path.join(project, "ui", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, "index.html"), "<link rel='stylesheet' href='./main.css'><script src='./main.js'></script>");
    writeFileSync(path.join(dist, "main.js"), "new ui");
    writeFileSync(path.join(dist, "main.css"), "new styles");
    const contents = path.join(root, "PadPilot.vst3", "Contents");
    mkdirSync(path.join(contents, "x86_64-win"), { recursive: true });
    writeFileSync(path.join(contents, "x86_64-win", "PadPilot.vst3"), "plugin");
    const oldUi = path.join(contents, "Resources", "ui");
    mkdirSync(oldUi, { recursive: true });
    writeFileSync(path.join(oldUi, "old.js"), "old ui");

    await deployUiAssets(project, contents);
    expect(readFileSync(path.join(oldUi, "main.js"), "utf8")).toBe("new ui");
    expect(readFileSync(path.join(oldUi, "main.css"), "utf8")).toBe("new styles");
    expect(existsSync(path.join(oldUi, "dist", "main.js"))).toBe(false);
    expect(existsSync(path.join(oldUi, "old.js"))).toBe(false);
  });

  it("rejects arbitrary bundle-content destinations", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-invalid-"));
    tempRoots.push(root);
    await expect(deployUiAssets(root, root)).rejects.toThrow("PadPilot.vst3/Contents");
  });

  it("deploys an explicit embedded build instead of stale ui/dist assets", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-embedded-"));
    tempRoots.push(root);
    const project = path.join(root, "project");
    const dist = path.join(project, "ui", "dist");
    const embedded = path.join(project, "build", "plugin", "embedded-ui");
    for (const source of [dist, embedded]) {
      mkdirSync(source, { recursive: true });
      writeFileSync(path.join(source, "index.html"), "<link rel='stylesheet' href='./main.css'><script src='./main.js'></script>");
      writeFileSync(path.join(source, "main.css"), source === embedded ? "embedded styles" : "stale styles");
      writeFileSync(path.join(source, "main.js"), source === embedded ? "embedded ui" : "stale ui");
    }
    const contents = path.join(root, "PadPilot.vst3", "Contents");
    mkdirSync(path.join(contents, "x86_64-win"), { recursive: true });
    writeFileSync(path.join(contents, "x86_64-win", "PadPilot.vst3"), "plugin");

    await deployUiAssets(project, contents, embedded);

    expect(readFileSync(path.join(contents, "Resources", "ui", "main.js"), "utf8")).toBe("embedded ui");
    expect(readFileSync(path.join(contents, "Resources", "ui", "main.css"), "utf8")).toBe("embedded styles");
  });

  it("keeps transaction staging below the Windows path boundary", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-long-"));
    tempRoots.push(root);
    const relativePreset = path.join(
      "fx",
      "chains",
      "presets",
      "utility-recorded-audio-noise-gate-clean-medium.preset",
    );
    const legacyStageName = `.ui.padpilot-stage-${process.pid}-${"0".repeat(36)}`;
    const contentsSuffix = path.join("PadPilot.vst3", "Contents");
    let padding = "p";
    while (path.join(root, padding, contentsSuffix, "Resources", legacyStageName, relativePreset).length < 260) {
      padding += "p";
    }

    const project = path.join(root, "project");
    const dist = path.join(project, "ui", "dist");
    mkdirSync(path.join(dist, path.dirname(relativePreset)), { recursive: true });
    writeFileSync(path.join(dist, "index.html"), "<link rel='stylesheet' href='./main.css'><script src='./main.js'></script>");
    writeFileSync(path.join(dist, "main.js"), "new ui");
    writeFileSync(path.join(dist, "main.css"), "new styles");
    writeFileSync(path.join(dist, relativePreset), "preset");
    const contents = path.join(root, padding, contentsSuffix);
    mkdirSync(path.join(contents, "x86_64-win"), { recursive: true });
    writeFileSync(path.join(contents, "x86_64-win", "PadPilot.vst3"), "plugin");

    await deployUiAssets(project, contents);

    expect(readFileSync(path.join(contents, "Resources", "ui", relativePreset), "utf8")).toBe("preset");
  });

  it("rejects incomplete or out-of-project UI sources", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-source-"));
    tempRoots.push(root);
    const project = path.join(root, "project");
    const incomplete = path.join(project, "build", "plugin", "embedded-ui");
    mkdirSync(incomplete, { recursive: true });
    writeFileSync(path.join(incomplete, "index.html"), "<script src='./main.js'></script>");
    writeFileSync(path.join(incomplete, "main.js"), "ui");
    const contents = path.join(root, "PadPilot.vst3", "Contents");
    mkdirSync(path.join(contents, "x86_64-win"), { recursive: true });
    writeFileSync(path.join(contents, "x86_64-win", "PadPilot.vst3"), "plugin");

    await expect(deployUiAssets(project, contents, incomplete)).rejects.toThrow("main.css");

    const external = path.join(root, "external-ui");
    mkdirSync(external);
    writeFileSync(path.join(external, "index.html"), "index");
    writeFileSync(path.join(external, "main.js"), "ui");
    writeFileSync(path.join(external, "main.css"), "styles");
    await expect(deployUiAssets(project, contents, external)).rejects.toThrow("inside the project");
  });

  it("refuses to deploy through a linked Resources directory", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-deploy-ui-link-"));
    tempRoots.push(root);
    const project = path.join(root, "project");
    const dist = path.join(project, "ui", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, "index.html"), "<link rel='stylesheet' href='./main.css'><script src='./main.js'></script>");
    writeFileSync(path.join(dist, "main.js"), "new ui");
    writeFileSync(path.join(dist, "main.css"), "new styles");
    const contents = path.join(root, "PadPilot.vst3", "Contents");
    mkdirSync(path.join(contents, "x86_64-win"), { recursive: true });
    writeFileSync(path.join(contents, "x86_64-win", "PadPilot.vst3"), "plugin");
    const external = path.join(root, "external-resources");
    mkdirSync(external);
    symlinkSync(external, path.join(contents, "Resources"), "junction");

    await expect(deployUiAssets(project, contents)).rejects.toThrow("linked or non-directory Resources");
    expect(existsSync(path.join(external, "ui"))).toBe(false);
  });
});
