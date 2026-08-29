import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function readObjectField(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Package manifest must be an object.");
  const field: unknown = Reflect.get(value, key);
  if (field === undefined) return {};
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`Package manifest ${key} must be an object.`);
  return Object.fromEntries(Object.entries(field));
}

describe("application UI architecture boundary", () => {
  test("keeps the engine framework-agnostic", async () => {
    const manifest: unknown = JSON.parse(await read("packages/engine/package.json"));
    const dependencies = { ...readObjectField(manifest, "dependencies"), ...readObjectField(manifest, "devDependencies") };
    expect(dependencies["solid-js"]).toBeUndefined();
    expect(dependencies["react"]).toBeUndefined();
    expect(dependencies["@stylexjs/stylex"]).toBeUndefined();
  });

  test("keeps app chrome out of portable editor projects", async () => {
    const projectSource = await read("packages/engine/src/project/editor.ts");
    expect(projectSource).not.toContain("uiScale:");
    expect(projectSource).not.toContain("sidebarWidth:");
    expect(projectSource).not.toContain("sidebarCollapsed:");
  });

  test("ships the design contract and shared app primitives", async () => {
    const [design, agents, workbench, preferences] = await Promise.all([
      read("DESIGN.md"),
      read("AGENTS.md"),
      read("packages/ui/src/workbench/workbench.tsx"),
      read("packages/ui/src/preferences/model.ts"),
    ]);
    expect(design).toContain("framework-agnostic");
    expect(agents).toContain("Keep `packages/engine/`");
    expect(workbench).toContain('role="separator"');
    expect(preferences).toContain('"shared-user" | "app-user" | "project" | "session"');
  });

  test("does not restore the editor's fixed 920px mobile canvas", async () => {
    expect(await read("apps/engine-editor/styles.css")).not.toContain("min-width:920px");
  });
});
