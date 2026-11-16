import { describe, expect, test } from "bun:test";
import { createWorldPassPacket } from "./plan-world-pass";
import type { ChunkScore } from "./world-analysis";

const chunk: ChunkScore = {
  index: 8, id: "8,0", chunkX: 8, chunkY: 0, xRange: "512-575", yRange: "0-63",
  zones: [{ id: "void-rift", tiles: 4096, pct: 100 }], anchors: [],
  npcCount: 2, landmarkCount: 1, landmarkKinds: {}, serviceCount: 0,
  resourceTiles: 0, pathTiles: 0, waterTiles: 0, score: 1, components: { landmarks: 1 },
  normalized: -1, band: "sparse", nearbyAnchors: [],
  why: "Sparse travel space near a known route.", recommendation: "Inspect whether this gap is intentional.",
  questHooks: ["Recover a route marker."], relocationTargets: []
};

function commandsFor(packet: ReturnType<typeof createWorldPassPacket>) {
  return [...packet.deterministicCommands, ...packet.verification.map((check) => check.command)];
}

describe("world pass packet scope", () => {
  test("a density review does not assign edits or implementation verification", () => {
    const packet = createWorldPassPacket({ chunk });
    expect(packet.scope).toBe("review");
    expect(packet.ownedPaths).toEqual([]);
    expect(packet.verification).toEqual([]);
    expect(packet.deterministicCommands).toHaveLength(1);
    expect(packet.deterministicCommands[0]).toContain("heat-map.ts --chunk 8");
    expect(packet.candidateContent.questHooks).toEqual(chunk.questHooks);
  });

  test("quest potential does not expand a landmark pass into quest work", () => {
    const packet = createWorldPassPacket({ chunk, scope: "landmarks" });
    expect(packet.ownedPaths).toContain("./src/data/world-landmarks.ts");
    expect(packet.ownedPaths.some((file) => file.includes("quest") || file.includes("travel"))).toBe(false);
    expect(commandsFor(packet).some((command) => command.includes("quest-seed"))).toBe(false);
    expect(commandsFor(packet).some((command) => command.includes("render-actors.test.ts"))).toBe(true);
    expect(packet.verification.filter((check) => check.command.includes("build"))).toMatchObject([
      { when: "runtime source or content changes" }
    ]);
    expect(packet.verification.filter((check) => check.command.includes("screenshot:world"))).toMatchObject([
      { when: "camera-readable surfaces change" }
    ]);
  });

  test("explicit quest work retains focused quest coverage and a read-only seed preview", () => {
    const packet = createWorldPassPacket({ chunk, scope: "quests" });
    expect(packet.ownedPaths).toContain("./src/data/world-quests.ts");
    expect(packet.ownedPaths).not.toContain("./src/data/world-landmarks.ts");
    expect(commandsFor(packet).some((command) => command.includes("shared-world-replication.test.ts"))).toBe(true);
    expect(packet.deterministicCommands.filter((command) => command.includes("quest-seed"))).toEqual([
      "bun.cmd .\\.agents\\skills\\world-building\\scripts\\quest-seed.ts --chunk 8 --dry-run"
    ]);
    expect(commandsFor(packet).some((command) => command.includes("landmark-snippets"))).toBe(false);
  });

  test("no scope runs every source test or writes generated quest data", () => {
    for (const scope of ["review", "landmarks", "quests"] as const) {
      for (const command of commandsFor(createWorldPassPacket({ chunk, scope }))) {
        expect(command).not.toMatch(/bun\.cmd test (?:\.\/)?src[\\/]tests$/);
        expect(command).not.toContain("--write");
      }
    }
  });
});
