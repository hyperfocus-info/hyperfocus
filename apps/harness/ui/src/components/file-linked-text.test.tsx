/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { FileLinkedText } from "./file-linked-text";

createUiTest("FileLinkedText", () => {
  it("renders plain text without a file-link context", () => {
    render(() => <FileLinkedText text="See src/app.ts:3" />);

    expect(screen.getByText("See src/app.ts:3")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens detected files only for modifier clicks", () => {
    const opened: unknown[] = [];
    render(() => (
      <FileLinkedText
        text="See src/app.ts:3:2"
        fileLinks={{
          rootPath: "C:\\repo",
          filePaths: ["src/app.ts"],
          onOpenFile: (target) => opened.push(target),
        }}
      />
    ));

    const link = screen.getByRole("button", { name: "src/app.ts:3:2" });
    fireEvent.click(link);
    expect(opened).toEqual([]);

    fireEvent.click(link, { metaKey: true });
    expect(opened).toEqual([{ path: "src/app.ts", line: 3, column: 2 }]);
  });
});
