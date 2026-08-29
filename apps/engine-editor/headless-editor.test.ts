import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHyperfocusProjectFiles, hashHyperfocusAsset } from "@hyperfocus/engine/project";
import { readHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";
import { handleEditorAgentApi, isAllowedEditorAgentOrigin } from "./editor-agent-api.ts";
import { runHeadlessEditorPlan, snapshotHeadlessEditorProject } from "./headless-editor.ts";
import { createDefaultProject, migrateProject } from "@hyperfocus/engine/project";

describe("headless editor command host", () => {
  test("persists validated commands without starting a browser", async () => {
    await withProject(async (root) => {
      const before = await snapshotHeadlessEditorProject(root);
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: { requestId: "headless-1", intent: "Rename on disk", commands: [{ type: "project.patch", label: "Rename project", operations: [{ op: "replace", path: "/name", value: "Headless Result" }] }] },
      });
      const opened = await readHyperfocusProjectPair(root, { parseProject: migrateProject });

      expect(handoff.ok).toBe(true);
      expect(handoff.persisted).toBe(true);
      expect(handoff.snapshot.dirty).toBe(false);
      expect(handoff.projectHash).not.toBe(before.projectHash);
      expect(opened.project.name).toBe("Headless Result");
    });
  });

  test("supports dry-run commands without touching canonical files", async () => {
    await withProject(async (root) => {
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        persist: false,
        plan: { requestId: "dry-1", intent: "Preview a rename", commands: [{ type: "project.patch", label: "Preview rename", operations: [{ op: "replace", path: "/name", value: "Dry Run" }] }] },
      });
      expect(handoff.snapshot.project.name).toBe("Dry Run");
      expect(handoff.persisted).toBe(false);
      expect((await readHyperfocusProjectPair(root, { parseProject: migrateProject })).project.name).toBe("Disk Project");
    });
  });

  test("runs the packaged direct CLI without Chrome or CDP", async () => {
    await withProject(async (root) => {
      const planPath = join(root, "agent-plan.json");
      await writeFile(planPath, JSON.stringify({ requestId: "cli-direct-1", intent: "Rename through direct CLI", commands: [{ type: "project.patch", label: "CLI rename", operations: [{ op: "replace", path: "/name", value: "Direct CLI Result" }] }] }));
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "agent", "--project", root, "--plan", planPath], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
      const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      const handoff = parseHandoff(JSON.parse(stdout));
      expect(handoff.schema).toBe("hyperfocus-editor-command-handoff-v1");
      expect(handoff.persisted).toBe(true);
      expect(handoff.snapshot.project.name).toBe("Direct CLI Result");
    });
  });

  test("returns a failing process status for an ok:false command handoff", async () => {
    await withProject(async (root) => {
      const planPath = join(root, "rejected-plan.json");
      await writeFile(planPath, JSON.stringify({
        requestId: "cli-rejected-1",
        intent: "Reject an invalid JSON Pointer",
        commands: [{
          type: "project.patch",
          label: "Invalid rename",
          operations: [{ op: "replace", path: "/missing-name", value: "Rejected" }]
        }]
      }));
      const child = Bun.spawn([
        process.execPath,
        join(import.meta.dir, "cli.ts"),
        "agent",
        "--project",
        root,
        "--plan",
        planPath
      ], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text()
      ]);

      expect(stderr).toBe("");
      expect(exitCode).toBe(1);
      expect(requireRecord(JSON.parse(stdout), "rejected CLI handoff").ok).toBe(false);
    });
  });

  test("persists command-imported binary assets in the canonical archive", async () => {
    await withProject(async (root) => {
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: { requestId: "asset-api-1", intent: "Import custom data headlessly", commands: [{ type: "asset.import", name: "library-config.json", mimeType: "application/json", base64: btoa('{"library":"custom"}') }] },
      });
      const opened = await readHyperfocusProjectPair(root, { parseProject: migrateProject });
      const asset = opened.assets.find((candidate) => candidate.name === "library-config.json");
      expect(handoff.ok).toBe(true);
      expect(asset?.bytes).toEqual(new TextEncoder().encode('{"library":"custom"}'));
      expect(opened.project.assets.find((candidate) => candidate.name === "library-config.json")?.sha256).toBe(asset?.sha256);
    });
  });

  test("persists asset removal without retaining an orphaned packed binary", async () => {
    await withAssetProject(async (root) => {
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: { requestId: "asset-remove-1", intent: "Remove unused packed data", commands: [{ type: "asset.remove", assetId: "fixture-data" }] },
      });
      const opened = await readHyperfocusProjectPair(root, { parseProject: migrateProject });

      expect(handoff.ok).toBe(true);
      expect(handoff.persisted).toBe(true);
      expect(opened.project.assets.some((asset) => asset.id === "fixture-data")).toBe(false);
      expect(opened.assets).toEqual([]);
    });
  });

  test("returns a failed handoff and preserves disk when persistence cannot satisfy the asset catalog", async () => {
    await withProject(async (root) => {
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: {
          requestId: "persistence-failure-1",
          intent: "Reject asset metadata without corresponding bytes",
          commands: [{
            type: "project.patch",
            label: "Add incomplete imported asset",
            operations: [{ op: "add", path: "/assets/-", value: { id: "missing-bytes", name: "missing.bin", kind: "unknown", mimeType: "application/octet-stream", size: 1, lastModified: 1, source: "imported", sha256: "0000000000000000000000000000000000000000000000000000000000000000" } }],
          }],
        },
      });
      expect(handoff.ok).toBe(false);
      expect(handoff.persisted).toBe(false);
      expect(handoff.error).toContain("persistence failed");
      expect((await readHyperfocusProjectPair(root, { parseProject: migrateProject })).project.assets.some((asset) => asset.id === "missing-bytes")).toBe(false);
    });
  });

  test("exposes snapshot and command operations through the loopback API", async () => {
    await withProject(async (root) => {
      const snapshotResponse = await handleEditorAgentApi(new Request(`http://127.0.0.1:8796/api/agent/v1/project?root=${encodeURIComponent(root)}`));
      expect(snapshotResponse?.status).toBe(200);
      if (!snapshotResponse) throw new Error("Snapshot API did not return a response.");
      const snapshot = requireRecord(await snapshotResponse.json(), "snapshot response");
      expect(migrateProject(snapshot.project).name).toBe("Disk Project");

      const commandResponse = await handleEditorAgentApi(new Request("http://127.0.0.1:8796/api/agent/v1/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:8796" },
        body: JSON.stringify({ projectRoot: root, plan: { requestId: "api-1", intent: "Rename through HTTP", commands: [{ type: "project.patch", label: "API rename", operations: [{ op: "replace", path: "/name", value: "API Result" }] }] } }),
      }));
      expect(commandResponse?.status).toBe(200);
      if (!commandResponse) throw new Error("Command API did not return a response.");
      expect(requireRecord(await commandResponse.json(), "command response").persisted).toBe(true);
      expect((await readHyperfocusProjectPair(root, { parseProject: migrateProject })).project.name).toBe("API Result");
    });
  });

  test("optionally returns bounded base64 assets for an attached browser session", async () => {
    await withAssetProject(async (root, bytes) => {
      const response = await handleEditorAgentApi(new Request(`http://127.0.0.1:8796/api/agent/v1/project?root=${encodeURIComponent(root)}&includeAssets=base64`, {
        headers: { Origin: "http://127.0.0.1:8796" },
      }));
      expect(response?.status).toBe(200);
      if (!response) throw new Error("Hydration snapshot API did not return a response.");
      const snapshot = requireRecord(await response.json(), "hydration snapshot");
      expect(Array.isArray(snapshot.assetTransfers)).toBe(true);
      const transfer = requireRecord((snapshot.assetTransfers as unknown[])[0], "asset transfer");
      expect(transfer.assetId).toBe("fixture-data");
      expect(Uint8Array.from(atob(String(transfer.base64)), (character) => character.charCodeAt(0))).toEqual(bytes);
    });
  });

  test("rejects cross-origin browser mutations and disabled non-loopback APIs", async () => {
    const headers: Headers = { get(name: string) { return name.toLowerCase() === "origin" ? "https://attacker.example" : null; } };
    expect(isAllowedEditorAgentOrigin({ headers, url: "http://127.0.0.1:8796/api/agent/v1/commands" })).toBe(false);
    expect(isAllowedEditorAgentOrigin({ headers: new Headers({ Origin: "http://rebinding.example" }), url: "http://rebinding.example/api/agent/v1/commands" })).toBe(false);
    expect((await handleEditorAgentApi(new Request("http://example.test/api/agent/v1/project?root=x"), false))?.status).toBe(403);
  });
});

function parseHandoff(value: unknown) {
  const handoff = requireRecord(value, "CLI handoff");
  const snapshot = requireRecord(handoff.snapshot, "CLI handoff snapshot");
  return {
    schema: typeof handoff.schema === "string" ? handoff.schema : "",
    persisted: handoff.persisted === true,
    snapshot: { project: migrateProject(snapshot.project) },
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

async function withProject(run: (root: string) => Promise<void>) {
  const root = join(process.cwd(), ".tmp-test-data", `headless-editor-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    const files = await createHyperfocusProjectFiles(createDefaultProject("Disk Project"), []);
    await writeHyperfocusProjectPair(root, files);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withAssetProject(run: (root: string, bytes: Uint8Array) => Promise<void>) {
  const root = join(process.cwd(), ".tmp-test-data", `headless-editor-assets-${crypto.randomUUID()}`);
  const bytes = new TextEncoder().encode("browser hydration fixture");
  await mkdir(root, { recursive: true });
  try {
    const project = createDefaultProject("Asset Disk Project");
    project.assets.push({ id: "fixture-data", name: "fixture.txt", kind: "data", mimeType: "text/plain", size: bytes.byteLength, lastModified: 1, source: "imported", sha256: await hashHyperfocusAsset(bytes) });
    const files = await createHyperfocusProjectFiles(project, [{ id: "fixture-data", name: "fixture.txt", mimeType: "text/plain", bytes }]);
    await writeHyperfocusProjectPair(root, files);
    await run(root, bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
