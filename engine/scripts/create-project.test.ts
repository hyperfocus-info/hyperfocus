import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPortableProject } from "./build-project.ts";
import { createPlayableWorld } from "../src/project/runtime-2d.ts";
import { createPlayableStoryController2D } from "../src/project/runtime-story-2d.ts";
import { createPlayableSaveController2D } from "../src/project/runtime-save-2d.ts";
import { InMemorySaveStorage } from "../src/save/index.ts";
import { PROJECT_STARTERS, createProjectStarter, createStarterProject, inspectProjectStarter, projectCliHelp } from "./create-project.ts";

describe("minimal portable project starters", () => {
  for (const template of PROJECT_STARTERS) {
    test(`${template} writes two canonical files and builds cleanly`, async () => {
      const temporary = await mkdtemp(join(tmpdir(), `hyperfocus-${template}-`));
      const root = join(temporary, "game");
      try {
        const created = await createProjectStarter({ template, outputDirectory: root, name: `Test ${template}` });
        expect(created.canonicalFileCount).toBe(2);
        expect(await filesBelow(root)).toEqual([".hyperfocus/assets.hfp", ".hyperfocus/project.json"]);
        const inspection = await inspectProjectStarter(root);
        expect(inspection).toMatchObject({ ok: true, template, importedAssetCount: template === "3d-action" ? 3 : 0 });
        const projectText = await readFile(join(root, ".hyperfocus", "project.json"), "utf8");
        expect(projectText).not.toMatch(/wrapper|generated\/entities|src\/entities/);
        expect(JSON.parse(projectText).extensions.hyperfocusSave).toMatchObject({ schema: "portable-world-snapshot-v1", slots: ["auto"], maxBytes: 262_144 });
        const built = await buildPortableProject(root);
        expect(built.behaviorCount).toBe(0);
        expect(await filesBelow(join(root, "dist"))).toHaveLength(1);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    });
  }

  test("refuses overwrite and diagnoses a polluted canonical directory", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-starter-diagnostics-"));
    const root = join(temporary, "game");
    try {
      await createProjectStarter({ template: "top-down", outputDirectory: root });
      await expect(createProjectStarter({ template: "grid", outputDirectory: root })).rejects.toThrow("already exists");
      await Bun.write(join(root, ".hyperfocus", "extra.cache"), "not canonical");
      await expect(inspectProjectStarter(root)).rejects.toThrow("must contain exactly");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("documents all templates and the two-file invariant", () => {
    const help = projectCliHelp();
    for (const template of PROJECT_STARTERS) expect(help).toContain(template);
    expect(help).toContain(".hyperfocus/project.json");
    expect(help).toContain(".hyperfocus/assets.hfp");
  });

  test("platformer starter runs the first-party gravity and jump controller", () => {
    const project = createStarterProject("platformer", "Playable Platformer", "2026-01-01T00:00:00.000Z");
    const player = project.scenes[0].entities.find((entity) => entity.id === "player")!;
    expect(player.components.some((component) => component.type === "input")).toBe(false);
    expect(player.components.find((component) => component.id === "player-platformer")).toMatchObject({ type: "behavior", values: { module: "builtin:platformer" } });
    const world = createPlayableWorld(project);
    for (let tick = 0; tick < 60; tick += 1) world.step();
    expect(world.getPlatformerState("player")?.grounded).toBe(true);
    const groundedY = world.getEntity("player")!.y;
    world.step({ actions: ["jump"] });
    expect(world.getEntity("player")!.y).toBeLessThan(groundedY);
  });

  test("narrative RPG starter branches, localizes, advances a quest, and reloads its save", async () => {
    const project = createStarterProject("narrative-rpg", "Narrative RPG", "2026-01-01T00:00:00.000Z");
    const storage = new InMemorySaveStorage();
    const world = createPlayableWorld(project);
    const story = createPlayableStoryController2D(project);
    expect(story.view()).toMatchObject({ type: "line", text: "Bienvenida, Mara. El archivo perdió una reliquia." });
    story.step(["interact"]);
    expect(story.view()).toMatchObject({ type: "choice", options: [{ id: "accept", text: "I will recover it." }, { id: "decline", text: "Todavía no." }] });
    story.step(["choose-accept"]);
    story.step([]);
    story.step(["quest-accept"]);
    expect(story.questSnapshot("lost-relic")).toMatchObject({ stateId: "searching" });
    await createPlayableSaveController2D(project, world, storage, { stateProviders: [story.saveStateProvider()] })!.save();

    const restoredWorld = createPlayableWorld(project);
    const restoredStory = createPlayableStoryController2D(project);
    const saves = createPlayableSaveController2D(project, restoredWorld, storage, { stateProviders: [restoredStory.saveStateProvider()] })!;
    expect(await saves.restoreOnBoot()).toBe(true);
    expect(restoredStory.questSnapshot("lost-relic")).toMatchObject({ stateId: "searching" });
    restoredStory.step([]);
    expect(restoredStory.step(["quest-complete"]).quests).toMatchObject([{ stateId: "complete", complete: true }]);
  });
});

async function filesBelow(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await filesBelow(join(root, entry.name), relative));
    else result.push(relative.replace(/\\/g, "/"));
  }
  return result.sort();
}
