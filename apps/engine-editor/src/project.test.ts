import { describe, expect, test } from "bun:test";
import { ProjectHistory, createDefaultProject, migrateProject, stableProjectJson } from "./project.ts";

describe("editor project model", () => {
  test("creates a valid deterministic project", () => {
    const project = createDefaultProject("Test Game");
    expect(migrateProject(JSON.parse(stableProjectJson(project))).name).toBe("Test Game");
    expect(project.tilemap.values).toHaveLength(160);
  });

  test("opening a current project does not fabricate a new modification time", () => {
    const project = createDefaultProject("Stable open");
    const updatedAt = project.updatedAt;
    expect(migrateProject(JSON.parse(stableProjectJson(project))).updatedAt).toBe(updatedAt);
  });

  test("tracks undo, redo, and saved state", () => {
    const history = new ProjectHistory(createDefaultProject());
    history.transact("Rename", (project) => { project.name = "Changed"; });
    expect(history.project.name).toBe("Changed");
    expect(history.dirty).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("Dungeon Run");
    expect(history.redo()).toBe(true);
    expect(history.project.name).toBe("Changed");
    history.markSaved();
    expect(history.dirty).toBe(false);
  });

  test("rejects invalid files and future versions", () => {
    expect(() => migrateProject({})).toThrow("not a Catalog Engine Editor project");
    expect(() => migrateProject({ format: "catalog-engine-project", version: 99 })).toThrow("not supported");
  });

  test("migrates the pre-rename format and writes the editor discriminator", () => {
    const legacy = { ...createDefaultProject(), format: "catalog-engine-project" };
    expect(migrateProject(legacy).format).toBe("catalog-engine-editor-project");
  });

  test("does not opt older projects into browser saves during migration", () => {
    const existing = createDefaultProject();
    delete existing.extensions;
    expect(migrateProject(existing).extensions).toBeUndefined();
    expect(() => migrateProject({ ...existing, extensions: "invalid" })).toThrow("extensions must be an object");
  });

  test("rejects non-finite transforms and parenting cycles", () => {
    const invalidTransform = createDefaultProject();
    invalidTransform.scenes[0].entities[0].x = Number.NaN;
    expect(() => migrateProject(invalidTransform)).toThrow("must be between");

    const cycle = createDefaultProject();
    cycle.scenes[0].entities[0].parentId = cycle.scenes[0].entities[1].id;
    cycle.scenes[0].entities[1].parentId = cycle.scenes[0].entities[0].id;
    expect(() => migrateProject(cycle)).toThrow("parenting cycle");
  });

  test("round-trips timeline keys, audio mix, loop points, and events", () => {
    const project = createDefaultProject();
    const migrated = migrateProject(JSON.parse(stableProjectJson(project)));
    expect(migrated.timeline.fps).toBe(30);
    expect(migrated.timeline.tracks[0].keyframes).toHaveLength(4);
    expect(migrated.timeline.audioTracks[0].loopEnd).toBe(264);
    expect(migrated.timeline.events.map((event) => event.kind)).toEqual(["audio", "camera", "logic", "marker"]);

    migrated.timeline.tracks[0].keyframes[0].frame = -1;
    expect(() => migrateProject(migrated)).toThrow("Keyframe frame");
  });

  test("persists advanced production authoring data", () => {
    const project = migrateProject(JSON.parse(stableProjectJson(createDefaultProject())));
    expect(project.production.export.codec).toBe("vp8");
    expect(project.production.reactiveBindings).toHaveLength(2);
    expect(project.production.logicGraph.nodes).toHaveLength(4);
    expect(project.production.spriteRig.bones).toHaveLength(6);
    expect(project.production.annotations[0].frame).toBe(24);

    project.production.midiMappings[0].channel = 17;
    expect(() => migrateProject(project)).toThrow("MIDI channel");
  });
});
