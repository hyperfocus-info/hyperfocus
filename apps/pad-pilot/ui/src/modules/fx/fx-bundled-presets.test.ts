import { describe, expect, it } from "bun:test";
import { loadBundledFxPresets, MAX_BUNDLED_FX_PRESETS, mergeFxPresetSummaries } from "./fx-bundled-presets";
import { decodeFxChainState, FxNodeType } from "./fx-chain-state";
import { buildFxPresetItems } from "./fx-module-selectors";

describe("FX bundled presets", () => {
  it("loads preset metadata and payloads from the public manifest", async () => {
    const bytesByFile = new Map<string, Uint8Array>([
      ["pad-pilot-init-default.preset", new Uint8Array([1, 2, 3, 4])],
      ["pad-pilot-empty.preset", new Uint8Array([5, 6, 7, 8])],
    ]);
    const fetchMock = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/fx/chains/presets/index.json")) {
        return Response.json({
          presets: [
            {
              id: "pad_pilot_init_default",
              name: "Lush Foundation",
              file: "pad-pilot-init-default.preset",
              description: "Creative | broad tone, glue, and hall | full mix",
              category: "creative",
              tags: ["creative", "lush"],
              sources: ["full mix"],
              jobs: ["add broad polish"],
              intensity: "medium",
            },
            { id: "pad_pilot_empty", name: "Blank State", file: "pad-pilot-empty.preset", category: "system" },
          ],
        });
      }

      const fileName = url.split("/").pop() ?? "";
      const bytes = bytesByFile.get(fileName);
      if (bytes) {
        return new Response(new Uint8Array(bytes).buffer, { status: 200 });
      }

      return new Response(null, { status: 404 });
    };

    const presets = await loadBundledFxPresets(fetchMock as typeof fetch);

    expect(presets).toHaveLength(2);
    expect(presets[0]?.id).toBe("pad_pilot_init_default");
    expect(presets[0]?.name).toBe("Lush Foundation");
    expect(presets[0]?.description).toBe("Creative | broad tone, glue, and hall | full mix");
    expect(presets[0]?.category).toBe("creative");
    expect(presets[0]?.tags).toEqual(["creative", "lush"]);
    expect(presets[0]?.sources).toEqual(["full mix"]);
    expect(presets[0]?.jobs).toEqual(["add broad polish"]);
    expect(presets[0]?.intensity).toBe("medium");
    expect(presets[0]?.payloadBase64).toBe("AQIDBA==");
    expect(presets[1]?.id).toBe("pad_pilot_empty");
    expect(presets[1]?.name).toBe("Blank State");
    expect(presets[1]?.payloadBase64).toBe("BQYHCA==");
  });

  it("marks curated bundles as factory presets and exposes searchable catalog intent", () => {
    const [item] = buildFxPresetItems([
      {
        id: "curated-1950s-sun-slapback",
        name: "1950s · Sun Slapback",
        description: "Rockabilly, early rock · Lead vocal, electric guitar",
      },
    ], []);

    expect(item?.kind).toBe("factory");
    expect(item?.description).toBe("Rockabilly, early rock · Lead vocal, electric guitar");
  });

  it("merges bundled and host preset summaries without duplicate ids", () => {
    const merged = mergeFxPresetSummaries(
      [
        { id: "pad_pilot_init_default", name: "Default" },
        { id: "pad_pilot_empty", name: "Blank State" },
      ],
      [
        { id: "pad_pilot_empty", name: "Blank State" },
        { id: "user-1", name: "User Preset" },
      ],
    );

    expect(merged).toEqual([
      { id: "pad_pilot_init_default", name: "Default" },
      { id: "pad_pilot_empty", name: "Blank State" },
      { id: "user-1", name: "User Preset" },
    ]);
  });

  it("rejects oversized manifests before starting preset fetches", async () => {
    let presetFetchCount = 0;
    const fetchMock = async (input: string | URL | Request) => {
      if (String(input).endsWith("index.json")) {
        return Response.json({
          presets: Array.from({ length: MAX_BUNDLED_FX_PRESETS + 1 }, (_, index) => ({
            file: `preset-${index}.preset`,
            id: `preset-${index}`,
            name: `Preset ${index}`,
          })),
        });
      }
      presetFetchCount += 1;
      return new Response(Uint8Array.of(1).buffer);
    };

    expect(await loadBundledFxPresets(fetchMock as typeof fetch)).toEqual([]);
    expect(presetFetchCount).toBe(0);
  });

  it("propagates cancellation to an in-flight manifest request", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null = null;
    const fetchMock = (_input: string | URL | Request, init?: RequestInit) => {
      receivedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener("abort", () => reject(receivedSignal?.reason), { once: true });
      });
    };

    const loading = loadBundledFxPresets(fetchMock as typeof fetch, controller.signal);
    controller.abort(new Error("module unmounted"));

    await expect(loading).rejects.toThrow("module unmounted");
    expect(receivedSignal === controller.signal).toBe(true);
  });

  it("ships a default preset without compatibility-only effects", async () => {
    const presetUrl = new URL("../../../public/fx/chains/presets/pad-pilot-init-default.preset", import.meta.url);
    const presetBytes = new Uint8Array(await Bun.file(presetUrl).arrayBuffer());
    const preset = decodeFxChainState(presetBytes);
    const compatibilityOnlyTypes = new Set([
      FxNodeType.CONVOLVER,
      FxNodeType.PHASER,
      FxNodeType.ROTARY_SPEAKER,
      FxNodeType.PITCH_DRIFT,
    ]);

    expect(preset.chains.flatMap((chain) => chain.nodes).some((node) => compatibilityOnlyTypes.has(node.type))).toBe(false);
  });

  it("ships a complete decodable 63-preset catalog with explicit taxonomy", async () => {
    const presetRoot = new URL("../../../public/fx/chains/presets/", import.meta.url);
    const manifest = await Bun.file(new URL("index.json", presetRoot)).json() as {
      presets: Array<{ category?: string; description?: string; era?: string; file: string; id: string; jobs?: string[]; sources?: string[]; tags?: string[] }>;
    };

    expect(manifest.presets).toHaveLength(63);
    expect(manifest.presets.filter((entry) => entry.category === "system")).toHaveLength(1);
    expect(manifest.presets.filter((entry) => entry.category === "utility")).toHaveLength(18);
    expect(manifest.presets.filter((entry) => entry.category === "creative")).toHaveLength(13);
    expect(manifest.presets.filter((entry) => entry.category === "era")).toHaveLength(31);
    for (const entry of manifest.presets) {
      const bytes = new Uint8Array(await Bun.file(new URL(entry.file, presetRoot)).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
      const state = decodeFxChainState(bytes);
      if (entry.id !== "pad_pilot_empty") expect(state.chains.length).toBeGreaterThan(0);
      if (entry.id.startsWith("curated-") || entry.id.startsWith("utility-")) expect(state.selectedPresetId).toBe(entry.id);
      if (entry.era) expect(entry.description?.length).toBeGreaterThan(0);
      if (entry.category === "utility") {
        expect(entry.jobs?.length).toBeGreaterThan(0);
        expect(entry.sources?.length).toBeGreaterThan(0);
        expect(entry.tags).toContain("utility");
      }
    }
  });
});
