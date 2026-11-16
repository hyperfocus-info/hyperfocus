import { expect, test } from "bun:test";
import { render } from "solid-js/web";
import { FileInput, Input } from "./input";
import { FormField } from "./form";

test("file input preserves native labels, ref, selection events and constraints", async () => {
  const host = document.createElement("div"); document.body.append(host);
  let input: HTMLInputElement | undefined;
  const received: { files: FileList | null } = { files: null };
  const dispose = render(() => <form><FormField label="Import songs"><FileInput ref={input} multiple required accept="audio/*" name="songs" buttonLabel="Browse songs" onChange={event => { received.files = event.currentTarget.files; }} /></FormField></form>, host);
  try {
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!input) throw new Error("Missing file input");
    expect(input.labels?.[0]?.textContent).toContain("Import songs");
    expect(input.accept).toBe("audio/*"); expect(input.multiple).toBe(true); expect(input.required).toBe(true);
    expect(host.querySelector('[data-ui-file-button]')?.textContent).toBe("Browse songs");
    const transfer = new DataTransfer(); transfer.items.add(new File(["audio"], "song.wav", { type: "audio/wav" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(received.files).toBe(input.files);
    expect(host.querySelector('[data-ui-file-name]')?.textContent).toBe("song.wav");
    input.files = new DataTransfer().files;
    host.querySelector("form")!.dispatchEvent(new Event("reset"));
    await Promise.resolve();
    expect(host.querySelector('[data-ui-file-name]')?.textContent).toBe("No file chosen");
  } finally { dispose(); host.remove(); }
});

test("Input type=file uses the same chooser and honors disabled semantics", () => {
  const host = document.createElement("div"); document.body.append(host);
  let calls = 0;
  const dispose = render(() => <Input type="file" disabled aria-label="Import document" onClick={() => { calls++; }} />, host);
  try {
    const input = host.querySelector("input")!;
    expect(host.querySelectorAll('[data-ui-file-input]')).toHaveLength(1);
    expect(input.getAttribute("aria-label")).toBe("Import document");
    input.click(); expect(calls).toBe(0);
  } finally { dispose(); host.remove(); }
});
