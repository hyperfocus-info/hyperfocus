import { create } from "@bufbuild/protobuf";
import { VisualizerFrameSchema } from "../../proto/generated/fx-chain-pb";
import { describe, expect, it } from "bun:test";
import {
  FX_VISUALIZER_DISPLAY_BIN_COUNT,
  resampleVisualizerSeries,
  smoothVisualizerFrame,
} from "./fx-visualizer-smoothing";

function createVisualizerFrame(overrides: Parameters<typeof create<typeof VisualizerFrameSchema>>[1] = {}) {
  return create(VisualizerFrameSchema, {
    gainReductionDb: 0,
    masterInputPeakDb: -120,
    masterInputPeakDbLeft: -120,
    masterInputPeakDbRight: -120,
    masterOutputPeakDb: -120,
    masterOutputPeakDbLeft: -120,
    masterOutputPeakDbRight: -120,
    nodeFrames: [],
    sequence: 0n,
    taps: [],
    ...overrides,
  });
}

describe("FX visualizer smoothing helpers", () => {
  it("resamples short source arrays to the fixed display bin count instead of only filling the first bins", () => {
    const source = [0, 1, 0, 1];
    const resampled = resampleVisualizerSeries(source);

    expect(resampled).toHaveLength(FX_VISUALIZER_DISPLAY_BIN_COUNT);
    expect(resampled[0]).toBe(0);
    expect(resampled[1]).toBeGreaterThan(0);
    expect(resampled[10]).toBeGreaterThan(0);
    expect(resampled[23]).toBe(1);
  });

  it("preserves already-sized arrays and keeps empty arrays stable", () => {
    const exact = Array.from({ length: FX_VISUALIZER_DISPLAY_BIN_COUNT }, (_, index) => index / FX_VISUALIZER_DISPLAY_BIN_COUNT);
    const empty = resampleVisualizerSeries([]);

    expect(resampleVisualizerSeries(exact)).toEqual(exact);
    expect(empty).toHaveLength(FX_VISUALIZER_DISPLAY_BIN_COUNT);
    expect(empty.every((value) => value === 0)).toBe(true);
  });

  it("interpolates scalar fields and series payloads between frames", () => {
    const previous = createVisualizerFrame({
      gainReductionDb: -12,
      masterInputPeakDb: -48,
      nodeFrames: [
        {
          chainId: 1,
          nodeId: 2,
          inputPeakDb: -36,
          inputPeakDbLeft: -40,
          inputPeakDbRight: -34,
          outputPeakDb: -30,
          outputPeakDbLeft: -32,
          outputPeakDbRight: -28,
          payload: {
            case: "compressor",
            value: {
              gainCurve: [0, -1, 0, 1],
              inputCurve: [0, 0.5, 1, 0.5],
            },
          },
        },
      ],
      sequence: 10n,
      taps: [
        {
          chainId: 1,
          inputPeakDb: -42,
          inputPeakDbLeft: -44,
          inputPeakDbRight: -40,
          nodeId: 0,
          outputPeakDb: -30,
          outputPeakDbLeft: -31,
          outputPeakDbRight: -29,
          waveform: [0, 0.5, 1, 0.5],
        },
      ],
    });
    const next = createVisualizerFrame({
      gainReductionDb: -3,
      masterInputPeakDb: -12,
      nodeFrames: [
        {
          chainId: 1,
          nodeId: 2,
          inputPeakDb: -12,
          inputPeakDbLeft: -14,
          inputPeakDbRight: -10,
          outputPeakDb: -8,
          outputPeakDbLeft: -9,
          outputPeakDbRight: -7,
          payload: {
            case: "compressor",
            value: {
              gainCurve: [1, 0, -1, 0],
              inputCurve: [1, 0.5, 0, 0.5],
            },
          },
        },
      ],
      sequence: 11n,
      taps: [
        {
          chainId: 1,
          inputPeakDb: -20,
          inputPeakDbLeft: -22,
          inputPeakDbRight: -18,
          nodeId: 0,
          outputPeakDb: -10,
          outputPeakDbLeft: -11,
          outputPeakDbRight: -9,
          waveform: [1, 0.5, 0, 0.5],
        },
      ],
    });

    const smoothed = smoothVisualizerFrame(previous, next, 16);

    expect(smoothed.sequence).toBe(11n);
    expect(smoothed.masterInputPeakDb).toBeGreaterThan(previous.masterInputPeakDb);
    expect(smoothed.masterInputPeakDb).toBeLessThan(next.masterInputPeakDb);
    expect(smoothed.gainReductionDb).toBeGreaterThan(previous.gainReductionDb);
    expect(smoothed.gainReductionDb).toBeLessThan(next.gainReductionDb);
    expect(smoothed.taps[0]?.waveform.length).toBe(4);
    expect(smoothed.nodeFrames[0]?.payload.case).toBe("compressor");
    if (smoothed.nodeFrames[0]?.payload.case !== "compressor") throw Error("Expected compressor");
    expect((smoothed.nodeFrames[0].payload.value).gainCurve[0]).toBeGreaterThan(0);
    expect((smoothed.nodeFrames[0]!.payload.value).gainCurve[2]).toBeGreaterThan(-1);
  });

  it("releases missing node frames smoothly instead of dropping them immediately", () => {
    const previous = createVisualizerFrame({
      nodeFrames: [
        {
          chainId: 1,
          nodeId: 7,
          inputPeakDb: -12,
          inputPeakDbLeft: -12,
          inputPeakDbRight: -12,
          outputPeakDb: -9,
          outputPeakDbLeft: -9,
          outputPeakDbRight: -9,
          payload: {
            case: "phaser",
            value: {
              combResponse: [1, 0.5, 0.25, 0.125],
            },
          },
        },
      ],
      sequence: 20n,
    });
    const next = createVisualizerFrame({ sequence: 21n });

    const smoothed = smoothVisualizerFrame(previous, next, 16);

    expect(smoothed.nodeFrames).toHaveLength(1);
    expect(smoothed.nodeFrames[0]?.nodeId).toBe(7);
    expect(smoothed.nodeFrames[0]?.outputPeakDb).toBeLessThan(-9);
    if (smoothed.nodeFrames[0]?.payload.case !== "phaser") throw Error("Expected phaser");
    expect(smoothed.nodeFrames[0].payload.value.combResponse[0]).toBeGreaterThan(0);
    expect((smoothed.nodeFrames[0]!.payload.value.combResponse[0])).toBeLessThan(1);
  });
});
