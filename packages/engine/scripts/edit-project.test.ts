import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readHyperfocusProjectPair } from "../src/project/filesystem.ts";
import { migrateProject } from "../src/project/editor.ts";
import { createProjectStarter } from "../tooling/create-project.ts";
import { projectEditCliHelp, setProjectPlayerSpeed } from "./edit-project.ts";

describe("beginner-safe project edit", () => {
  test("atomically changes player speed while retaining exactly two canonical files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-edit-project-"));
    const root = join(temporary, "game");
    try {
      await createProjectStarter({ template: "top-down", outputDirectory: root });
      const result = await setProjectPlayerSpeed(root, 360, { updatedAt: "2026-01-02T00:00:00.000Z" });
      expect(result).toMatchObject({ entityId: "player", previousSpeed: 220, speed: 360, canonicalFileCount: 2 });
      expect((await readdir(join(root, ".hyperfocus"))).sort()).toEqual(["assets.hfp", "project.json"]);
      expect((await readdir(root)).sort()).toEqual([".hyperfocus"]);
      const opened = await readHyperfocusProjectPair(root, { parseProject: migrateProject });
      const player = opened.project.scenes[0].entities.find((entity) => entity.id === "player")!;
      expect(player.components.find((component) => component.type === "input")?.values.speed).toBe(360);
      expect(opened.project.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("rejects unsafe values and explains its narrow operation", async () => {
    await expect(setProjectPlayerSpeed("missing", 0)).rejects.toThrow("from 1 through 2000");
    const help = projectEditCliHelp();
    expect(help).toContain("--player-speed");
    expect(help).toContain("same two canonical files");
    expect(help).toContain("does not generate source");
  });
});
