import { describe, expect, test } from "bun:test";
import { createInMemorySaveStorage, createSaveMigrationRegistry } from "../save/index.ts";
import type { PlayableProject2D } from "./runtime-2d-contracts.ts";
import { createPlayableWorld } from "./runtime-world-2d.ts";
import {
  PLAYABLE_WORLD_SAVE_SCHEMA,
  createPlayableEditorPlaySession2D,
  createPlayableSaveController2D,
  readPlayableSaveDeclaration2D,
  validatePlayableSaveProject2D,
  type PlayableSaveProject2D,
} from "./runtime-save-2d.ts";

describe("portable world save profiles", () => {
  test("saves, restores, exports, imports, and deletes declared slots", async () => {
    const project = saveProject();
    const storage = createInMemorySaveStorage();
    const world = createPlayableWorld(project);
    const saves = createPlayableSaveController2D(project, world, storage)!;
    world.step({ actions: ["move-right"] });
    const savedX = world.getEntity("player")!.x;
    await saves.save();
    world.step({ actions: ["move-right"] });
    expect(world.getEntity("player")!.x).toBeGreaterThan(savedX);
    expect(await saves.restore()).toBe(true);
    expect(world.getEntity("player")!.x).toBe(savedX);

    const exported = await saves.exportProfile();
    await saves.deleteProfile();
    expect(await saves.restore()).toBe(false);
    await saves.importProfile(exported);
    expect(await saves.restore()).toBe(true);
    await saves.deleteSlot();
    expect(await saves.restore()).toBe(false);
  });

  test("migrates an older integrated world slot before restoring it", async () => {
    const storage = createInMemorySaveStorage();
    const oldProject = saveProject(0);
    const oldWorld = createPlayableWorld(oldProject);
    oldWorld.step({ actions: ["move-right"] });
    await createPlayableSaveController2D(oldProject, oldWorld, storage)!.save();

    const currentProject = saveProject(1);
    const currentWorld = createPlayableWorld(currentProject);
    const migrations = createSaveMigrationRegistry().register(0, (data) => data);
    const saves = createPlayableSaveController2D(currentProject, currentWorld, storage, { migrations })!;
    expect(await saves.restoreOnBoot()).toBe(true);
    expect(currentWorld.getEntity("player")!.x).toBe(oldWorld.getEntity("player")!.x);
  });

  test("keeps Editor Play reset state disposable and restore state session-only", () => {
    const session = createPlayableEditorPlaySession2D();
    const resetProject = saveProject(0, "reset");
    const firstReset = createPlayableWorld(resetProject);
    firstReset.step({ actions: ["move-right"] });
    session.stop(resetProject, firstReset);
    const secondReset = createPlayableWorld(resetProject);
    expect(session.start(resetProject, secondReset)).toBe(false);
    expect(secondReset.getEntity("player")!.x).toBe(10);

    const restoreProject = saveProject(0, "restore");
    const firstRestore = createPlayableWorld(restoreProject);
    firstRestore.step({ actions: ["move-right"] });
    session.stop(restoreProject, firstRestore);
    const secondRestore = createPlayableWorld(restoreProject);
    expect(session.start(restoreProject, secondRestore)).toBe(true);
    expect(secondRestore.getEntity("player")!.x).toBe(firstRestore.getEntity("player")!.x);
  });

  test("validates schema, slot policy, project identity, and byte limits", () => {
    const project = saveProject();
    expect(readPlayableSaveDeclaration2D(project)).toMatchObject({ slotPolicy: "single", slots: ["auto"], maxBytes: 262_144 });
    expect(() => validatePlayableSaveProject2D({ ...project, id: undefined })).toThrow("non-empty project id");
    const invalidSlots = structuredClone(project);
    invalidSlots.extensions!.hyperfocusSave.slots = ["auto", "manual"];
    expect(() => validatePlayableSaveProject2D(invalidSlots)).toThrow("single requires exactly one slot");
    const invalidBytes = structuredClone(project);
    invalidBytes.extensions!.hyperfocusSave.maxBytes = 128;
    expect(() => validatePlayableSaveProject2D(invalidBytes)).toThrow("maxBytes");
    const undeclared = structuredClone(project);
    undeclared.extensions!.hyperfocusSave.defaultSlot = "manual";
    expect(() => validatePlayableSaveProject2D(undeclared)).toThrow("must be one of the declared slots");
  });
});

type SaveTestProject = PlayableProject2D & {
  id: string;
  extensions: { hyperfocusSave: {
    schema: typeof PLAYABLE_WORLD_SAVE_SCHEMA;
    dataVersion: number;
    slotPolicy: "single";
    slots: string[];
    defaultSlot: string;
    restoreOnBoot: boolean;
    editorPlay: "reset" | "restore";
    maxBytes: number;
  } };
};

function saveProject(dataVersion = 0, editorPlay: "reset" | "restore" = "reset"): SaveTestProject & PlayableSaveProject2D {
  return {
    id: "save-test-game",
    activeSceneId: "main",
    scenes: [{ id: "main", entities: [{
      id: "player", label: "Player", x: 10, y: 10, width: 8, height: 8, scale: 1, layer: 1,
      color: "#ffffff", accent: "#000000", kind: "actor",
      components: [{ id: "input", type: "input", enabled: true, values: { speed: 60 } }],
    }] }],
    tilemap: { columns: 8, rows: 8, tileSize: 16, values: Array(64).fill(0) },
    settings: { input: [{ action: "move-right", bindings: ["KeyD"] }] },
    extensions: { hyperfocusSave: {
      schema: PLAYABLE_WORLD_SAVE_SCHEMA,
      dataVersion,
      slotPolicy: "single",
      slots: ["auto"],
      defaultSlot: "auto",
      restoreOnBoot: true,
      editorPlay,
      maxBytes: 262_144,
    } },
  };
}
