import { expect, test } from "bun:test";
import { isAgiSnapshotInput } from "./snapshot-input";

test("snapshot observations reject malformed nested evidence before tags can be assigned", () => {
  for (const value of [null, [], { firstContact: "blocked" }, { firstContact: { blocksFirstMeaningfulInput: "false" } }, { criticalElements: [null] }, { cues: [{ signalChannels: ["smell"] }] }, { beats: [{ activeDemands: "2" }] }, { probeOutcomes: [{ blockers: [1] }] }]) {
    expect(isAgiSnapshotInput(value)).toBe(false);
  }
  expect(isAgiSnapshotInput({ game: "fixture", firstContact: { blocksFirstMeaningfulInput: false }, criticalElements: [{ importance: "critical", readsWithoutText: true }], cues: [{ signalChannels: ["audio", "visual"] }], notesFromFutureVersion: [1] })).toBe(true);
});
