import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHyperfocusProjectFiles } from "@hyperfocus/engine/project";
import { readHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";
import { handleEditorAgentApi, isAllowedEditorAgentOrigin } from "./editor-agent-api.ts";
import { runHeadlessEditorPlan, snapshotHeadlessEditorProject } from "./headless-editor.ts";
import { createDefaultProject, type EditorProject } from "./src/project.ts";

describe("headless editor command host", () => {
  test("persists validated commands without starting a browser", async () => {
    await withProject(async (root) => {
      const before = await snapshotHeadlessEditorProject(root);
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: { requestId: "headless-1", intent: "Rename on disk", commands: [{ type: "project.patch", label: "Rename project", operations: [{ op: "replace", path: "/name", value: "Headless Result" }] }] },
      });
      const opened = await readHyperfocusProjectPair<EditorProject>(root);

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
      expect((await readHyperfocusProjectPair<EditorProject>(root)).project.name).toBe("Disk Project");
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
      const handoff = JSON.parse(stdout) as { schema: string; persisted: boolean; snapshot: { project: EditorProject } };
      expect(handoff.schema).toBe("hyperfocus-editor-command-handoff-v1");
      expect(handoff.persisted).toBe(true);
      expect(handoff.snapshot.project.name).toBe("Direct CLI Result");
    });
  });

  test("persists command-imported binary assets in the canonical archive", async () => {
    await withProject(async (root) => {
      const handoff = await runHeadlessEditorPlan({
        projectRoot: root,
        plan: { requestId: "asset-api-1", intent: "Import custom data headlessly", commands: [{ type: "asset.import", name: "library-config.json", mimeType: "application/json", base64: btoa('{"library":"custom"}') }] },
      });
      const opened = await readHyperfocusProjectPair<EditorProject>(root);
      const asset = opened.assets.find((candidate) => candidate.name === "library-config.json");
      expect(handoff.ok).toBe(true);
      expect(asset?.bytes).toEqual(new TextEncoder().encode('{"library":"custom"}'));
      expect(opened.project.assets.find((candidate) => candidate.name === "library-config.json")?.sha256).toBe(asset?.sha256);
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
      expect((await readHyperfocusProjectPair<EditorProject>(root)).project.assets.some((asset) => asset.id === "missing-bytes")).toBe(false);
    });
  });

  test("exposes snapshot and command operations through the loopback API", async () => {
    await withProject(async (root) => {
      const snapshotResponse = await handleEditorAgentApi(new Request(`http://127.0.0.1:8796/api/agent/v1/project?root=${encodeURIComponent(root)}`));
      expect(snapshotResponse?.status).toBe(200);
      expect((await snapshotResponse!.json() as { project: EditorProject }).project.name).toBe("Disk Project");

      const commandResponse = await handleEditorAgentApi(new Request("http://127.0.0.1:8796/api/agent/v1/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:8796" },
        body: JSON.stringify({ projectRoot: root, plan: { requestId: "api-1", intent: "Rename through HTTP", commands: [{ type: "project.patch", label: "API rename", operations: [{ op: "replace", path: "/name", value: "API Result" }] }] } }),
      }));
      expect(commandResponse?.status).toBe(200);
      expect((await commandResponse!.json() as { persisted: boolean; snapshot: { project: EditorProject } }).persisted).toBe(true);
      expect((await readHyperfocusProjectPair<EditorProject>(root)).project.name).toBe("API Result");
    });
  });

  test("rejects cross-origin browser mutations and disabled non-loopback APIs", async () => {
    const headers = { get(name: string) { return name.toLowerCase() === "origin" ? "https://attacker.example" : null; } } as Headers;
    expect(isAllowedEditorAgentOrigin({ headers, url: "http://127.0.0.1:8796/api/agent/v1/commands" })).toBe(false);
    expect(isAllowedEditorAgentOrigin({ headers: new Headers({ Origin: "http://rebinding.example" }), url: "http://rebinding.example/api/agent/v1/commands" })).toBe(false);
    expect((await handleEditorAgentApi(new Request("http://example.test/api/agent/v1/project?root=x"), false))?.status).toBe(403);
  });
});

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
