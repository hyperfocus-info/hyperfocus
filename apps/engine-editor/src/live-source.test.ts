import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { compileStandaloneProjectSource, createLiveSourceRequest, hasCustomProjectBehaviors } from "./live-source.ts";

describe("editor live source request", () => {
  test("requests a standalone registry for custom project source", async () => {
    const project = createDefaultProject();
    const behavior = project.scenes[0].entities.flatMap((entity) => entity.components).find((component) => component.type === "behavior")!;
    behavior.values.module = "./src/player.ts";
    behavior.values.export = "update";
    project.extensions ??= {};
    project.extensions.hyperfocusScripts = {
      activePath: "src/player.ts",
      files: [{ path: "src/player.ts", language: "typescript", source: "export const update=()=>({});" }],
    };
    let body: Record<string, unknown> | undefined;
    const source = await compileStandaloneProjectSource(project, async (_input, init) => {
      const parsed: unknown = JSON.parse(String(init?.body));
      body = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed)) : undefined;
      return Response.json({ version: 1, code: "globalThis.__hyperfocusProjectBehaviors={};" });
    });
    expect(body?.target).toBe("standalone");
    expect(source).toContain("__hyperfocusProjectBehaviors");
  });

  test("sends only embedded project source after the caller grants permission", () => {
    const project = createDefaultProject();
    const behavior = project.scenes[0].entities.flatMap((entity) => entity.components).find((component) => component.type === "behavior")!;
    behavior.values.module = "./src/player.ts";
    behavior.values.export = "update";
    project.extensions ??= {};
    project.extensions.hyperfocusScripts = {
      activePath: "src/player.ts",
      files: [{ path: "src/player.ts", language: "typescript", source: "export const update = () => ({ velocityX: 1 });" }],
    };

    expect(hasCustomProjectBehaviors(project)).toBe(true);
    expect(createLiveSourceRequest(project)).toEqual({
      version: 1,
      files: [{ path: "src/player.ts", source: "export const update = () => ({ velocityX: 1 });" }],
      behaviors: [{ module: "./src/player.ts", exportName: "update" }],
    });
  });

  test("does not mistake built-in behavior modules for project source", () => {
    const project = createDefaultProject();
    expect(hasCustomProjectBehaviors(project)).toBe(false);
    expect(createLiveSourceRequest(project).behaviors).toEqual([]);
  });
});
