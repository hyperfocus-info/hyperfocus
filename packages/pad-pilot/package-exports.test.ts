import { expect, test } from "bun:test";
import packageManifest from "./package.json";

test("every declared @hyperfocus/pad-pilot subpath resolves through the package manifest", async () => {
  const specifiers = Object.keys(packageManifest.exports).map((subpath) =>
    subpath === "." ? "@hyperfocus/pad-pilot" : `@hyperfocus/pad-pilot${subpath.slice(1)}`
  );

  const loaded = await Promise.all(specifiers.map((specifier) => import(specifier)));
  expect(loaded).toHaveLength(specifiers.length);
  expect(loaded.every((moduleExports) => Object.keys(moduleExports).length > 0)).toBe(true);
});
