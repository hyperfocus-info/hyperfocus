import { describe, expect, test } from "bun:test";
import { hashHyperfocusAsset } from "../../../engine/src/project/index.ts";
import { collectPlayableBuildAssets, playableAssetDataUrl } from "./playable-build-assets.ts";
import { createDefaultProject } from "./project.ts";

describe("standalone playable asset collection", () => {
  test("verifies and deduplicates bytes into an HTML-safe representation", async () => {
    const project = createDefaultProject("Playable assets");
    disableDefaultBehaviors(project);
    const bytes = new Uint8Array([0, 1, 2, 60, 62, 255]);
    const sha256 = await hashHyperfocusAsset(bytes);
    project.assets.push(
      imported("image-a", "a.png", "image", "image/png", bytes.byteLength, sha256),
      imported("image-b", "b.png", "image", "image/png", bytes.byteLength, sha256),
    );

    const collection = await collectPlayableBuildAssets(project, async () => new Blob([bytes], { type: "image/png" }));

    expect(collection.ok).toBe(true);
    expect(collection.assets).toHaveLength(2);
    expect(collection.objects).toHaveLength(1);
    expect(collection.assets[0].objectIndex).toBe(0);
    expect(collection.assets[1].objectIndex).toBe(0);
    expect(collection.objects[0].base64).toBe("AAECPD7/");
    expect(collection.objects[0].base64).not.toMatch(/[<>"'&]/);
    expect(playableAssetDataUrl(collection.assets[0], collection.objects[0])).toBe("data:image/png;base64,AAECPD7/");
    expect(collection.totalBytes).toBe(bytes.byteLength * 2);
  });

  test("accumulates missing, stale, MIME, unsupported, and read diagnostics", async () => {
    const project = createDefaultProject("Broken assets");
    disableDefaultBehaviors(project);
    project.assets.push(
      imported("missing", "missing.png", "image", "image/png", 2),
      imported("stale", "stale.png", "image", "image/png", 2),
      imported("mime", "mime.png", "image", "image/png", 2),
      imported("model", "mesh.glb", "unknown", "model/gltf-binary", 2),
      imported("failed", "failed.json", "data", "application/json", 2),
    );
    const resolver = async (id: string) => {
      if (id === "missing") return undefined;
      if (id === "stale") return new Blob([new Uint8Array(3)], { type: "image/png" });
      if (id === "mime") return new Blob([new Uint8Array(2)], { type: "image/jpeg" });
      if (id === "failed") throw new Error("database unavailable");
      return new Blob([new Uint8Array(2)], { type: "model/gltf-binary" });
    };

    const collection = await collectPlayableBuildAssets(project, resolver);

    expect(collection.ok).toBe(false);
    expect(collection.diagnostics.map((item) => item.code)).toEqual([
      "MISSING_ASSET",
      "ASSET_SIZE_MISMATCH",
      "ASSET_MIME_MISMATCH",
      "UNSUPPORTED_ASSET",
      "ASSET_READ_FAILED",
    ]);
    expect(collection.diagnostics.at(-1)?.message).toContain("database unavailable");
  });

  test("rejects a stale content hash", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    const bytes = new Uint8Array([1, 2, 3]);
    project.assets.push(imported("stale-hash", "stale.bin", "data", "application/octet-stream", 3, "0".repeat(64)));

    const collection = await collectPlayableBuildAssets(project, async () => new Blob([bytes], { type: "application/octet-stream" }));

    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ code: "ASSET_HASH_MISMATCH", assetId: "stale-hash" }]);
    expect(collection.assets).toHaveLength(0);
  });

  test("blocks source and unknown modules while accepting known built-ins", async () => {
    const project = createDefaultProject();
    const player = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    const sentinels = project.scenes[0].entities.filter((entity) => entity.id.startsWith("sentinel-"));
    player.components.find((component) => component.type === "behavior")!.values.module = "builtin:player";
    sentinels[0].components.find((component) => component.type === "behavior")!.values.module = "builtin:patrol";
    sentinels[1].components.find((component) => component.type === "behavior")!.values.module = "builtin:future";

    const collection = await collectPlayableBuildAssets(project, async () => undefined);
    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ severity: "error", code: "UNKNOWN_BUILTIN_BEHAVIOR" }]);

    player.components.find((component) => component.type === "behavior")!.values.module = "./src/player.ts";
    const blocked = await collectPlayableBuildAssets(project, async () => undefined);
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((item) => item.code === "UNSUPPORTED_BEHAVIOR_MODULE" && item.entityId === "player-01")).toBe(true);
  });

  test("enforces count and byte limits before resolving Blob payloads", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    project.assets.push(imported("a", "a.txt", "data", "text/plain", 2), imported("b", "b.txt", "data", "text/plain", 2));
    let reads = 0;
    const countFailure = await collectPlayableBuildAssets(project, async () => {
      reads += 1;
      return new Blob(["xx"], { type: "text/plain" });
    }, { maxAssets: 1 });
    expect(countFailure.diagnostics[0].code).toBe("ASSET_COUNT_LIMIT_EXCEEDED");
    expect(reads).toBe(0);

    const totalFailure = await collectPlayableBuildAssets(project, async () => {
      reads += 1;
      return new Blob(["xx"], { type: "text/plain" });
    }, { maxTotalBytes: 3 });
    expect(totalFailure.diagnostics[0].code).toBe("ASSET_TOTAL_LIMIT_EXCEEDED");
    expect(reads).toBe(0);
  });

  test("rejects unsafe MIME text before it can reach a data URL", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    project.assets.push(imported("unsafe", "unsafe.png", "image", 'image/png";x=', 1));
    let reads = 0;
    const collection = await collectPlayableBuildAssets(project, async () => {
      reads += 1;
      return new Blob([new Uint8Array(1)]);
    });
    expect(collection.diagnostics).toMatchObject([{ code: "UNSAFE_ASSET_MIME", assetId: "unsafe" }]);
    expect(reads).toBe(0);
  });

  test("blocks enabled audio components without an imported asset reference", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    project.scenes[0].entities[0].components.push({ id: "empty-audio", type: "audio", enabled: true, values: { asset: "", trigger: "start" } });
    const collection = await collectPlayableBuildAssets(project, async () => undefined);
    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ code: "MISSING_COMPONENT_ASSET", componentId: "empty-audio" }]);
  });

  test("accepts reachable builtin navigation and reports invalid routes during preflight", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    const actor = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    actor.components.push({ id: "navigate", type: "behavior", enabled: true, values: { module: "builtin:navigate", targetX: 340, targetY: 242, speed: 100 } });
    expect((await collectPlayableBuildAssets(project, async () => undefined)).diagnostics).toEqual([]);
    actor.components.find((component) => component.id === "navigate")!.values.targetX = -10;
    expect((await collectPlayableBuildAssets(project, async () => undefined)).diagnostics).toMatchObject([{ code: "INVALID_NAVIGATION", componentId: "navigate" }]);
  });

  test("blocks malformed platformer controllers during build preflight", async () => {
    const project = createDefaultProject();
    disableDefaultBehaviors(project);
    const player = project.scenes[0].entities.find((entity) => entity.id === "player-01")!;
    player.components = player.components.filter((component) => component.type !== "input");
    player.components.find((component) => component.type === "collider")!.enabled = true;
    player.components.push({
      id: "platformer",
      type: "behavior",
      enabled: true,
      values: { module: "builtin:platformer", gravity: -1 },
    });

    const collection = await collectPlayableBuildAssets(project, async () => undefined);
    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ code: "INVALID_PLATFORMER" }]);
    expect(collection.diagnostics[0].message).toContain("gravity");
  });

  test("blocks malformed browser save policy during build preflight", async () => {
    const project = createDefaultProject();
    (project.extensions!.hyperfocusSave as Record<string, unknown>).maxBytes = 128;
    const collection = await collectPlayableBuildAssets(project, async () => undefined);
    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ code: "INVALID_SAVE_POLICY" }]);
  });

  test("blocks malformed story references during build preflight", async () => {
    const project = createDefaultProject();
    project.extensions!.hyperfocusStory = {
      version: 1,
      source: { defaultLocale: "en", locales: [{ locale: "en", messages: { hello: "Hello" } }], dialogues: [{ id: "intro", start: "line", nodes: [{ id: "line", type: "line", textKey: "missing" }] }], quests: [] },
      locale: "en", variables: {}, flags: {}, entryDialogue: "intro", activeQuests: [], advanceAction: "interact", choiceActions: [], questEventActions: [],
    };
    const collection = await collectPlayableBuildAssets(project, async () => undefined);
    expect(collection.ok).toBe(false);
    expect(collection.diagnostics).toMatchObject([{ code: "INVALID_STORY" }]);
    expect(collection.diagnostics[0].message).toContain("missing default-locale");
  });
});

function imported(
  id: string,
  name: string,
  kind: "image" | "audio" | "data" | "font" | "unknown",
  mimeType: string,
  size: number,
  sha256?: string,
) {
  return { id, name, kind, mimeType, size, lastModified: 1, source: "imported" as const, ...(sha256 ? { sha256 } : {}) };
}

function disableDefaultBehaviors(project: ReturnType<typeof createDefaultProject>) {
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "behavior") component.enabled = false;
      }
    }
  }
}
