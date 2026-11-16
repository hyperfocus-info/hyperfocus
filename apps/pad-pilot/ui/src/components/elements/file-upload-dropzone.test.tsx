import { requireElement } from "../../utils/require-element";
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { FileUploadDropzone, FileUploadInput, MAX_FILE_UPLOAD_SELECTION_ITEMS, extractFileUploadSelection } from "./file-upload-dropzone";

createUiTest("FileUploadDropzone", () => {
  it("lets custom upload surfaces reuse bounded file-input selection semantics", () => {
    const selections: Array<{ files: File[]; paths: string[] }> = [];
    const { container } = render(() => (
      <FileUploadInput class="hidden-picker" onSelection={(selection) => selections.push(selection)} />
    ));
    const input = requireElement(container.querySelector("input.hidden-picker"), HTMLInputElement);
    const file = new File(["audio"], "marker-loop.wav", { type: "audio/wav" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(selections).toHaveLength(1);
    expect(selections[0]?.files[0]?.name).toBe("marker-loop.wav");
  });

  it("extracts native file paths from dropped file objects and uri payloads", () => {
    const file = new File(["audio"], "break.wav", { type: "audio/wav" });
    Object.defineProperty(file, "path", {
      configurable: true,
      value: "C:\\samples\\break.wav",
    });

    const selection = extractFileUploadSelection([file], {
      getData(type) {
        if (type === "text/uri-list") {
          return "file:///C:/samples/break.wav";
        }
        return "";
      },
    });

    expect(selection.files).toHaveLength(1);
    expect(selection.paths).toEqual(["C:\\samples\\break.wav", "C:/samples/break.wav"]);
  });

  it("publishes resolved drop selections to consumers", () => {
    const selections: Array<{ files: File[]; paths: string[] }> = [];

    render(() => (
      <FileUploadDropzone
        onSelection={(selection) => selections.push(selection)}
      />
    ));

    const dropzone = screen.getByRole("button", { name: "Upload audio file" });
    const file = new File(["audio"], "loop.wav", { type: "audio/wav" });
    Object.defineProperty(file, "path", {
      configurable: true,
      value: "C:\\samples\\loop.wav",
    });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
        getData(type: string) {
          if (type === "text/uri-list") {
            return "file:///C:/samples/loop.wav";
          }
          return "";
        },
      },
    });

    expect(selections).toHaveLength(1);
    expect(selections[0]?.files[0]?.name).toBe("loop.wav");
    expect(selections[0]?.paths).toContain("C:\\samples\\loop.wav");
  });

  it("uses the native browse hook when it handles the request", () => {
    let browseRequests = 0;

    render(() => (
      <FileUploadDropzone
        onBrowseRequest={() => {
          browseRequests += 1;
          return true;
        }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Upload audio file" }));

    expect(browseRequests).toBe(1);
  });

  it("bounds extracted file and path collections", () => {
    const files = Array.from({ length: MAX_FILE_UPLOAD_SELECTION_ITEMS + 20 }, (_, index) =>
      new File([String(index)], `sample-${index}.wav`, { type: "audio/wav" }),
    );
    const selection = extractFileUploadSelection(files, {
      getData(type) {
        return type === "text/uri-list"
          ? Array.from({ length: MAX_FILE_UPLOAD_SELECTION_ITEMS + 20 }, (_, index) => `file:///C:/samples/${index}.wav`).join("\n")
          : "";
      },
    });

    expect(selection.files).toHaveLength(MAX_FILE_UPLOAD_SELECTION_ITEMS);
    expect(selection.paths).toHaveLength(MAX_FILE_UPLOAD_SELECTION_ITEMS);
  });

  it("keeps drag-drop single-select when multiple is not enabled", () => {
    const selections: Array<{ files: File[]; paths: string[] }> = [];
    render(() => (
      <FileUploadDropzone onSelection={(selection) => selections.push(selection)} />
    ));

    fireEvent.drop(screen.getByRole("button", { name: "Upload audio file" }), {
      dataTransfer: {
        files: [new File(["1"], "first.wav"), new File(["2"], "second.wav")],
        getData(type: string) {
          return type === "text/uri-list"
            ? "file:///C:/samples/first.wav\nfile:///C:/samples/second.wav"
            : "";
        },
      },
    });

    expect(selections[0]?.files.map((file) => file.name)).toEqual(["first.wav"]);
    expect(selections[0]?.paths).toEqual(["C:/samples/first.wav"]);
  });

  it("does not invoke native browsing while disabled", () => {
    let browseRequests = 0;
    render(() => (
      <FileUploadDropzone
        disabled
        onBrowseRequest={() => {
          browseRequests += 1;
          return true;
        }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Upload audio file" }));
    expect(browseRequests).toBe(0);
  });
});
