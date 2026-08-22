import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const examples = [
  { id: "drawing-demo", entry: "drawing-demo.html", build: null, preferred: "createBrowserApp" },
  { id: "magic-map-shmup", entry: "magic-map-shmup/src/game.ts", build: "build:example:magic-map-shmup", preferred: "createBrowserApp" },
  { id: "mmo-field", entry: "mmo-field/src/client.ts", build: "build:example:mmo-field", preferred: "createMmoClient" },
  { id: "mmo-skill-demo", entry: "mmo-skill-demo/src/client/client.ts", build: "build:example:mmo-skill-demo", preferred: "createMmoSkillControllerSession" },
  { id: "three-arena", entry: "three-arena/src/client.ts", build: "build:example:three-arena", preferred: "createFixedStepDriver" },
  { id: "motion-lab", entry: "motion-lab/src/client.ts", build: "build:example:motion-lab", preferred: "createFixedStepDriver" },
  { id: "first-party-3d-webgl", entry: "first-party-3d-webgl/main.ts", build: "build:example:first-party-3d-webgl", preferred: "createFixedStepLoop" },
] as const;

test("every runnable example declares an entry, preferred integration, and build coverage where needed", () => {
  const root = resolve(import.meta.dir, "..");
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const aggregateBuild = manifest.scripts?.["build:examples"] ?? "";
  for (const example of examples) {
    const sourcePath = resolve(import.meta.dir, example.entry);
    expect(existsSync(sourcePath), `${example.id} entry`).toBe(true);
    expect(readFileSync(sourcePath, "utf8"), `${example.id} preferred integration`).toContain(example.preferred);
    if (example.build) {
      expect(manifest.scripts?.[example.build], `${example.id} build script`).toBeTruthy();
      expect(aggregateBuild, `${example.id} aggregate build`).toContain(example.build);
    }
  }
});
