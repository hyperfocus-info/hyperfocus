import { expect, test } from "bun:test";
import {
  createDefaultProject,
  createProjectHistory,
  migrateProject,
} from "../editor.ts";
import {
  evaluateTimelineTrack2D,
  applyTimelineEasing2D,
} from "../runtime-timeline-2d.ts";

test("portable hold interpolation changes only at the destination key, including subframes", () => {
  const project = createDefaultProject("Held poses"),
    history = createProjectHistory(project);
  history.transact("Author held poses", (draft) => {
    draft.timeline.tracks = [
      {
        id: "held",
        label: "Held x",
        targetId: draft.scenes[0]!.entities[0]!.id,
        property: "x",
        color: "#ffffff",
        muted: false,
        locked: false,
        keyframes: [
          { id: "a", frame: 0, value: 10, easing: "hold" },
          { id: "b", frame: 3, value: 40, easing: "hold" },
          { id: "c", frame: 6, value: 70, easing: "hold" },
        ],
      },
    ];
  });
  const reopened = migrateProject(JSON.parse(history.serialize())),
    track = reopened.timeline.tracks[0]!;
  expect(
    [0, 1, 2.5, 2.999, 3, 5.5, 6].map((f) => evaluateTimelineTrack2D(track, f)),
  ).toEqual([10, 10, 10, 10, 40, 40, 70]);
  expect(applyTimelineEasing2D(1, "hold")).toBe(1);
  expect(history.undo()).toBe(true);
  expect(history.redo()).toBe(true);
  expect(
    evaluateTimelineTrack2D(history.project.timeline.tracks[0]!, 2.5),
  ).toBe(10);
});
