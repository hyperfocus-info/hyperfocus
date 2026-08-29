import { describe, expect, it } from "bun:test";
import { fileNameFromPath } from "./file-path";

describe("fileNameFromPath", () => {
  it("normalizes Windows and POSIX separators", () => {
    expect(fileNameFromPath("C:\\samples\\kick.wav")).toBe("kick.wav");
    expect(fileNameFromPath("/samples/snare.wav")).toBe("snare.wav");
  });

  it("uses the caller fallback for an incomplete path", () => {
    expect(fileNameFromPath("C:\\samples\\", "imported-file")).toBe("imported-file");
  });
});
