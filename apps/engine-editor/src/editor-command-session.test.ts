import { describe, expect, test } from "bun:test";
import { applyEditorPatch, createEditorCommandSession, validateCommandPlan, type EditorCommandAsset } from "./editor-command-session.ts";
import { createDefaultProject, stableProjectJson } from "@hyperfocus/engine/project";

describe("DOM-free editor command session", () => {
  test("applies validated project patches and returns explicit handoffs", async () => {
    const session = createEditorCommandSession(createDefaultProject("Before"));
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
    const session = createEditorCommandSession(createDefaultProject("Safe"));
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

  test("rejects unknown command types before execution", () => {
    const session = createEditorCommandSession(createDefaultProject());
    expect(() => validateCommandPlan({ requestId: "unknown-1", intent: "Reject unknown", commands: [{ type: "unknown.command" }] })).toThrow("invalid command");
    expect(session.dirty).toBe(false);
  });

  test("keeps removed binary assets recoverable for project undo", async () => {
    const assets = new Map<string, EditorCommandAsset>();
    const session = createEditorCommandSession(createDefaultProject(), {
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
    expect(assets.has(asset.id)).toBe(true);
    expect(removed.snapshot.project.assets.some((candidate) => candidate.id === asset.id)).toBe(false);
    const restored = await session.execute({ requestId: "asset-3", intent: "Undo asset removal", commands: [{ type: "history.undo" }] });
    expect(restored.snapshot.project.assets.some((candidate) => candidate.id === asset.id)).toBe(true);
    expect(assets.get(asset.id)?.bytes.byteLength).toBe(14);
  });

  test("creates binary-backed starters through the same command host", async () => {
    const assets = new Map<string, EditorCommandAsset>();
    const session = createEditorCommandSession(createDefaultProject(), {
      async putAsset(asset) { assets.set(asset.id, asset); },
      async removeAsset(id) { assets.delete(id); },
    });
    const handoff = await session.execute({ requestId: "starter-1", intent: "Create a headless 3D starter", commands: [{ type: "project.create-starter", starter: "3d-action", name: "Headless World" }] });
    expect(handoff.ok).toBe(true);
    expect(handoff.snapshot.project.name).toBe("Headless World");
    expect(assets.size).toBeGreaterThan(0);
    expect(handoff.snapshot.project.assets.every((asset) => asset.source !== "imported" || /^[0-9a-f]{64}$/.test(asset.sha256 ?? ""))).toBe(true);
  });

  test("hydrates a cataloged asset without duplicating metadata or dirtying history", async () => {
    const project = createDefaultProject("Hydration target");
    project.assets.push({
      id: "existing-data",
      name: "existing.txt",
      kind: "data",
      mimeType: "text/plain",
      size: 3,
      lastModified: 1,
      source: "imported",
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
    const catalogSize = project.assets.length;
    const assets = new Map<string, EditorCommandAsset>();
    const session = createEditorCommandSession(project, {
      async putAsset(asset) { assets.set(asset.id, asset); },
      async removeAsset(id) { assets.delete(id); },
    });
    const handoff = await session.execute({
      requestId: "hydrate-1",
      intent: "Restore packed bytes for an already-open project",
      commands: [{ type: "asset.hydrate", assetId: "existing-data", base64: "YWJj" }],
    });

    expect(handoff.ok).toBe(true);
    expect(handoff.snapshot.project.assets).toHaveLength(catalogSize);
    expect(handoff.snapshot.project.assets.filter((asset) => asset.id === "existing-data")).toHaveLength(1);
    expect(handoff.snapshot.revision).toBe(0);
    expect(handoff.snapshot.dirty).toBe(false);
    expect(assets.get("existing-data")?.bytes).toEqual(new TextEncoder().encode("abc"));
  });

  test("accepts every starter from the canonical extensible inventory", async () => {
    const session = createEditorCommandSession(createDefaultProject("Before"));
    const handoff = await session.execute({ requestId: "platformer-starter", intent: "Create a platformer from the shared starter inventory", commands: [{ type: "project.create-starter", starter: "platformer", name: "Glassline" }] });
    expect(handoff.ok).toBe(true);
    expect(handoff.snapshot.project.extensions?.hyperfocusStarter).toMatchObject({ template: "platformer" });
  });

  test("normalizes portable glTF JSON imported with a generic browser MIME", async () => {
    const assets = new Map<string, EditorCommandAsset>();
    const session = createEditorCommandSession(createDefaultProject(), {
      async putAsset(asset) { assets.set(asset.id, asset); },
      async removeAsset(id) { assets.delete(id); },
    });
    const handoff = await session.execute({ requestId: "gltf-1", intent: "Import portable glTF", commands: [{ type: "asset.import", name: "level.gltf", mimeType: "application/octet-stream", base64: btoa('{"asset":{"version":"2.0"}}') }] });
    expect(handoff.snapshot.project.assets.at(-1)).toMatchObject({ name: "level.gltf", kind: "data", mimeType: "model/gltf+json" });
  });

  test("uses reversible deltas and serializes only dirty top-level sections for project patches", async () => {
    const session = createEditorCommandSession(createDefaultProject("Delta history"));
    const projectReference = session.project;
    const initialSections = session.serializationMetrics.sectionSerializations;
    const handoff = await session.execute({
      requestId: "delta-1",
      intent: "Rename without cloning every project version",
      commands: [{ type: "project.patch", label: "Rename", operations: [{ op: "replace", path: "/name", value: "Delta changed" }] }]
    });

    expect(handoff.ok).toBe(true);
    expect(session.project).toBe(projectReference);
    expect(session.project.name).toBe("Delta changed");
    expect(session.serializationMetrics.sectionSerializations).toBe(initialSections);
    expect(session.serialize()).toBe(stableProjectJson(session.project));
    expect(session.serializationMetrics.sectionSerializations - initialSections).toBe(2);
    expect(session.undo()).toBe(true);
    expect(session.project).toBe(projectReference);
    expect(session.project.name).toBe("Delta history");
    expect(session.redo()).toBe(true);
    expect(session.project.name).toBe("Delta changed");
  });

  test("reverses array additions at their concrete index", async () => {
    const session = createEditorCommandSession(createDefaultProject());
    const before = session.project.settings.input.length;
    await session.execute({ requestId: "delta-array", intent: "Add binding", commands: [{
      type: "project.patch", label: "Add input", operations: [{ op: "add", path: "/settings/input/-",
        value: { action: "dash", bindings: ["ShiftLeft"] } }]
    }] });
    expect(session.project.settings.input).toHaveLength(before + 1);
    session.undo();
    expect(session.project.settings.input).toHaveLength(before);
    session.redo();
    expect(session.project.settings.input.at(-1)?.action).toBe("dash");
  });

  test("applies reusable choreography through the DOM-free command surface", async () => {
    const project = createDefaultProject("Command choreography");
    const [attacker, victim] = project.scenes[0]!.entities;
    const session = createEditorCommandSession(project);
    const handoff = await session.execute({ requestId: "bite-command", intent: "Author a complete bite exchange", commands: [{
      type: "timeline.apply-recipe",
      recipe: "bite",
      frame: 40,
      primaryEntityId: attacker!.id,
      secondaryEntityId: victim!.id,
      id: "bite-command-01",
    }] });

    expect(handoff.ok).toBe(true);
    expect(handoff.results[0]?.detail).toContain("8 editable tracks, 3 effects, contact frame 49");
    expect(handoff.snapshot.project.timeline.effects?.map((effect) => effect.kind)).toEqual(["camera-shake", "hit-flash", "particle-burst"]);
    expect(handoff.snapshot.dirty).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.project.timeline.effects).toEqual([]);
  });

  test("authors and replaces stepped animation clip cues through the DOM-free command surface", async () => {
    const project = createDefaultProject("Command clip cues");
    const entity = project.scenes[0]!.entities[0]!;
    const session = createEditorCommandSession(project);
    const first = await session.execute({ requestId: "idle-cue", intent: "Switch the actor to idle", commands: [{
      type: "timeline.set-clip-key", entityId: entity.id, clipId: "idle", frame: 24,
    }] });
    expect(first.ok).toBe(true);
    expect(first.results[0]?.detail).toContain("Set Idle");
    const track = session.project.timeline.clipTracks?.[0];
    expect(track).toMatchObject({ targetId: entity.id, keyframes: [{ frame: 24, clipId: "idle" }] });

    const replace = await session.execute({ requestId: "attack-cue", intent: "Replace that cue", commands: [{
      type: "timeline.set-clip-key", entityId: entity.id, clipId: "attack", frame: 24, trackId: track!.id,
    }] });
    expect(replace.results[0]?.detail).toContain("Updated Attack");
    expect(session.project.timeline.clipTracks?.[0]?.keyframes).toHaveLength(1);
    expect(session.project.timeline.clipTracks?.[0]?.keyframes[0]?.clipId).toBe("attack");
    expect(session.undo()).toBe(true);
    expect(session.project.timeline.clipTracks?.[0]?.keyframes[0]?.clipId).toBe("idle");
  });
});
