import { describe, expect, test } from "bun:test";
import type { AudioVoiceHandle } from "@hyperfocus/engine/audio";
import type { PlayableAudioCommand } from "@hyperfocus/engine/project/runtime-2d";
import { createStandaloneAudioController } from "./standalone-audio.ts";

function play(sceneId: string, assetId = "tone"): PlayableAudioCommand {
  return { type: "play", commandId: `play:${sceneId}`, sceneId, entityId: "speaker", componentId: "audio", assetId, bus: "sfx", gain: 0.5, pan: -0.25, loop: true, priority: 2 };
}

describe("standalone first-party audio bridge", () => {
  test("queues until unlock, decodes once, and applies authored playback values", async () => {
    const events: unknown[] = [];
    const buffers = new Set<string>();
    const voice: AudioVoiceHandle = { active: true, stop: () => events.push("stop") };
    const engine = {
      unlock: async () => { events.push("unlock"); },
      setMasterGain: (gain: number) => { events.push(["master", gain]); },
      hasBuffer: (id: string) => buffers.has(id),
      decode: async (id: string) => { events.push(["decode", id]); buffers.add(id); return {}; },
      playBuffer: (id: string, options: unknown) => { events.push(["play", id, options]); return { ok: true as const, voice }; },
      dispose: async () => { events.push("dispose"); },
    };
    const controller = createStandaloneAudioController([{ id: "tone", mimeType: "audio/wav", bytes: new Uint8Array([1, 2]) }], { engine, masterVolume: 0.75 });
    controller.enqueue([play("field"), play("field")]);
    expect(controller.pendingCount()).toBe(2);
    await controller.unlockAndFlush();
    expect(events).toEqual([
      "unlock",
      ["master", 0.75],
      ["decode", "tone"],
      ["play", "tone", { bus: "sfx", gain: 0.5, pan: -0.25, loop: true, priority: 2 }],
      ["play", "tone", { bus: "sfx", gain: 0.5, pan: -0.25, loop: true, priority: 2 }],
    ]);
  });

  test("scene-stop commands cancel queued starts and stop active voices", async () => {
    let stopped = 0;
    const engine = {
      unlock: async () => undefined,
      setMasterGain: () => undefined,
      hasBuffer: () => true,
      decode: async () => ({}),
      playBuffer: () => ({ ok: true as const, voice: { active: true, stop: () => { stopped += 1; } } }),
      dispose: async () => undefined,
    };
    const controller = createStandaloneAudioController([{ id: "tone", mimeType: "audio/wav", bytes: new Uint8Array([1]) }], { engine });
    controller.enqueue([play("field")]);
    controller.enqueue([{ type: "stop-scene", commandId: "stop:field", sceneId: "field" }]);
    expect(controller.pendingCount()).toBe(0);
    controller.enqueue([play("field")]);
    await controller.unlockAndFlush();
    controller.enqueue([{ type: "stop-scene", commandId: "stop:field:2", sceneId: "field" }]);
    expect(stopped).toBe(1);
  });

  test("reports missing packed audio without attempting playback", async () => {
    const errors: string[] = [];
    let plays = 0;
    const engine = {
      unlock: async () => undefined,
      setMasterGain: () => undefined,
      hasBuffer: () => false,
      decode: async () => ({}),
      playBuffer: () => { plays += 1; return { ok: false as const, code: "missing-buffer" as const, message: "missing" }; },
      dispose: async () => undefined,
    };
    const controller = createStandaloneAudioController([], { engine, onError: (error) => errors.push(error.message) });
    controller.enqueue([play("field", "missing")]);
    await controller.unlockAndFlush();
    expect(errors).toEqual(["Standalone audio asset is missing from assets.hfp: missing"]);
    expect(plays).toBe(0);
  });
});
