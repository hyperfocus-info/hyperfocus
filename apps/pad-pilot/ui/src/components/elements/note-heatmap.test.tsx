import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { NoteHeatmap } from "./note-heatmap";
import { createAnalyzerNoteEvent } from "../../modules/analyzer/analyzer-state";

createUiTest("NoteHeatmap", () => {
  it("renders note lanes, event blocks, and updates the hover readout", () => {
    const { container } = render(() => (
      <NoteHeatmap
        data-testid="heatmap"
        frameCount={32}
        laneEnergies={Array.from({ length: 128 }, (_, index) => (index === 60 ? 0.8 : 0))}
        minMidiNote={59}
        maxMidiNote={61}
        noteEvents={[
          createAnalyzerNoteEvent({ midiNote: 60, startFrame: 2, endFrame: 18, intensity: 0.7, velocity: 96, meanFrequencyHz: 261.63 }),
        ]}
        tuningHz={440}
      />
    ));

    expect(screen.getByTestId("heatmap")).not.toBeNull();
    expect(screen.getByRole("button", { name: "C4 lane" })).not.toBeNull();
    expect(container.querySelector('[data-note="C4"]')).not.toBeNull();

    fireEvent.pointerEnter(screen.getByRole("button", { name: "C4 lane" }));

    expect(screen.getByText(/261\.63 Hz/)).not.toBeNull();
  });
});
