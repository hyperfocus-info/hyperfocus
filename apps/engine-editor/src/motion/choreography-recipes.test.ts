import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { applyChoreographyRecipe2D } from "./choreography-recipes.ts";

describe("choreography recipes", () => {
  test("builds an editable bite exchange with anticipation, contact, recovery, and effects", () => {
    const project = createDefaultProject("Bite study");
    const [attacker, victim] = project.scenes[0]!.entities;
    const result = applyChoreographyRecipe2D({
      timeline: { durationFrames: 120, tracks: [], effects: [] },
      recipe: "bite",
      frame: 20,
      primary: attacker!,
      secondary: victim!,
      id: "bite-01",
    });

    expect(result.contactFrame).toBe(29);
    expect(result.endFrame).toBeGreaterThanOrEqual(47);
    expect(result.changedTrackIds.length).toBe(8);
    expect(result.timeline.effects?.map((effect) => effect.kind)).toEqual(["camera-shake", "hit-flash", "particle-burst"]);
    expect(result.timeline.effects?.find((effect) => effect.kind === "particle-burst")).toMatchObject({
      frame: 29,
      targetId: victim!.id,
      color: "#b3132b",
      particleCount: 28,
    });
    const attackerX = result.timeline.tracks.find((track) => track.targetId === attacker!.id && track.property === "x");
    expect(attackerX?.keyframes.map((key) => key.frame)).toEqual([20, 24, 29, 34]);
    expect(attackerX?.keyframes[2]!.value).toBeGreaterThan(attacker!.x);
  });

  test("replaces same-frame recipe keys while preserving unrelated authored keys", () => {
    const project = createDefaultProject("Impact study");
    const primary = project.scenes[0]!.entities[0]!;
    const timeline = {
      durationFrames: 60,
      tracks: [{ id: "x", targetId: primary.id, label: "X", property: "x" as const, color: "#ffffff", muted: false, locked: false, keyframes: [
        { id: "before", frame: 3, value: 12, easing: "linear" as const },
        { id: "replace", frame: 10, value: 999, easing: "linear" as const },
      ] }],
      effects: [],
    };
    const result = applyChoreographyRecipe2D({ timeline, recipe: "impact", frame: 10, primary, id: "impact-01" });
    const x = result.timeline.tracks.find((track) => track.id === "x")!;

    expect(x.keyframes.find((key) => key.frame === 3)?.value).toBe(12);
    expect(x.keyframes.filter((key) => key.frame === 10)).toHaveLength(1);
    expect(x.keyframes.find((key) => key.frame === 10)?.value).toBe(primary.x);
    expect(timeline.tracks[0]!.keyframes).toHaveLength(2);
  });

  test("rejects a bite recipe without a contact target", () => {
    const project = createDefaultProject("Invalid bite");
    expect(() => applyChoreographyRecipe2D({
      timeline: { durationFrames: 30, tracks: [] },
      recipe: "bite",
      frame: 0,
      primary: project.scenes[0]!.entities[0]!,
    })).toThrow("needs a second entity");
  });
});
