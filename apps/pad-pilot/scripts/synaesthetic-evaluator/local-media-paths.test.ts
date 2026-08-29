import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";

import {
  downloadsFile,
  flStudioProjectFile,
} from "./local-media-paths";

describe("local media paths", () => {
  it("derives user-local corpus paths without a checked-in account name", () => {
    expect(downloadsFile("track.mp3")).toBe(path.join(homedir(), "Downloads", "track.mp3"));
    expect(flStudioProjectFile("draft.mp3")).toBe(path.join(
      homedir(),
      "Documents",
      "Image-Line",
      "FL Studio",
      "Projects",
      "draft.mp3",
    ));
  });

  it("rejects path-like media names", () => {
    expect(() => downloadsFile("../outside.mp3")).toThrow("one path segment");
  });
});
