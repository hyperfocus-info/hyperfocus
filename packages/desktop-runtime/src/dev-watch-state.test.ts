import { expect, test, spyOn } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDevWatchState } from "./dev-watch-state";

test("a directory deleted between stat and enumeration removes its known children", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-watch-race-"));
  const child = path.join(root, "source.ts");
  writeFileSync(child, "source");
  const state = createDevWatchState({ source: root, recursive: true, accepts: () => true });
  const reading = spyOn(fs, "readdirSync").mockImplementationOnce(() => {
    rmSync(root, { recursive: true, force: true });
    throw Object.assign(new Error("Directory vanished"), { code: "ENOENT" });
  });
  try { expect(state.changes()).toEqual([child]); }
  finally { reading.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

test("ignores access metadata but observes edits, nested additions, renames and deletions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-watch-state-"));
  try {
    const file = path.join(root, "source.ts");
    writeFileSync(file, "original");
    const old = new Date(Math.floor(Date.now() / 1000) * 1000 - 7_200_000);
    utimesSync(file, old, old);
    const state = createDevWatchState({ source: root, recursive: true, accepts: (file) => !file.includes(".local") });
    const original = statSync(file);
    utimesSync(file, new Date(Date.now() + 10_000), original.mtime);
    expect(state.changes(file)).toEqual([]);
    writeFileSync(file, "edited source");
    expect(state.changes(file)).toEqual([file]);
    expect(state.changes(file)).toEqual([]);
    const nested = path.join(root, "nested");
    mkdirSync(nested); writeFileSync(path.join(nested, "new.ts"), "new");
    expect(state.changes(nested)).toEqual([path.join(nested, "new.ts")]);
    const moved = path.join(root, "moved.ts");
    renameSync(file, moved);
    expect(state.changes().sort()).toEqual([file, moved].sort());
    rmSync(moved);
    expect(state.changes(moved)).toEqual([moved]);
    mkdirSync(path.join(root, ".local")); writeFileSync(path.join(root, ".local", "ignored.ts"), "ignored");
    expect(state.changes()).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
