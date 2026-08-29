import { describe, expect, test } from "bun:test";
import { compileEditorSource, handleEditorSourceApi } from "./source-compiler-api.ts";

describe("editor live source compiler", () => {
  test("bundles explicitly supplied TypeScript and relative imports into a behavior registry", async () => {
    const code = await compileEditorSource({
      version: 1,
      files: [
        { path: "src/speed.ts", source: "export const speed: number = 72;" },
        { path: "src/player.ts", source: "import { speed } from './speed'; export const update = () => ({ velocityX: speed });" },
      ],
      behaviors: [{ module: "./src/player.ts", exportName: "update" }],
    });
    const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const module = requireRecord(loaded, "compiled source module");
    const registry = requireRecord(module.default, "compiled behavior registry");
    const update = registry["./src/player.ts#update"];
    if (typeof update !== "function") throw new TypeError("Compiled behavior update must be a function.");
    expect(Reflect.apply(update, undefined, [])).toEqual({ velocityX: 72 });
  });

  test("emits a classic-script behavior registry for offline standalone builds", async () => {
    const code = await compileEditorSource({
      version: 1,
      target: "standalone",
      files: [{ path: "src/player.ts", source: "export const update = () => ({ velocityX: 12 });" }],
      behaviors: [{ module: "./src/player.ts", exportName: "update" }],
    });
    expect(code).toContain("__hyperfocusProjectBehaviors");
    expect(code).not.toMatch(/\bexport\s+default\b|\bimport\s/);
  });

  test("cannot import files or packages outside the explicitly supplied source set", async () => {
    await expect(compileEditorSource({
      version: 1,
      files: [{ path: "src/player.ts", source: "import value from 'node:fs'; export const update = () => value;" }],
      behaviors: [{ module: "./src/player.ts", exportName: "update" }],
    })).rejects.toThrow("not available in the in-editor live source bundle");
    await expect(compileEditorSource({
      version: 1,
      files: [{ path: "src/player.ts", source: "export const update = () => { void import(location.hash); };" }],
      behaviors: [{ module: "./src/player.ts", exportName: "update" }],
    })).rejects.toThrow("retained an unresolved import");
  });

  test("is loopback-only and rejects cross-origin browser requests", async () => {
    const disabled = await handleEditorSourceApi(new Request("http://127.0.0.1:8796/api/source/v1/compile", { method: "POST", body: "{}" }), false);
    expect(disabled?.status).toBe(403);
    // Happy DOM's Request implementation drops forbidden browser headers, so
    // pass the server-visible request shape directly for this policy check.
    const crossOrigin = await handleEditorSourceApi({
      url: "http://127.0.0.1:8796/api/source/v1/compile",
      method: "POST",
      headers: new Headers({ origin: "https://example.com" }),
      text: async () => "",
    });
    expect(crossOrigin?.status).toBe(403);
  });
});

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}
