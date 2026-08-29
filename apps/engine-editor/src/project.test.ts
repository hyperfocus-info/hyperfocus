import { describe, expect, test } from "bun:test";
import { createDefaultProject, createProjectHistory, migrateProject, stableProjectJson } from "@hyperfocus/engine/project";

describe("editor project model", () => {
  test("creates a valid deterministic project", () => {
    const project = createDefaultProject("Test Game");
    expect(migrateProject(JSON.parse(stableProjectJson(project))).name).toBe("Test Game");
    expect(project.tilemap.values).toHaveLength(160);
    expect(project.atlas.clips?.map((clip) => clip.id)).toEqual(["idle", "walk", "attack"]);
    expect(project.atlas.defaultClipId).toBe("walk");
  });

  test("validates named animation clips and their frame references", () => {
    const project = createDefaultProject("Animated");
    const roundTrip = migrateProject(JSON.parse(stableProjectJson(project)));
    expect(roundTrip.atlas.clips?.find((clip) => clip.id === "attack")).toMatchObject({ fps: 12, loop: false });
    roundTrip.atlas.clips![0]!.sequence = ["missing-frame"];
    expect(() => migrateProject(roundTrip)).toThrow("Atlas clip idle is invalid");
  });

  test("opening a current project does not fabricate a new modification time", () => {
    const project = createDefaultProject("Stable open");
    const updatedAt = project.updatedAt;
    expect(migrateProject(JSON.parse(stableProjectJson(project))).updatedAt).toBe(updatedAt);
  });

  test("does not fabricate an optional tilemap asset reference during migration", () => {
    const project = createDefaultProject("Asset-free project");
    project.assets = [];
    delete project.tilemap.sourceAssetId;
    delete project.atlas.sourceAssetId;
    const migrated = migrateProject(JSON.parse(stableProjectJson(project)));
    expect(migrated.tilemap.sourceAssetId).toBeUndefined();
  });

  test("tracks undo, redo, and saved state", () => {
    const history = createProjectHistory(createDefaultProject(), { snapshotStrategy: "reference" });
    const savedProject = history.project;
    expect(history.transact("Rename", (project) => { project.name = "Changed"; })).toBe(true);
    expect(history.project.name).toBe("Changed");
    expect(history.dirty).toBe(true);
    expect(history.serialize()).toBe(stableProjectJson(history.project));
    expect(history.undo()).toBe(true);
    expect(history.project).toBe(savedProject);
    expect(history.project.name).toBe("Dungeon Run");
    expect(history.dirty).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.project.name).toBe("Changed");
    history.markSaved();
    expect(history.dirty).toBe(false);
  });

  test("keeps the safe history default isolated from borrowed project references", () => {
    const history = createProjectHistory(createDefaultProject());
    const borrowed = history.project;
    history.transact("Rename", (project) => { project.name = "Changed"; });
    borrowed.name = "Mutated borrowed reference";
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("Dungeon Run");
  });

  test("delta history keeps one project object and lazily composes stable dirty-section JSON", () => {
    const history = createProjectHistory(createDefaultProject("Delta"), { snapshotStrategy: "reference" });
    const reference = history.project;
    const initialSections = history.serializationMetrics.sectionSerializations;
    history.transactDelta("Rename", {
      dirtySections: ["name"],
      apply(project) { project.name = "Changed"; },
      revert(project) { project.name = "Delta"; }
    });
    expect(history.project).toBe(reference);
    expect(history.serializationMetrics.sectionSerializations).toBe(initialSections);
    expect(history.serialize()).toBe(stableProjectJson(history.project));
    expect(history.serializationMetrics.sectionSerializations - initialSections).toBe(2);
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("Delta");
    expect(history.redo()).toBe(true);
    expect(history.project.name).toBe("Changed");
  });

  test("section transactions snapshot only declared sections and preserve undo, redo, and validation", () => {
    const history = createProjectHistory(createDefaultProject("Sections"), {
      deltaCheckpointInterval: 0,
      snapshotStrategy: "reference"
    });
    const reference = history.project;
    const originalScenes = history.project.scenes;
    const initialSerializations = history.serializationMetrics.sectionSerializations;

    expect(history.transactSections({
      label: "Rename",
      dirtySections: ["name"],
      update(project) { project.name = "Localized"; }
    })).toBe(true);
    expect(history.project).toBe(reference);
    expect(history.project.scenes).toBe(originalScenes);
    expect(history.serializationMetrics.sectionSerializations).toBe(initialSerializations);
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("Sections");
    expect(history.redo()).toBe(true);
    expect(history.project.name).toBe("Localized");

    expect(history.transactSections({
      label: "No change",
      dirtySections: ["name"],
      update() {}
    })).toBe(false);
    expect(() => history.transactSections({
      label: "Invalid settings",
      dirtySections: ["settings"],
      update(project) { project.settings.masterVolume = 2; }
    })).toThrow("Master volume");
    expect(history.project.settings.masterVolume).toBe(0.8);
  });

  test("periodically checkpoints delta history and allows inverse-only history", () => {
    let reverts = 0;
    const rename = (before: string, after: string) => ({
      dirtySections: ["name"],
      apply(project: ReturnType<typeof createDefaultProject>) { project.name = after; },
      revert(project: ReturnType<typeof createDefaultProject>) { reverts += 1; project.name = before; }
    });
    const history = createProjectHistory(createDefaultProject("Checkpoint"), {
      deltaCheckpointInterval: 2,
      snapshotStrategy: "reference"
    });
    history.transactDelta("First", rename("Checkpoint", "One"));
    history.transactDelta("Second", rename("One", "Two"));
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("One");
    expect(reverts).toBe(0);
    expect(history.undo()).toBe(true);
    expect(history.project.name).toBe("Checkpoint");
    expect(reverts).toBe(1);

    const inverseOnly = createProjectHistory(createDefaultProject("Inverse"), { deltaCheckpointInterval: 0 });
    inverseOnly.transactDelta("Rename", rename("Inverse", "Changed"));
    expect(inverseOnly.undo()).toBe(true);
    expect(reverts).toBe(2);
    expect(() => createProjectHistory(createDefaultProject(), { deltaCheckpointInterval: -1 })).toThrow("checkpoint interval");
  });

  test("rejects invalid files and future versions", () => {
    expect(() => migrateProject({})).toThrow("not a Catalog Engine Editor project");
    expect(() => migrateProject({ format: "catalog-engine-project", version: 99 })).toThrow("not supported");
  });

  test("migrates the pre-rename format and writes the editor discriminator", () => {
    const legacy = { ...createDefaultProject(), format: "catalog-engine-project" };
    expect(migrateProject(legacy).format).toBe("catalog-engine-editor-project");
  });

  test("removes legacy editor chrome from portable project data", () => {
    const legacy: Record<string, unknown> = JSON.parse(stableProjectJson(createDefaultProject()));
    legacy.version = 2;
    legacy.layout = { sidebarWidth: 410, sidebarCollapsed: true };
    const settings = legacy.settings;
    legacy.settings = { ...(settings !== null && typeof settings === "object" && !Array.isArray(settings) ? Object.fromEntries(Object.entries(settings)) : {}), uiScale: 1.4 };
    const migrated = migrateProject(legacy);
    expect("layout" in migrated).toBe(false);
    expect("uiScale" in migrated.settings).toBe(false);
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

  test("round-trips bounded timeline effect cues without forcing them into older projects", () => {
    const project = createDefaultProject();
    project.timeline.effects = [{ id: "bite-blood", frame: 30, durationFrames: 18, label: "Blood burst", kind: "particle-burst", targetId: "player-01", intensity: 1, color: "#b3132b", particleCount: 28 }];
    const migrated = migrateProject(JSON.parse(stableProjectJson(project)));
    expect(migrated.timeline.effects?.[0]).toMatchObject({ kind: "particle-burst", particleCount: 28 });

    migrated.timeline.effects![0]!.particleCount = 129;
    expect(() => migrateProject(migrated)).toThrow("particle count");

    const older = createDefaultProject();
    delete older.timeline.effects;
    expect(migrateProject(older).timeline.effects).toBeUndefined();
  });

  test("round-trips stepped clip tracks and rejects missing clip references", () => {
    const project = createDefaultProject();
    project.timeline.clipTracks = [{ id: "player-animation", targetId: "player-01", label: "Player animation", muted: false, locked: false, keyframes: [
      { id: "idle-at-zero", frame: 0, clipId: "idle" },
      { id: "attack-at-contact", frame: 48, clipId: "attack" },
    ] }];
    const migrated = migrateProject(JSON.parse(stableProjectJson(project)));
    expect(migrated.timeline.clipTracks?.[0]?.keyframes.map((key) => key.clipId)).toEqual(["idle", "attack"]);
    migrated.timeline.clipTracks![0]!.keyframes[1]!.clipId = "missing";
    expect(() => migrateProject(migrated)).toThrow("references missing atlas clip missing");

    const older = createDefaultProject();
    delete older.timeline.clipTracks;
    expect(migrateProject(older).timeline.clipTracks).toBeUndefined();
  });

  test("persists advanced production authoring data", () => {
    const project = migrateProject(JSON.parse(stableProjectJson(createDefaultProject())));
    expect(project.production.export.codec).toBe("avc");
    expect(project.production.reactiveBindings).toHaveLength(2);
    expect(project.production.logicGraph.nodes).toHaveLength(4);
    expect(project.production.spriteRig.bones).toHaveLength(6);
    expect(project.production.annotations[0].frame).toBe(24);

    project.production.midiMappings[0].channel = 17;
    expect(() => migrateProject(project)).toThrow("MIDI channel");
  });
});
