import { requireNodeMessage } from "./node-registry/types";
import { CompressorVisualizerPayloadSchema, EqVisualizerPayloadSchema, TransientShaperVisualizerPayloadSchema, NoiseGateVisualizerPayloadSchema, DelayVisualizerPayloadSchema, ReverbVisualizerPayloadSchema, ConvolverVisualizerPayloadSchema, TapeSaturationVisualizerPayloadSchema, BitcrusherVisualizerPayloadSchema, ExciterVisualizerPayloadSchema, ChorusVisualizerPayloadSchema, PhaserVisualizerPayloadSchema, AutoPanVisualizerPayloadSchema, RotarySpeakerVisualizerPayloadSchema, StereoImagerVisualizerPayloadSchema, PitchDriftVisualizerPayloadSchema } from "../../proto/generated/fx-chain-pb";
import { asRecord } from "@hyperfocus/utilities/records";
import { create } from "@bufbuild/protobuf";
import { MeterTapSchema, NodeVisualizerFrameSchema, VisualizerFrameSchema, type MeterTap, type NodeVisualizerFrame, type VisualizerFrame } from "../../proto/generated/fx-chain-pb";
import { isRecord as isPayloadRecord } from '@hyperfocus/utilities/records';

export const FX_VISUALIZER_DISPLAY_BIN_COUNT = 24;

const SILENT_DB = -120;
const METER_ATTACK_MS = 42;
const METER_RELEASE_MS = 180;
const SERIES_SMOOTH_MS = 92;
const AUTO_PAN_SMOOTH_MS = 240;
const EPSILON = 0.0001;

type SmoothingFactors = {
  meterAttack: number;
  meterRelease: number;
  series: number;
};

function toFactor(deltaMs: number, windowMs: number) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return 1;
  }

  return 1 - Math.exp(-deltaMs / Math.max(1, windowMs));
}

function getFactors(deltaMs: number) {
  return {
    meterAttack: toFactor(deltaMs, METER_ATTACK_MS),
    meterRelease: toFactor(deltaMs, METER_RELEASE_MS),
    series: toFactor(deltaMs, SERIES_SMOOTH_MS),
  };
}

function smoothNumber(previous: number, target: number, attack: number, release: number) {
  const next = Number.isFinite(target) ? target : previous;
  const alpha = next > previous ? attack : release;
  return previous + (next - previous) * alpha;
}

function smoothSeriesValue(previous: number, target: number, amount: number) {
  const next = Number.isFinite(target) ? target : previous;
  return previous + (next - previous) * amount;
}

export function resampleVisualizerSeries(values: readonly number[], nextLength = FX_VISUALIZER_DISPLAY_BIN_COUNT) {
  const targetLength = Math.max(0, Math.floor(nextLength));
  if (targetLength === 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: targetLength }, () => 0);
  }

  if (values.length === 1) {
    return Array.from({ length: targetLength }, () => values[0] ?? 0);
  }

  if (values.length === targetLength) {
    return [...values];
  }

  const lastIndex = values.length - 1;
  return Array.from({ length: targetLength }, (_, index) => {
    const position = (index / Math.max(1, targetLength - 1)) * lastIndex;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(lastIndex, leftIndex + 1);
    const mix = position - leftIndex;
    const left = values[leftIndex] ?? 0;
    const right = values[rightIndex] ?? left;
    return left + (right - left) * mix;
  });
}

function smoothNumberArray(previous: readonly number[], target: readonly number[], amount: number) {
  const nextLength = Math.max(previous.length, target.length);
  const previousSeries = resampleVisualizerSeries(previous, nextLength);
  const targetSeries = resampleVisualizerSeries(target, nextLength);
  return previousSeries.map((value, index) => smoothSeriesValue(value, targetSeries[index] ?? 0, amount));
}


const toPayloadRecord = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

function zeroPayloadValue(value: unknown) {
  if (typeof value === "number") {
    return 0;
  }

  if (Array.isArray(value)) {
    const nextValue = structuredClone(value);
    const stack: Array<unknown[] | Record<string, unknown>> = [nextValue];
    while (stack.length > 0) {
      const currentValue = stack.pop();
      if (!currentValue) {
        continue;
      }
      if (Array.isArray(currentValue)) {
        for (let index = 0; index < currentValue.length; index += 1) {
          const entry = currentValue[index];
          if (typeof entry === "number") {
            currentValue[index] = 0;
          } else if (Array.isArray(entry)) {
            stack.push(entry);
          } else if (isPayloadRecord(entry)) {
            stack.push(toPayloadRecord(entry));
          }
        }
        continue;
      }

      for (const [key, entry] of Object.entries(currentValue)) {
        if (typeof entry === "number") {
          currentValue[key] = 0;
        } else if (Array.isArray(entry)) {
          stack.push(entry);
        } else if (isPayloadRecord(entry)) {
          stack.push(toPayloadRecord(entry));
        }
      }
    }

    return nextValue;
  }

  if (!isPayloadRecord(value)) {
    return value;
  }

  const nextValue = toPayloadRecord(structuredClone(value));
  const stack: Array<unknown[] | Record<string, unknown>> = [nextValue];
  while (stack.length > 0) {
    const currentValue = stack.pop();
    if (!currentValue) {
      continue;
    }
    if (Array.isArray(currentValue)) {
      for (let index = 0; index < currentValue.length; index += 1) {
        const entry = currentValue[index];
        if (typeof entry === "number") {
          currentValue[index] = 0;
        } else if (Array.isArray(entry)) {
          stack.push(entry);
        } else if (isPayloadRecord(entry)) {
          stack.push(toPayloadRecord(entry));
        }
      }
      continue;
    }

    for (const [key, entry] of Object.entries(currentValue)) {
      if (typeof entry === "number") {
        currentValue[key] = 0;
      } else if (Array.isArray(entry)) {
        stack.push(entry);
      } else if (isPayloadRecord(entry)) {
        stack.push(toPayloadRecord(entry));
      }
    }
  }

  return nextValue;
}

function smoothPayloadValue(previous: unknown, target: unknown, factors: SmoothingFactors) {
  if (Array.isArray(previous) || Array.isArray(target)) {
    return smoothNumberArray(
      Array.isArray(previous) ? previous.filter((value): value is number => typeof value === "number") : [],
      Array.isArray(target) ? target.filter((value): value is number => typeof value === "number") : [],
      factors.series,
    );
  }

  if (typeof previous === "number" || typeof target === "number") {
    return smoothSeriesValue(typeof previous === "number" ? previous : 0, typeof target === "number" ? target : 0, factors.series);
  }

  if (!isPayloadRecord(previous) || !isPayloadRecord(target)) {
    return target ?? previous ?? null;
  }

  const root: Record<string, unknown> = {};
  const stack: Array<{
    output: Record<string, unknown>;
    previous: Record<string, unknown>;
    target: Record<string, unknown>;
  }> = [{
    output: root,
    previous: toPayloadRecord(previous),
    target: toPayloadRecord(target),
  }];
  while (stack.length > 0) {
    const currentFrame = stack.pop();
    if (!currentFrame) {
      continue;
    }

    const keys = new Set([
      ...Object.keys(currentFrame.previous),
      ...Object.keys(currentFrame.target),
    ]);
    for (const key of keys) {
      const previousValue = currentFrame.previous[key];
      const targetValue = currentFrame.target[key];
      if (Array.isArray(previousValue) || Array.isArray(targetValue)) {
        currentFrame.output[key] = smoothNumberArray(
          Array.isArray(previousValue) ? previousValue : [],
          Array.isArray(targetValue) ? targetValue : [],
          factors.series,
        );
        continue;
      }

      if (typeof previousValue === "number" || typeof targetValue === "number") {
        currentFrame.output[key] = smoothSeriesValue(
          typeof previousValue === "number" ? previousValue : 0,
          typeof targetValue === "number" ? targetValue : 0,
          factors.series,
        );
        continue;
      }

      if (!isPayloadRecord(previousValue) || !isPayloadRecord(targetValue)) {
        currentFrame.output[key] = targetValue ?? previousValue ?? null;
        continue;
      }

      const nextOutput: Record<string, unknown> = {};
      currentFrame.output[key] = nextOutput;
      stack.push({
        output: nextOutput,
        previous: toPayloadRecord(previousValue),
        target: toPayloadRecord(targetValue),
      });
    }
  }

  return root;
}

function smoothPayload(
  previous: NodeVisualizerFrame["payload"],
  target: NodeVisualizerFrame["payload"] | undefined,
  factors: SmoothingFactors,
  deltaMs: number,
): NodeVisualizerFrame["payload"] {
  if (!previous.case && !target?.case) {
    return { case: undefined, value: undefined };
  }

  if (!previous.case) {
    return target ?? previous;
  }

  if (!target?.case) {
    return payloadValue(previous.case, smoothPayloadValue(previous.value, zeroPayloadValue(previous.value), factors));
  }

  if (previous.case !== target.case) {
    return target;
  }

  if (target.case === "autoPan") {
    const previousValue = asRecord((previous.value ?? {}));
    const targetValue = asRecord((target.value ?? {}));
    const autoPanFactor = toFactor(deltaMs, AUTO_PAN_SMOOTH_MS);
    return payloadValue(target.case, {
        ...targetValue,
        panPosition: smoothSeriesValue(
          typeof previousValue.panPosition === "number" ? previousValue.panPosition : 0,
          typeof targetValue.panPosition === "number" ? targetValue.panPosition : 0,
          autoPanFactor,
        ),
      });
  }

  return payloadValue(target.case, smoothPayloadValue(previous.value, target.value, factors));
}

function smoothTap(previous: MeterTap | undefined, target: MeterTap | undefined, factors: SmoothingFactors) {
  const previousTap = previous ?? create(MeterTapSchema, {
    chainId: target?.chainId ?? 0,
    nodeId: target?.nodeId ?? 0,
    inputPeakDb: SILENT_DB,
    outputPeakDb: SILENT_DB,
    inputPeakDbLeft: SILENT_DB,
    inputPeakDbRight: SILENT_DB,
    outputPeakDbLeft: SILENT_DB,
    outputPeakDbRight: SILENT_DB,
    waveform: [],
  });
  const targetTap = target ?? create(MeterTapSchema, {
    chainId: previousTap.chainId,
    nodeId: previousTap.nodeId,
    inputPeakDb: SILENT_DB,
    outputPeakDb: SILENT_DB,
    inputPeakDbLeft: SILENT_DB,
    inputPeakDbRight: SILENT_DB,
    outputPeakDbLeft: SILENT_DB,
    outputPeakDbRight: SILENT_DB,
    waveform: [],
  });

  return create(MeterTapSchema, {
    chainId: targetTap.chainId,
    nodeId: targetTap.nodeId,
    inputPeakDb: smoothNumber(previousTap.inputPeakDb, targetTap.inputPeakDb, factors.meterAttack, factors.meterRelease),
    outputPeakDb: smoothNumber(previousTap.outputPeakDb, targetTap.outputPeakDb, factors.meterAttack, factors.meterRelease),
    inputPeakDbLeft: smoothNumber(previousTap.inputPeakDbLeft, targetTap.inputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    inputPeakDbRight: smoothNumber(previousTap.inputPeakDbRight, targetTap.inputPeakDbRight, factors.meterAttack, factors.meterRelease),
    outputPeakDbLeft: smoothNumber(previousTap.outputPeakDbLeft, targetTap.outputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    outputPeakDbRight: smoothNumber(previousTap.outputPeakDbRight, targetTap.outputPeakDbRight, factors.meterAttack, factors.meterRelease),
    waveform: smoothNumberArray(previousTap.waveform, targetTap.waveform, factors.series),
  });
}

function smoothNodeFrame(
  previous: NodeVisualizerFrame | undefined,
  target: NodeVisualizerFrame | undefined,
  factors: SmoothingFactors,
  deltaMs: number,
) {
  const previousFrame = previous ?? create(NodeVisualizerFrameSchema, {
    chainId: target?.chainId ?? 0,
    nodeId: target?.nodeId ?? 0,
    inputPeakDb: SILENT_DB,
    outputPeakDb: SILENT_DB,
    inputPeakDbLeft: SILENT_DB,
    inputPeakDbRight: SILENT_DB,
    outputPeakDbLeft: SILENT_DB,
    outputPeakDbRight: SILENT_DB,
    payload: { case: undefined, value: undefined },
  });
  const targetFrame = target ?? create(NodeVisualizerFrameSchema, {
    chainId: previousFrame.chainId,
    nodeId: previousFrame.nodeId,
    inputPeakDb: SILENT_DB,
    outputPeakDb: SILENT_DB,
    inputPeakDbLeft: SILENT_DB,
    inputPeakDbRight: SILENT_DB,
    outputPeakDbLeft: SILENT_DB,
    outputPeakDbRight: SILENT_DB,
    payload: undefined,
  });

  return create(NodeVisualizerFrameSchema, {
    chainId: targetFrame.chainId,
    nodeId: targetFrame.nodeId,
    inputPeakDb: smoothNumber(previousFrame.inputPeakDb, targetFrame.inputPeakDb, factors.meterAttack, factors.meterRelease),
    outputPeakDb: smoothNumber(previousFrame.outputPeakDb, targetFrame.outputPeakDb, factors.meterAttack, factors.meterRelease),
    inputPeakDbLeft: smoothNumber(previousFrame.inputPeakDbLeft, targetFrame.inputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    inputPeakDbRight: smoothNumber(previousFrame.inputPeakDbRight, targetFrame.inputPeakDbRight, factors.meterAttack, factors.meterRelease),
    outputPeakDbLeft: smoothNumber(previousFrame.outputPeakDbLeft, targetFrame.outputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    outputPeakDbRight: smoothNumber(previousFrame.outputPeakDbRight, targetFrame.outputPeakDbRight, factors.meterAttack, factors.meterRelease),
    payload: smoothPayload(previousFrame.payload, targetFrame.payload, factors, deltaMs),
  });
}

function tapKey(tap: Pick<MeterTap, "chainId" | "nodeId">) {
  return `${tap.chainId}:${tap.nodeId}`;
}

function nodeFrameKey(frame: Pick<NodeVisualizerFrame, "chainId" | "nodeId">) {
  return `${frame.chainId}:${frame.nodeId}`;
}

function shouldKeepTap(tap: MeterTap, target: MeterTap | undefined) {
  if (target) {
    return true;
  }

  return (
    tap.inputPeakDb > SILENT_DB + 0.5 ||
    tap.outputPeakDb > SILENT_DB + 0.5 ||
    tap.waveform.some((value) => Math.abs(value) > EPSILON)
  );
}

function payloadHasEnergy(payload: NodeVisualizerFrame["payload"]) {
  if (!payload.case || !payload.value) {
    return false;
  }

  const stack: unknown[] = [payload.value];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (typeof value === "number") {
      if (Math.abs(value) > EPSILON) {
        return true;
      }
      continue;
    }
    if (isPayloadRecord(value)) {
      stack.push(...Object.values(toPayloadRecord(value)));
    }
  }

  return false;
}

function shouldKeepNodeFrame(frame: NodeVisualizerFrame, target: NodeVisualizerFrame | undefined) {
  if (target) {
    return true;
  }

  return (
    frame.inputPeakDb > SILENT_DB + 0.5 ||
    frame.outputPeakDb > SILENT_DB + 0.5 ||
    payloadHasEnergy(frame.payload)
  );
}

export function smoothVisualizerFrame(previous: VisualizerFrame, next: VisualizerFrame, deltaMs: number) {
  const factors = getFactors(deltaMs);
  const previousTaps = new Map(previous.taps.map((tap) => [tapKey(tap), tap]));
  const nextTaps = new Map(next.taps.map((tap) => [tapKey(tap), tap]));
  const tapKeys = new Set([...previousTaps.keys(), ...nextTaps.keys()]);
  const previousFrames = new Map(previous.nodeFrames.map((frame) => [nodeFrameKey(frame), frame]));
  const nextFrames = new Map(next.nodeFrames.map((frame) => [nodeFrameKey(frame), frame]));
  const frameKeys = new Set([...previousFrames.keys(), ...nextFrames.keys()]);

  return create(VisualizerFrameSchema, {
    sequence: next.sequence,
    masterInputPeakDb: smoothNumber(previous.masterInputPeakDb, next.masterInputPeakDb, factors.meterAttack, factors.meterRelease),
    masterInputPeakDbLeft: smoothNumber(previous.masterInputPeakDbLeft, next.masterInputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    masterInputPeakDbRight: smoothNumber(previous.masterInputPeakDbRight, next.masterInputPeakDbRight, factors.meterAttack, factors.meterRelease),
    masterOutputPeakDb: smoothNumber(previous.masterOutputPeakDb, next.masterOutputPeakDb, factors.meterAttack, factors.meterRelease),
    masterOutputPeakDbLeft: smoothNumber(previous.masterOutputPeakDbLeft, next.masterOutputPeakDbLeft, factors.meterAttack, factors.meterRelease),
    masterOutputPeakDbRight: smoothNumber(previous.masterOutputPeakDbRight, next.masterOutputPeakDbRight, factors.meterAttack, factors.meterRelease),
    gainReductionDb: smoothSeriesValue(previous.gainReductionDb, next.gainReductionDb, factors.series),
    taps: [...tapKeys]
      .map((key) => smoothTap(previousTaps.get(key), nextTaps.get(key), factors))
      .filter((tap) => shouldKeepTap(tap, nextTaps.get(tapKey(tap)))),
    nodeFrames: [...frameKeys]
      .map((key) => smoothNodeFrame(previousFrames.get(key), nextFrames.get(key), factors, deltaMs))
      .filter((frame) => shouldKeepNodeFrame(frame, nextFrames.get(nodeFrameKey(frame)))),
  });
}

function payloadValue(kind: NonNullable<NodeVisualizerFrame["payload"]["case"]>, value: unknown): NodeVisualizerFrame["payload"] {
switch(kind) { case "compressor": return {case: "compressor", value: requireNodeMessage(value, CompressorVisualizerPayloadSchema)};
case "eq": return {case: "eq", value: requireNodeMessage(value, EqVisualizerPayloadSchema)};
case "transientShaper": return {case: "transientShaper", value: requireNodeMessage(value, TransientShaperVisualizerPayloadSchema)};
case "noiseGate": return {case: "noiseGate", value: requireNodeMessage(value, NoiseGateVisualizerPayloadSchema)};
case "delay": return {case: "delay", value: requireNodeMessage(value, DelayVisualizerPayloadSchema)};
case "reverb": return {case: "reverb", value: requireNodeMessage(value, ReverbVisualizerPayloadSchema)};
case "convolver": return {case: "convolver", value: requireNodeMessage(value, ConvolverVisualizerPayloadSchema)};
case "tapeSaturation": return {case: "tapeSaturation", value: requireNodeMessage(value, TapeSaturationVisualizerPayloadSchema)};
case "bitcrusher": return {case: "bitcrusher", value: requireNodeMessage(value, BitcrusherVisualizerPayloadSchema)};
case "exciter": return {case: "exciter", value: requireNodeMessage(value, ExciterVisualizerPayloadSchema)};
case "chorus": return {case: "chorus", value: requireNodeMessage(value, ChorusVisualizerPayloadSchema)};
case "phaser": return {case: "phaser", value: requireNodeMessage(value, PhaserVisualizerPayloadSchema)};
case "autoPan": return {case: "autoPan", value: requireNodeMessage(value, AutoPanVisualizerPayloadSchema)};
case "rotarySpeaker": return {case: "rotarySpeaker", value: requireNodeMessage(value, RotarySpeakerVisualizerPayloadSchema)};
case "stereoImager": return {case: "stereoImager", value: requireNodeMessage(value, StereoImagerVisualizerPayloadSchema)};
case "pitchDrift": return {case: "pitchDrift", value: requireNodeMessage(value, PitchDriftVisualizerPayloadSchema)}; }
}
