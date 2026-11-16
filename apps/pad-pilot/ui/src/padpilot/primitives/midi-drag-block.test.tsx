import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { MidiDragBlock } from "./midi-drag-block";
import { IO } from "../provider";

const originalImportFile = IO.importFile;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

createUiTest("MidiDragBlock", () => {
  afterEach(() => {
    IO.importFile = originalImportFile;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("renders an icon-only download button for generated MIDI bytes", () => {
    render(() => (
      <MidiDragBlock
        filename="test-track.mid"
        label="Test Track"
        midiData={new Uint8Array([77, 84, 104, 100])}
      />
    ));

    const downloadButton = screen.getByRole("button", { name: "Download Test Track" });

    expect(downloadButton.getAttribute("data-icon-only")).toBe("true");
    expect(downloadButton.getAttribute("title")).toBeNull();
  });

  it("keeps browser MIDI preparation single-flight", async () => {
    let importCount = 0;
    let resolveImport!: (value: Awaited<ReturnType<typeof IO.importFile>>) => void;
    IO.importFile = () => {
      importCount += 1;
      return new Promise((resolve) => {
        resolveImport = resolve;
      });
    };

    render(() => (
      <MidiDragBlock
        filename="single-flight.mid"
        label="Single Flight"
        midiData={new Uint8Array([77, 84, 104, 100])}
      />
    ));
    const block = screen.getByText("Single Flight").closest('[role="button"]');
    if (!block) {
      throw new Error("Expected MIDI drag block.");
    }
    fireEvent.click(block);
    fireEvent.click(block);

    expect(importCount).toBe(1);
    resolveImport({
      byteSize: 4,
      contentId: "midi-test",
      mimeType: "audio/midi",
      name: "single-flight.mid",
      path: "virtual://padpilot/media/midis/midi-test.mid",
    });
    expect(await screen.findByText("Prepared for import")).toBeTruthy();
  });

  it("revokes owned object URLs when the block unmounts", () => {
    const revoked: string[] = [];
    URL.createObjectURL = () => "blob:padpilot-midi";
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    const view = render(() => (
      <MidiDragBlock
        filename="cleanup.mid"
        label="Cleanup"
        midiData={new Uint8Array([77, 84, 104, 100])}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Download Cleanup" }));
    view.unmount();

    expect(revoked).toEqual(["blob:padpilot-midi"]);
  });
});
