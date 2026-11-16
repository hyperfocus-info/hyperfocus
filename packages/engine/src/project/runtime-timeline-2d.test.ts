import { describe, expect, test } from "bun:test";
import type { PlayableWorldSnapshot } from "./runtime2d/runtime-2d-contracts.ts";
import {
  applyTimelineEasing2D,
  applyTimelineOverrides2D,
  auditPlayableTimeline2D,
  createPlayableTimeline2D,
  evaluateTimelineClipTrack2D,
  evaluateTimelineTrack2D,
  PlayableTimeline2D,
  sampleTimelineEffects2D,
  sampleTimelineCamera2D,
  TIMELINE_CAMERA_TARGET_2D,
  timelineEffectNoise2D,
  type PlayableTimelineProject2D,
  type TimelineDeclaration2D,
  type TimelineTrack2D,
} from "./runtime-timeline-2d.ts";

describe("deterministic 2D timeline runtime", () => {
  test("consecutive rain particles cover the viewport for different cue ids", () => {
    for (const id of ["rain", "effect-rain-1", "weather", "E30", "rain-123456789"]) {
      const bins = new Set<number>();
      for (let index = 0; index < 84; index += 1) {
        const value = (timelineEffectNoise2D(id, index) + 1) / 2;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        bins.add(Math.min(7, Math.floor(value * 8)));
      }
      expect(bins.size).toBe(8);
    }
  });

  test("weather and showers sustain throughout the cue while bursts decay", () => {
    for (const preset of ["rain", "snow", "confetti", "smoke", "sparks"]) {
      const declaration = timeline({ effects: [{ id: preset, frame: 0, durationFrames: 20, label: preset, kind: "particle-burst", preset, intensity: 1 }] });
      for (const frame of [0, 10, 19]) expect(sampleTimelineEffects2D(declaration, frame)[0]!.envelope).toBe(preset === "sparks" ? 1 - frame / 20 : 1);
      expect(sampleTimelineEffects2D(declaration, 21)).toEqual([]);
    }
  });

  test("runtime rejects invalid coverage and accepts portable placement", () => {
    const effect = { id: "rain", frame: 0, durationFrames: 20, label: "Rain", kind: "particle-burst" as const, preset: "rain", intensity: 1, layer: "background" as const, space: "screen" as const, region: { fromX: .1, fromY: .2, toX: .9, toY: 1 } };
    expect(() => createPlayableTimeline2D(project(timeline({ effects: [effect] })))).not.toThrow();
    for (const region of [{ fromX: 1, fromY: 0, toX: 0, toY: 1 }, { fromX: 0, fromY: 0, toX: 1, toY: NaN }]) expect(() => createPlayableTimeline2D(project(timeline({ effects: [{ ...effect, region }] })))).toThrow("region");
    expect(() => createPlayableTimeline2D(project(timeline({ effects: [{ ...effect, space: "target" }] })))).toThrow("target");
  });
  test("samples a portable camera independently of actor transforms, honoring mute and track order", () => {
    const actor: TimelineTrack2D = { id: "actor", targetId: "player", label: "Actor", property: "x", muted: false, locked: false, keyframes: [key("a", 0, 100, "linear")] };
    const camera: TimelineTrack2D = { ...actor, id: "camera", targetId: TIMELINE_CAMERA_TARGET_2D, keyframes: [key("c0", 0, 380, "linear"), key("c1", 10, 480, "linear")] };
    expect(sampleTimelineCamera2D({ timeline: undefined, frame: 0 })).toBeUndefined();
    expect(sampleTimelineCamera2D({ timeline: { tracks: [actor] }, frame: 5 })).toBeUndefined();
    expect(sampleTimelineCamera2D({ timeline: { tracks: [actor, camera] }, frame: 5 })).toEqual({ x: 430, y: 240, zoom: 1 });
    expect(sampleTimelineCamera2D({ timeline: { tracks: [{ ...camera, muted: true }] }, frame: 5 })).toBeUndefined();
    expect(sampleTimelineCamera2D({ timeline: { tracks: [{ ...camera, property: "scale", keyframes: [key("zoom", 0, 2, "linear")] }] }, frame: 0, viewport: { width: 960, height: 660 } })).toEqual({ x: 480, y: 330, zoom: 2 });
    expect(() => sampleTimelineCamera2D({ timeline: undefined, frame: 0, viewport: { width: NaN, height: 660 } })).toThrow("viewport");
    expect(auditPlayableTimeline2D(project(timeline({ tracks: [camera] })))).toEqual([]);
  });
  test("evaluates authored tracks with destination-key easing without mutating key order", () => {
    const track: TimelineTrack2D = {
      id: "x",
      targetId: "player",
      label: "Position X",
      property: "x",
      muted: false,
      locked: false,
      keyframes: [key("end", 10, 10, "ease-in"), key("start", 0, 0, "linear")],
    };
    expect(evaluateTimelineTrack2D(track, -1)).toBe(0);
    expect(evaluateTimelineTrack2D(track, 5)).toBe(2.5);
    expect(evaluateTimelineTrack2D(track, 11)).toBe(10);
    expect(track.keyframes.map((item) => item.id)).toEqual(["end", "start"]);
    expect(applyTimelineEasing2D(0.5, "linear")).toBe(0.5);
    expect(applyTimelineEasing2D(0.5, "ease-out")).toBe(0.75);
    expect(applyTimelineEasing2D(0.25, "ease-in-out")).toBe(0.125);
    expect(applyTimelineEasing2D(1, "bounce")).toBe(1);
  });

  test("starts at zero, loops the half-open authored range, and never double-fires boundary events", () => {
    const runtime = createPlayableTimeline2D(project(timeline({
      fps: 10,
      durationFrames: 20,
      loopStart: 5,
      loopEnd: 10,
      events: [
        event("zero", 0),
        event("loop-start", 5),
        event("inside", 9),
        event("loop-end", 10),
      ],
    })));

    const first = runtime.advance(0.5);
    expect(first.frame).toBe(5);
    expect(first.events.map((item) => `${item.eventId}@${item.loop}`)).toEqual(["zero@0", "loop-start@0"]);

    const wrapped = runtime.advance(0.5);
    expect(wrapped.frame).toBe(5);
    expect(wrapped.loop).toBe(1);
    expect(wrapped.events.map((item) => `${item.eventId}@${item.loop}`)).toEqual(["inside@0", "loop-start@1"]);
    expect(wrapped.events.some((item) => item.eventId === "loop-end")).toBeFalse();

    const afterBoundary = runtime.advance(0.1);
    expect(afterBoundary.frame).toBe(6);
    expect(afterBoundary.events).toEqual([]);
  });

  test("supports multiple deterministic wraps in one advancement", () => {
    const runtime = createPlayableTimeline2D(project(timeline({
      fps: 10,
      durationFrames: 12,
      loopStart: 2,
      loopEnd: 4,
      events: [event("start", 2), event("inside", 3)],
    })));
    runtime.reset(2);
    const result = runtime.advance(0.7);
    expect(result.frame).toBe(3);
    expect(result.loop).toBe(3);
    expect(result.events.map((item) => `${item.eventId}@${item.loop}`)).toEqual([
      "start@0", "inside@0",
      "start@1", "inside@1",
      "start@2", "inside@2",
      "start@3", "inside@3",
    ]);
  });

  test("treats equal loop bounds as one-shot playback", () => {
    const runtime = createPlayableTimeline2D(project(timeline({ fps: 10, durationFrames: 8, loopStart: 4, loopEnd: 4, events: [event("end", 8)] })));
    const result = runtime.advance(2);
    expect(result.frame).toBe(8);
    expect(result.finished).toBeTrue();
    expect(result.events.map((item) => item.eventId)).toEqual(["end"]);
    expect(runtime.advance(1).events).toEqual([]);
  });

  test("composes x, y, scale, rotation, and opacity onto a transient world snapshot", () => {
    const declaration = timeline({
      tracks: [
        track("x", "x", 40), track("y", "y", 60), track("scale", "scale", 2),
        track("rotation", "rotation", Math.PI / 2), track("opacity", "opacity", 0.4),
        { ...track("muted", "x", 999), muted: true },
      ],
    });
    const runtime = createPlayableTimeline2D(project(declaration));
    const source = worldSnapshot();
    const composed = applyTimelineOverrides2D(source, runtime.snapshot().overrides);
    expect(composed.entities[0]).toMatchObject({ x: 40, y: 60, scale: 2, rotation: Math.PI / 2, opacity: 0.4 });
    expect(source.entities[0]).toMatchObject({ x: 10, y: 20, scale: 1 });
    expect(source.entities[0]).not.toHaveProperty("rotation");
    expect(composed.entities[0]).not.toBe(source.entities[0]);
  });

  test("makes unsupported and ambiguous authoring explicit in diagnostics", () => {
    const declaration = timeline({
      tracks: [
        track("x-a", "x", 10),
        track("x-b", "x", 20),
        { ...track("missing", "opacity", 1), targetId: "ghost" },
        { ...track("camera", "camera", 1), targetId: "camera" },
        { ...track("empty", "scale", 1), keyframes: [] },
      ],
      audioTracks: [{ id: "music", name: "Music", assetId: "song", startFrame: 0, durationFrames: 30, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, loopStart: 0, loopEnd: 0, volume: 1, pan: 0, muted: false, solo: false }],
      events: [event("marker", 1), { ...event("logic", 2), kind: "logic" }],
      effects: [{ id: "ghost-flash", frame: 2, durationFrames: 4, label: "Ghost flash", kind: "hit-flash", targetId: "ghost", intensity: 1 }],
    });
    const diagnostics = auditPlayableTimeline2D(project(declaration));
    expect(diagnostics.map((item) => item.code)).toEqual([
      "timeline-track-conflict",
      "timeline-track-target-missing",
      "timeline-camera-track-unsupported",
      "timeline-track-empty",
      "timeline-audio-track-unsupported",
      "timeline-event-unsupported",
      "timeline-effect-target-missing",
    ]);
    const runtime = createPlayableTimeline2D(project(declaration));
    expect(runtime.snapshot().overrides.find((item) => item.property === "x")?.value).toBe(20);
  });

  test("preserves public timeline constructor compatibility", () => {
    const runtime = new PlayableTimeline2D(project(timeline()));
    expect(runtime).toBeInstanceOf(PlayableTimeline2D);
    expect(runtime.snapshot().frame).toBe(0);
  });

  test("samples short effect cues deterministically at arbitrary scrubbed frames", () => {
    const declaration = timeline({ effects: [
      { id: "shake", frame: 10, durationFrames: 8, label: "Impact", kind: "camera-shake", intensity: 6 },
      { id: "blood", frame: 12, durationFrames: 20, label: "Blood", kind: "particle-burst", targetId: "player", intensity: 1, color: "#b3132b", particleCount: 24 },
    ] });
    expect(sampleTimelineEffects2D(declaration, 9)).toEqual([]);
    expect(sampleTimelineEffects2D(declaration, 12).map((effect) => effect.id)).toEqual(["shake", "blood"]);
    expect(sampleTimelineEffects2D(declaration, 32).map((effect) => effect.id)).toEqual(["blood"]);
    expect(sampleTimelineEffects2D(declaration, 33)).toEqual([]);
    expect(timelineEffectNoise2D("blood", 4)).toBe(timelineEffectNoise2D("blood", 4));
    expect(timelineEffectNoise2D("blood", 4)).not.toBe(timelineEffectNoise2D("blood", 5));
  });

  test("holds an exact impact card for one authored frame", () => {
    const declaration = timeline({ effects: [
      { id: "impact-card", frame: 12, durationFrames: 1, label: "One-frame white", kind: "screen-transition", intensity: 1, color: "#ffffff", preset: "impact-white" },
    ] });
    expect(sampleTimelineEffects2D(declaration, 11)).toEqual([]);
    expect(sampleTimelineEffects2D(declaration, 12)[0]?.envelope).toBe(1);
    expect(sampleTimelineEffects2D(declaration, 13)[0]?.envelope).toBe(0);
    expect(sampleTimelineEffects2D(declaration, 14)).toEqual([]);
  });

  test("switches named sprite clips as stepped cues with deterministic same-frame winners", () => {
    const clipTrack = {
      id: "player-animation",
      targetId: "player",
      label: "Animation state",
      muted: false,
      locked: false,
      keyframes: [
        { id: "attack-old", frame: 12, clipId: "attack" },
        { id: "idle", frame: 4, clipId: "idle" },
        { id: "attack-final", frame: 12, clipId: "hurt" },
      ],
    } as const;
    expect(evaluateTimelineClipTrack2D(clipTrack, 3)).toBeUndefined();
    expect(evaluateTimelineClipTrack2D(clipTrack, 4)).toBe("idle");
    expect(evaluateTimelineClipTrack2D(clipTrack, 11.9)).toBe("idle");
    expect(evaluateTimelineClipTrack2D(clipTrack, 12)).toBe("hurt");
    expect(clipTrack.keyframes.map((key) => key.id)).toEqual(["attack-old", "idle", "attack-final"]);

    const runtime = createPlayableTimeline2D(project(timeline({ clipTracks: [clipTrack] })));
    expect(runtime.reset(3).clipOverrides).toEqual([]);
    expect(runtime.reset(8).clipOverrides).toEqual([{ trackId: "player-animation", targetId: "player", clipId: "idle", startFrame: 4 }]);
    expect(runtime.reset(12).clipOverrides[0]?.clipId).toBe("hurt");
    expect(runtime.reset(12).clipOverrides[0]?.startFrame).toBe(12);
  });

  test("audits clip cue conflicts and missing authored references", () => {
    const declaration = timeline({ clipTracks: [
      { id: "first", targetId: "player", label: "First", muted: false, locked: false, keyframes: [{ id: "idle", frame: 0, clipId: "idle" }] },
      { id: "winner", targetId: "player", label: "Winner", muted: false, locked: false, keyframes: [{ id: "missing", frame: 2, clipId: "missing" }] },
      { id: "ghost", targetId: "ghost", label: "Ghost", muted: false, locked: false, keyframes: [{ id: "ghost-idle", frame: 0, clipId: "idle" }] },
      { id: "empty", targetId: "player", label: "Empty", muted: false, locked: false, keyframes: [] },
    ] });
    expect(auditPlayableTimeline2D(project(declaration)).map((item) => item.code)).toEqual([
      "timeline-clip-track-clip-missing",
      "timeline-clip-track-conflict",
      "timeline-clip-track-target-missing",
      "timeline-clip-track-empty",
    ]);
    expect(createPlayableTimeline2D(project(declaration)).reset(4).clipOverrides).toEqual([
      { trackId: "winner", targetId: "player", clipId: "missing", startFrame: 2 },
      { trackId: "ghost", targetId: "ghost", clipId: "idle", startFrame: 0 },
    ]);
  });
});

function key(id: string, frame: number, value: number, easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bounce" = "linear") {
  return { id, frame, value, easing } as const;
}

function event(id: string, frame: number) {
  return { id, frame, label: id, kind: "marker" as const };
}

function track(id: string, property: TimelineTrack2D["property"], value: number): TimelineTrack2D {
  return { id, targetId: "player", label: id, property, muted: false, locked: false, keyframes: [key(`${id}-key`, 0, value)] };
}

function timeline(overrides: Partial<TimelineDeclaration2D> = {}): TimelineDeclaration2D {
  return {
    fps: 30,
    durationFrames: 300,
    loopStart: 0,
    loopEnd: 300,
    playbackSpeed: 1,
    tracks: [],
    audioTracks: [],
    events: [],
    ...overrides,
  };
}

function project(declaration: TimelineDeclaration2D): PlayableTimelineProject2D {
  return { timeline: declaration, scenes: [{ id: "main", entities: [{ id: "player" }, { id: "camera" }] }], assets: [{ id: "song", mimeType: "audio/wav" }], atlas: { clips: [{ id: "idle" }, { id: "attack" }, { id: "hurt" }] } };
}

function worldSnapshot(): PlayableWorldSnapshot {
  return {
    version: 1,
    sceneId: "main",
    tick: 0,
    simulationTimeSeconds: 0,
    entities: [{ id: "player", label: "Player", x: 10, y: 20, width: 16, height: 16, scale: 1, layer: 1, color: "#fff", accent: "#000", kind: "actor", components: [] }],
  };
}
