import { describe, expect, it } from "bun:test";

import { base64ToBytes } from "../../proto/base64";
import { RecutAnalysisMode, RecutBpmSource, createDefaultRecutModuleState, normalizeRecutModuleState } from "./recut-state";
import { decodeRecutModuleState } from "./recut-state";

describe("recut-state", () => {
  it("falls back when repeated fields are missing", () => {
    const fallback = createDefaultRecutModuleState();
    const brokenState = {
      ...fallback,
      chokeGroups: undefined,
      padAssignments: undefined,
      sliceMarkers: undefined,
    } as unknown as typeof fallback;

    const normalized = normalizeRecutModuleState(brokenState);

    expect(normalized.chokeGroups).toHaveLength(fallback.chokeGroups.length);
    expect(normalized.padAssignments).toHaveLength(fallback.padAssignments.length);
    expect(normalized.sliceMarkers).toHaveLength(fallback.sliceMarkers.length);
    expect(normalized.chokeGroups[0]?.name).toBe("Row A");
    expect(normalized.analysisMode).toBe(RecutAnalysisMode.AUTO);
    expect(normalized.bpmSource).toBe(RecutBpmSource.NONE);
  });

  it("falls back when binary payload is invalid", () => {
    const normalized = decodeRecutModuleState(base64ToBytes("////////"));

    expect(normalized.loaded).toBe(false);
    expect(normalized.chokeGroups[0]?.name).toBe("Row A");
    expect(normalized.padAssignments).toHaveLength(16);
    expect(normalized.padAssignments[0]?.isEmpty).toBe(false);
  });

  it("expands legacy 8-pad assignments into the 16-pad layout", () => {
    const fallback = createDefaultRecutModuleState();
    const normalized = normalizeRecutModuleState({
      ...fallback,
      padAssignments: fallback.padAssignments.slice(0, 8),
    });

    expect(normalized.padAssignments).toHaveLength(16);
    expect(normalized.padAssignments[0]?.faceButton).toBe("X");
    expect(normalized.padAssignments[4]?.faceButton).toBe("X");
    expect(normalized.padAssignments[4]?.bank).toBe(1);
    expect(normalized.padAssignments[12]?.bank).toBe(3);
    expect(normalized.padAssignments[12]?.isEmpty).toBe(false);
  });

  it("clamps slice markers, BPM fields, and density into supported ranges", () => {
    const fallback = createDefaultRecutModuleState();
    const normalized = normalizeRecutModuleState({
      ...fallback,
      bpmConfidence: 2,
      bpmSuggestedConfidence: -1,
      bpmSuggestedValue: 999,
      bpmValue: 999,
      density: 4,
      gainDb: -96,
      grainSizeMs: 1,
      projectBpmSnapshot: 400,
      sliceMarkers: Array.from({ length: 24 }, (_, index) => ({
        ...fallback.sliceMarkers[0]!,
        confidence: 3,
        endFrame: index * 10,
        fadeMs: 99,
        padIndex: 99,
        startFrame: Math.max(0, 240 - index * 10),
        transientFrame: -12,
      })),
    });

    expect(normalized.sliceMarkers).toHaveLength(16);
    expect(normalized.sliceMarkers[0]?.confidence).toBe(1);
    expect(normalized.sliceMarkers[0]?.fadeMs).toBe(25);
    expect(normalized.sliceMarkers[0]?.padIndex).toBe(15);
    expect(normalized.sliceMarkers[0]?.transientFrame).toBe(0);
    expect(normalized.bpmValue).toBe(400);
    expect(normalized.bpmSuggestedValue).toBe(400);
    expect(normalized.bpmConfidence).toBe(1);
    expect(normalized.bpmSuggestedConfidence).toBe(0);
    expect(normalized.density).toBe(1);
    expect(normalized.projectBpmSnapshot).toBe(400);
    expect(normalized.gainDb).toBe(-96);
    expect(normalized.grainSizeMs).toBe(1);
  });
});
