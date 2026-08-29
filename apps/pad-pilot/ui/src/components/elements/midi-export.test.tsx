import { expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { MidiExport } from "./midi-export";

createUiTest("MidiExport", () => {
  it("forwards host props and invokes drag/save callbacks", () => {
    const onDragExport = mock(() => undefined);
    const onSaveExport = mock(() => undefined);

    render(() => (
      <MidiExport
        data-testid="midi-export"
        disabled={false}
        onDragExport={onDragExport}
        onSaveExport={onSaveExport}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Drag MIDI" }));
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI" }));

    expect(screen.getByTestId("midi-export").getAttribute("role")).toBe("group");
    expect(onDragExport).toHaveBeenCalledTimes(1);
    expect(onSaveExport).toHaveBeenCalledTimes(1);
  });

  it("disables both actions when export is unavailable", () => {
    render(() => (
      <MidiExport disabled onDragExport={() => undefined} onSaveExport={() => undefined} />
    ));

    expect(screen.getByRole("button", { name: "Drag MIDI" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Save MIDI" }).hasAttribute("disabled")).toBe(true);
  });
});
