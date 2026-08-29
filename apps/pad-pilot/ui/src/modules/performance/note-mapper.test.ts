import { describe, expect, it } from "bun:test";
import { mapStickToMidiNote } from "./note-mapper";

describe("Performance note mapper", () => {
  it("maps C major note with right-stick trigger and modifier", () => {
    const note = mapStickToMidiNote({
      x: 1,
      y: 0,
      deadzone: 0.2,
      root: "C",
      scale: "major",
      octave: 4,
      modifier: 1,
    });

    expect(note).toBe(62);
  });
});
