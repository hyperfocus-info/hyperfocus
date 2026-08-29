import { describe, expect, test } from "bun:test";
import { applyTimelineOverrides2D, createPlayableTimeline2D } from "@hyperfocus/engine/project/runtime-timeline-2d";
import type { PlayableWorldSnapshot } from "@hyperfocus/engine/project/runtime-2d";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("standalone timeline project integration", () => {
  test("accepts persisted editor tracks and composes supported values without changing project data", () => {
    const project = createDefaultProject("Timeline build");
    project.timeline.tracks = [
      timelineTrack("x", "x", 100, 200),
      timelineTrack("rotation", "rotation", 0, Math.PI),
      timelineTrack("opacity", "opacity", 1, 0.25),
    ];
    project.timeline.fps = 10;
    project.timeline.playbackSpeed = 1;
    const authored = structuredClone(project.timeline);
    const runtime = createPlayableTimeline2D(project);
    const playback = runtime.advance(0.5);
    const visible = applyTimelineOverrides2D(world(), playback.overrides);

    expect(visible.entities[0]).toMatchObject({ x: 150, rotation: Math.PI / 2, opacity: 0.625 });
    expect(project.timeline).toEqual(authored);
  });

  test("reports authored actions the standalone timeline does not execute implicitly", () => {
    const project = createDefaultProject("Honest timeline diagnostics");
    project.timeline.tracks = [{ ...timelineTrack("camera", "camera", 0, 1), targetId: "camera-01" }];
    project.timeline.audioTracks = [{ id: "music", name: "Music", startFrame: 0, durationFrames: 30, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, loopStart: 0, loopEnd: 0, volume: 1, pan: 0, muted: false, solo: false }];
    project.timeline.events = [{ id: "logic", frame: 4, label: "Spawn wave", kind: "logic" }];
    const runtime = createPlayableTimeline2D(project);

    expect(runtime.diagnostics.map((item) => item.code)).toEqual([
      "timeline-camera-track-unsupported",
      "timeline-audio-track-unsupported",
      "timeline-event-unsupported",
    ]);
    expect(runtime.advance(1).events).toMatchObject([{ eventId: "logic", kind: "logic" }]);
  });
});

function timelineTrack(id: string, property: "x" | "y" | "scale" | "rotation" | "opacity" | "camera", start: number, end: number) {
  return {
    id,
    targetId: "player-01",
    label: id,
    property,
    color: "#fff",
    muted: false,
    locked: false,
    keyframes: [
      { id: `${id}-0`, frame: 0, value: start, easing: "linear" as const },
      { id: `${id}-10`, frame: 10, value: end, easing: "linear" as const },
    ],
  };
}

function world(): PlayableWorldSnapshot {
  return {
    version: 1,
    sceneId: "scene-main",
    tick: 0,
    simulationTimeSeconds: 0,
    entities: [{ id: "player-01", label: "Player", x: 100, y: 100, width: 32, height: 32, scale: 1, layer: 1, color: "#fff", accent: "#000", kind: "actor", components: [] }],
  };
}
