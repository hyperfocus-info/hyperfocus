import { describe, expect, test } from "bun:test";
import { runBeginnerJourney } from "./beginner-journey.ts";

describe("verified beginner journey", () => {
  test("creates, plays, edits, reloads, recovers, and ships from a clean temp workspace", async () => {
    const evidence = await runBeginnerJourney();
    expect(evidence.steps).toEqual(["create", "serve", "input", "edit", "live-reload", "error-recovery", "release-build"]);
    expect(evidence.initialProjectFileCount).toBe(2);
    expect(evidence.canonicalFileCountAfterEdit).toBe(2);
    expect(evidence.inputDeltaBeforeEdit).toBeGreaterThan(0);
    expect(evidence.inputDeltaAfterEdit).toBeGreaterThan(evidence.inputDeltaBeforeEdit);
    expect(evidence.editedSpeed).toBe(360);
    expect(evidence.reloadEvents).toBeGreaterThanOrEqual(2);
    expect(evidence.errorEvents).toBeGreaterThanOrEqual(1);
    expect(evidence.recoveredLastGoodBuild).toBe(true);
    expect(evidence.releaseFileCount).toBe(1);
    expect(evidence.releaseReceiptVerified).toBe(true);
    expect(evidence.standaloneBytes).toBeGreaterThan(1_000);
    expect(evidence.workspaceRemoved).toBe(true);
  }, 20_000);
});
