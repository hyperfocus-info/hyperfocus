import { describe, expect, test } from "bun:test";
import { EditorCommandSession, applyEditorPatch, type EditorCommandAsset } from "./editor-command-session.ts";
import { createDefaultProject } from "./project.ts";

describe("DOM-free editor command session", () => {
  test("applies validated project patches and returns explicit handoffs", async () => {
    const session = new EditorCommandSession(createDefaultProject("Before"));
    const handoff = await session.execute({
      requestId: "rename-1",
      intent: "Rename and retarget the project without a browser",
      commands: [{
        type: "project.patch",
        label: "Rename project",
        operations: [
          { op: "test", path: "/name", value: "Before" },
          { op: "replace", path: "/name", value: "After" },
          { op: "replace", path: "/settings/targetProfile", value: "mobile" },
        ],
      }],
    });

    expect(handoff.ok).toBe(true);
    expect(handoff.completedCommands).toBe(1);
    expect(handoff.snapshot.project.name).toBe("After");
    expect(handoff.snapshot.project.settings.targetProfile).toBe("mobile");
    expect(handoff.snapshot.dirty).toBe(true);
    expect(handoff.snapshot.revision).toBe(1);
  });

  test("validation failures do not mutate authoritative state", async () => {
    const session = new EditorCommandSession(createDefaultProject("Safe"));
    const handoff = await session.execute({
      requestId: "invalid-1",
      intent: "Reject an invalid project mutation",
      commands: [{ type: "project.patch", label: "Break scenes", operations: [{ op: "remove", path: "/scenes/0" }] }],
    });

    expect(handoff.ok).toBe(false);
    expect(session.project.name).toBe("Safe");
    expect(session.project.scenes).toHaveLength(1);
    expect(session.dirty).toBe(false);
  });

  test("rejects prototype paths, missing replacements, and failed tests", () => {
    const project = createDefaultProject();
    expect(() => applyEditorPatch(project, [{ op: "add", path: "/__proto__/polluted", value: true }])).toThrow("Unsafe JSON pointer");
    expect(() => applyEditorPatch(project, [{ op: "add", path: "/bad~2token", value: true }])).toThrow("Invalid JSON pointer escape");
    expect(() => applyEditorPatch(project, [{ op: "replace", path: "/missing", value: true }])).toThrow("does not exist");
    expect(() => applyEditorPatch(project, [{ op: "test", path: "/name", value: "Wrong" }])).toThrow("test failed");
  });

  test("rejects unknown command types before execution", async () => {
    const session = new EditorCommandSession(createDefaultProject());
    await expect(session.execute({ requestId: "unknown-1", intent: "Reject unknown", commands: [{ type: "unknown.command" } as never] })).rejects.toThrow("unknown command");
    expect(session.dirty).toBe(false);
  });

  test("imports and removes binary assets through an injected host", async () => {
    const assets = new Map<string, EditorCommandAsset>();
    const session = new EditorCommandSession(createDefaultProject(), {
      async putAsset(asset) { assets.set(asset.id, asset); },
      async removeAsset(id) { assets.delete(id); },
    });
    const imported = await session.execute({
      requestId: "asset-1",
      intent: "Import agent-owned data",
      commands: [{ type: "asset.import", name: "custom.json", mimeType: "application/json", base64: btoa('{"ready":true}') }],
    });
    const asset = imported.snapshot.project.assets.find((candidate) => candidate.name === "custom.json")!;
    expect(imported.ok).toBe(true);
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(assets.get(asset.id)?.bytes.byteLength).toBe(14);

    const removed = await session.execute({ requestId: "asset-2", intent: "Remove imported data", commands: [{ type: "asset.remove", assetId: asset.id }] });
    expect(removed.ok).toBe(true);
    expect(assets.has(asset.id)).toBe(false);
    expect(removed.snapshot.project.assets.some((candidate) => candidate.id === asset.id)).toBe(false);
  });

  test("creates binary-backed starters through the same command host", async () => {
    const assets = new Map<string, EditorCommandAsset>();
    const session = new EditorCommandSession(createDefaultProject(), {
      async putAsset(asset) { assets.set(asset.id, asset); },
      async removeAsset(id) { assets.delete(id); },
    });
    const handoff = await session.execute({ requestId: "starter-1", intent: "Create a headless 3D starter", commands: [{ type: "project.create-starter", starter: "3d-action", name: "Headless World" }] });
    expect(handoff.ok).toBe(true);
    expect(handoff.snapshot.project.name).toBe("Headless World");
    expect(assets.size).toBeGreaterThan(0);
    expect(handoff.snapshot.project.assets.every((asset) => asset.source !== "imported" || /^[0-9a-f]{64}$/.test(asset.sha256 ?? ""))).toBe(true);
  });
});
