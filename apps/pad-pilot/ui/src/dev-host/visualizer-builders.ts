import { create, toBinary, isMessage } from "@bufbuild/protobuf";
import { bytesToBase64 } from "../proto/base64";
import {
  AutoPanVisualizerPayloadSchema,
  BitcrusherVisualizerPayloadSchema,
  ChorusVisualizerPayloadSchema,
  CompressorVisualizerPayloadSchema,
  ConvolverVisualizerPayloadSchema,
  DelayVisualizerPayloadSchema,
  EqVisualizerPayloadSchema,
  ExciterVisualizerPayloadSchema,
  FxNodeType,
  MeterTapSchema,
  NodeVisualizerFrameSchema,
  NoiseGateVisualizerPayloadSchema,
  PhaserVisualizerPayloadSchema,
  PitchDriftVisualizerPayloadSchema,
  ReverbVisualizerPayloadSchema,
  RotarySpeakerVisualizerPayloadSchema,
  StereoImagerVisualizerPayloadSchema,
  TapeSaturationVisualizerPayloadSchema,
  TransientShaperVisualizerPayloadSchema,
  VisualizerFrameSchema,
  type ChainState,
  CompressorNodeConfigSchema,
  ConvolverNodeConfigSchema,
  DelayNodeConfigSchema,
  EqNodeConfigSchema,
  ExciterNodeConfigSchema,
  type FxChainState,
  type NodeState,
  NoiseGateNodeConfigSchema,
  PhaserNodeConfigSchema,
  PitchDriftNodeConfigSchema,
  ReverbNodeConfigSchema,
  RotarySpeakerNodeConfigSchema,
  StereoImagerNodeConfigSchema,
  TapeSaturationNodeConfigSchema,
  TransientShaperNodeConfigSchema,
} from "../proto/generated/fx-chain-pb";
import { resolveNodeConfig } from "../modules/fx/node-registry/registry";
import { clamp, clamp01 } from "../utils/math";
import type { DevSignalFrame } from "./types";

const SERIES_LENGTH = 24;
const VECTOR_LENGTH = 48;
const TWO_PI = Math.PI * 2;
function dbFromEnergy(value: number) {
  if (value <= 0.0001) {
    return -120;
  }
  return clamp(-48 + value * 52, -120, 6);
}

function makeSeries(length: number, mapper: (index: number, ratio: number) => number) {
  return Array.from({ length }, (_, index) => {
    const ratio = length <= 1 ? 0 : index / (length - 1);
    return clamp01(mapper(index, ratio));
  });
}

function makeSignedSeries(length: number, mapper: (index: number, ratio: number) => number) {
  return Array.from({ length }, (_, index) => {
    const ratio = length <= 1 ? 0 : index / (length - 1);
    return clamp(mapper(index, ratio), -1, 1);
  });
}

function nodeActivity(node: NodeState, signal: DevSignalFrame) {
  if (node.muted) {
    return 0.02;
  }
  const bypassScale = node.bypassed ? 0.45 : 1;
  return clamp01((signal.energy * 0.8 + signal.transient * 0.2) * clamp01(node.mix) * bypassScale);
}

function waveformSeries(signal: DevSignalFrame, accent = 1) {
  return makeSignedSeries(SERIES_LENGTH, (_, ratio) => {
    const phase = ratio + signal.phase;
    const base = Math.sin(TWO_PI * phase) * (0.35 + signal.energy * 0.5 * accent);
    const harmonic = Math.sin(TWO_PI * phase * 2.1) * signal.noise * 0.2;
    return base + harmonic;
  });
}

function envelopeSeries(signal: DevSignalFrame, attack = 0.5, sustain = 0.5) {
  return makeSeries(SERIES_LENGTH, (_, ratio) => {
    const transientWindow = Math.exp(-ratio * (3.5 - attack * 1.5)) * (0.35 + signal.transient * 0.8);
    const sustainTail = (1 - ratio * 0.8) * (0.25 + sustain * 0.5 * signal.energy);
    return transientWindow + sustainTail;
  });
}

function createGenericNodeFrame(chainId: number, nodeId: number, inputPeakDb: number, outputPeakDb: number, leftDb: number, rightDb: number) {
  return create(NodeVisualizerFrameSchema, {
    chainId,
    nodeId,
    inputPeakDb,
    inputPeakDbLeft: leftDb,
    inputPeakDbRight: rightDb,
    outputPeakDb,
    outputPeakDbLeft: leftDb - 0.5,
    outputPeakDbRight: rightDb - 0.5,
  });
}

function createPayloadFrame(node: NodeState, chainId: number, signal: DevSignalFrame) {
  const activity = nodeActivity(node, signal);
  const inputPeakDb = dbFromEnergy(activity * 0.92 + 0.05);
  const leftDb = dbFromEnergy(activity * (0.82 + signal.spread * 0.12));
  const rightDb = dbFromEnergy(activity * (0.82 - signal.spread * 0.12) + signal.rightEnergy * 0.18);
  const config = resolveNodeConfig(node);

  switch (node.type) {
    case FxNodeType.COMPRESSOR: {
      if (!isMessage(config, CompressorNodeConfigSchema)) throw new Error("Unexpected CompressorNodeConfig payload");
      const typedConfig = config;
      const effectiveThreshold = Math.abs(typedConfig.thresholdDb) / 60;
      const ratio = clamp(typedConfig.ratio, 0.5, 20);
      const reduction = clamp((activity - effectiveThreshold * 0.6) * ratio * 8, 0, 24);
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb - reduction * 0.4 + typedConfig.makeupDb * 0.35,
        outputPeakDbLeft: leftDb - reduction * 0.35,
        outputPeakDbRight: rightDb - reduction * 0.35,
        payload: {
          case: "compressor",
          value: create(CompressorVisualizerPayloadSchema, {
            expansionMode: ratio < 1,
            gainCurve: makeSignedSeries(SERIES_LENGTH, (_, ratioIndex) => -clamp01((ratioIndex * reduction) / 24)),
            highGainReductionDb: reduction * 0.8,
            inputCurve: makeSeries(SERIES_LENGTH, (_, ratioIndex) => Math.pow(ratioIndex, 0.7) * clamp01(activity + 0.15)),
            lowGainReductionDb: reduction * 0.55,
            midGainReductionDb: reduction * 0.68,
          }),
        },
      });
    }
    case FxNodeType.EQ: {
      if (!isMessage(config, EqNodeConfigSchema)) throw new Error("Unexpected EqNodeConfig payload");
      const typedConfig = config;
      const gainSum = typedConfig.bands.reduce((sum, band) => sum + (band.enabled ? band.gainDb : 0), 0) + typedConfig.lowShelfGainDb + typedConfig.highShelfGainDb;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + gainSum * 0.08,
        outputPeakDbLeft: leftDb + gainSum * 0.06,
        outputPeakDbRight: rightDb + gainSum * 0.06,
        payload: {
          case: "eq",
          value: create(EqVisualizerPayloadSchema, {
            responseCurve: makeSeries(SERIES_LENGTH, (_, ratioIndex) => 0.45 + 0.25 * Math.sin(ratioIndex * Math.PI * 2 + signal.phase) + gainSum / 48),
            spectrumBins: makeSeries(SERIES_LENGTH, (_, ratioIndex) => activity * (0.55 + 0.35 * Math.sin(ratioIndex * Math.PI * (1.2 + signal.spectrumTilt))) + signal.noise * 0.25),
          }),
        },
      });
    }
    case FxNodeType.TRANSIENT_SHAPER: {
      if (!isMessage(config, TransientShaperNodeConfigSchema)) throw new Error("Unexpected TransientShaperNodeConfig payload");
      const typedConfig = config;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.gainDb * 0.15 + typedConfig.attack * signal.transient * 4,
        outputPeakDbLeft: leftDb + typedConfig.attack * signal.transient * 3,
        outputPeakDbRight: rightDb + typedConfig.sustain * signal.energy * 2,
        payload: {
          case: "transientShaper",
          value: create(TransientShaperVisualizerPayloadSchema, {
            originalEnvelope: envelopeSeries(signal, 0.5, 0.5),
            shapedEnvelope: envelopeSeries(signal, typedConfig.attack + 1, typedConfig.sustain + 1),
          }),
        },
      });
    }
    case FxNodeType.NOISE_GATE: {
      if (!isMessage(config, NoiseGateNodeConfigSchema)) throw new Error("Unexpected NoiseGateNodeConfig payload");
      const typedConfig = config;
      const signalLevelDb = dbFromEnergy(activity + signal.noise * 0.12);
      const gateOpen = signalLevelDb >= typedConfig.thresholdDb;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: gateOpen ? inputPeakDb : inputPeakDb + typedConfig.rangeDb,
        outputPeakDbLeft: gateOpen ? leftDb : leftDb + typedConfig.rangeDb,
        outputPeakDbRight: gateOpen ? rightDb : rightDb + typedConfig.rangeDb,
        payload: {
          case: "noiseGate",
          value: create(NoiseGateVisualizerPayloadSchema, {
            gateOpen,
            signalLevelDb,
            thresholdDb: typedConfig.thresholdDb,
          }),
        },
      });
    }
    case FxNodeType.DELAY: {
      if (!isMessage(config, DelayNodeConfigSchema)) throw new Error("Unexpected DelayNodeConfig payload");
      const typedConfig = config;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.feedback * 3,
        outputPeakDbLeft: leftDb + typedConfig.feedback * 2,
        outputPeakDbRight: rightDb + typedConfig.feedback * 2,
        payload: {
          case: "delay",
          value: create(DelayVisualizerPayloadSchema, {
            grainMode: typedConfig.grainMode,
            tapLevels: makeSeries(6, (index) => clamp01((typedConfig.feedback + 0.15) * Math.pow(0.7, index) * (0.75 + signal.transient * 0.3))),
            tapPositions: makeSeries(6, (index) => clamp01((((index + 1) / 6) * typedConfig.time) / 1.5 + signal.phase * 0.08)),
          }),
        },
      });
    }
    case FxNodeType.REVERB: {
      if (!isMessage(config, ReverbNodeConfigSchema)) throw new Error("Unexpected ReverbNodeConfig payload");
      const typedConfig = config;
      const shimmer = typedConfig.mode === "Shimmer" ? typedConfig.shimmerFeedback * 0.7 + signal.modulation * 0.3 : typedConfig.shimmerFeedback * 0.35;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.focusMix * 4,
        outputPeakDbLeft: leftDb + typedConfig.size * 2,
        outputPeakDbRight: rightDb + typedConfig.size * 2,
        payload: {
          case: "reverb",
          value: create(ReverbVisualizerPayloadSchema, {
            diffusion: clamp01(typedConfig.size * 0.75 + signal.energy * 0.35),
            shimmer: clamp01(shimmer),
            texture: clamp01((1 - typedConfig.damping) * 0.6 + signal.noise * 0.4 + signal.modulation * 0.2),
          }),
        },
      });
    }
    case FxNodeType.CONVOLVER: {
      if (!isMessage(config, ConvolverNodeConfigSchema)) throw new Error("Unexpected ConvolverNodeConfig payload");
      const typedConfig = config;
      const irAccent = typedConfig.irId.includes("plate") ? 1.35 : typedConfig.irId.includes("closet") ? 0.65 : 1;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.blend * 2.5,
        outputPeakDbLeft: leftDb + typedConfig.blend * 1.4,
        outputPeakDbRight: rightDb + typedConfig.blend * 1.4,
        payload: {
          case: "convolver",
          value: create(ConvolverVisualizerPayloadSchema, {
            irWaveform: waveformSeries(signal, irAccent).map((value) => Math.abs(value)),
          }),
        },
      });
    }
    case FxNodeType.TAPE_SATURATION: {
      if (!isMessage(config, TapeSaturationNodeConfigSchema)) throw new Error("Unexpected TapeSaturationNodeConfig payload");
      const typedConfig = config;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.drive * 6,
        outputPeakDbLeft: leftDb + typedConfig.drive * 3,
        outputPeakDbRight: rightDb + typedConfig.drive * 3,
        payload: {
          case: "tapeSaturation",
          value: create(TapeSaturationVisualizerPayloadSchema, {
            flux: clamp01(typedConfig.warmth * 0.7 + signal.energy * 0.35),
            reelRotation: (signal.phase * TWO_PI * (typedConfig.tapeSpeedIps / 15)) % TWO_PI,
          }),
        },
      });
    }
    case FxNodeType.BITCRUSHER: {
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb - config.downsample * 0.12,
        outputPeakDbLeft: leftDb - config.downsample * 0.08,
        outputPeakDbRight: rightDb - config.downsample * 0.08,
        payload: {
          case: "bitcrusher",
          value: create(BitcrusherVisualizerPayloadSchema, {
            aliasedWaveform: waveformSeries(signal).map((value) => Math.round(value * Math.max(2, 18 - config.bits)) / Math.max(2, 18 - config.bits)),
            stairStepAmount: clamp01(config.downsample / 32),
          }),
        },
      });
    }
    case FxNodeType.EXCITER: {
      if (!isMessage(config, ExciterNodeConfigSchema)) throw new Error("Unexpected ExciterNodeConfig payload");
      const typedConfig = config;
      const bandBias = typedConfig.frequencyBandSolo === "High" ? 1.15 : typedConfig.frequencyBandSolo === "Low" ? 0.75 : 0.95;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.harmonicDrive * 5,
        outputPeakDbLeft: leftDb + typedConfig.mix * 1.5,
        outputPeakDbRight: rightDb + typedConfig.mix * 1.5,
        payload: {
          case: "exciter",
          value: create(ExciterVisualizerPayloadSchema, {
            generatedHarmonics: makeSeries(SERIES_LENGTH, (_, ratioIndex) => clamp01(activity * bandBias * (1 - ratioIndex * 0.6) + signal.noise * 0.3)),
          }),
        },
      });
    }
    case FxNodeType.CHORUS: {
      const voices = Math.max(2, Number(config.voices) || 4);
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + config.depth * 1.8,
        outputPeakDbLeft: leftDb + config.depth,
        outputPeakDbRight: rightDb + config.depth,
        payload: {
          case: "chorus",
          value: create(ChorusVisualizerPayloadSchema, {
            phaseOffsets: makeSignedSeries(voices, (index) => Math.sin(TWO_PI * (signal.phase + index / (voices + 1))) * config.depth),
          }),
        },
      });
    }
    case FxNodeType.PHASER: {
      if (!isMessage(config, PhaserNodeConfigSchema)) throw new Error("Unexpected PhaserNodeConfig payload");
      const typedConfig = config;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.resonance * 2,
        outputPeakDbLeft: leftDb + typedConfig.resonance,
        outputPeakDbRight: rightDb + typedConfig.resonance,
        payload: {
          case: "phaser",
          value: create(PhaserVisualizerPayloadSchema, {
            combResponse: makeSeries(SERIES_LENGTH, (_, ratioIndex) => 0.5 + 0.45 * Math.sin(TWO_PI * ratioIndex * (typedConfig.stages / 3) + signal.phase * TWO_PI)),
          }),
        },
      });
    }
    case FxNodeType.AUTO_PAN: {
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb,
        outputPeakDbLeft: dbFromEnergy(activity * (1 + signal.spread * config.amount * 0.6)),
        outputPeakDbRight: dbFromEnergy(activity * (1 - signal.spread * config.amount * 0.6)),
        payload: {
          case: "autoPan",
          value: create(AutoPanVisualizerPayloadSchema, {
            panPosition: Math.sin(TWO_PI * signal.phase * Math.max(0.25, config.rateHz)) * config.amount,
          }),
        },
      });
    }
    case FxNodeType.ROTARY_SPEAKER: {
      if (!isMessage(config, RotarySpeakerNodeConfigSchema)) throw new Error("Unexpected RotarySpeakerNodeConfig payload");
      const typedConfig = config;
      const speedScale = typedConfig.fast ? 2.4 : 0.9;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + typedConfig.drive * 3,
        outputPeakDbLeft: leftDb + typedConfig.drive * 1.5,
        outputPeakDbRight: rightDb + typedConfig.drive * 1.5,
        payload: {
          case: "rotarySpeaker",
          value: create(RotarySpeakerVisualizerPayloadSchema, {
            drumAngle: (signal.phase * TWO_PI * speedScale * 0.65) % TWO_PI,
            hornAngle: (signal.phase * TWO_PI * speedScale) % TWO_PI,
          }),
        },
      });
    }
    case FxNodeType.STEREO_IMAGER: {
      if (!isMessage(config, StereoImagerNodeConfigSchema)) throw new Error("Unexpected StereoImagerNodeConfig payload");
      const typedConfig = config;
      const radius = clamp01(typedConfig.widthPercent / 200) * (0.4 + signal.spread * 0.6);
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb + radius,
        outputPeakDbLeft: leftDb + radius,
        outputPeakDbRight: rightDb + radius,
        payload: {
          case: "stereoImager",
          value: create(StereoImagerVisualizerPayloadSchema, {
            vectorscopePoints: Array.from({ length: VECTOR_LENGTH }, (_, index) => {
              const ratio = index / VECTOR_LENGTH;
              return index % 2 === 0
                ? Math.cos(TWO_PI * (ratio + signal.phase)) * radius
                : Math.sin(TWO_PI * (ratio + signal.phase)) * radius * (0.55 + signal.modulation * 0.45);
            }),
          }),
        },
      });
    }
    case FxNodeType.PITCH_DRIFT: {
      if (!isMessage(config, PitchDriftNodeConfigSchema)) throw new Error("Unexpected PitchDriftNodeConfig payload");
      const typedConfig = config;
      return create(NodeVisualizerFrameSchema, {
        chainId,
        nodeId: node.id,
        inputPeakDb,
        inputPeakDbLeft: leftDb,
        inputPeakDbRight: rightDb,
        outputPeakDb: inputPeakDb,
        outputPeakDbLeft: leftDb,
        outputPeakDbRight: rightDb,
        payload: {
          case: "pitchDrift",
          value: create(PitchDriftVisualizerPayloadSchema, {
            driftCents: makeSignedSeries(SERIES_LENGTH, (_, ratioIndex) => Math.sin(TWO_PI * (ratioIndex + signal.phase) * Math.max(0.15, typedConfig.rateHz)) * ((typedConfig.rangeCents * typedConfig.depth) / 100)),
          }),
        },
      });
    }
    default:
      return createGenericNodeFrame(chainId, node.id, inputPeakDb, inputPeakDb + 0.5, leftDb, rightDb);
  }
}

function createTapForNode(chain: ChainState, node: NodeState, signal: DevSignalFrame) {
  const activity = nodeActivity(node, signal) * (0.75 + chain.mix * 0.25);
  const inputPeakDb = dbFromEnergy(activity);
  const outputPeakDb = dbFromEnergy(activity + clamp01(node.mix) * 0.08);
  return create(MeterTapSchema, {
    chainId: chain.id,
    inputPeakDb,
    inputPeakDbLeft: dbFromEnergy(signal.leftEnergy * 0.7 + activity * 0.3),
    inputPeakDbRight: dbFromEnergy(signal.rightEnergy * 0.7 + activity * 0.3),
    nodeId: node.id,
    outputPeakDb,
    outputPeakDbLeft: dbFromEnergy(signal.leftEnergy * 0.65 + activity * 0.35),
    outputPeakDbRight: dbFromEnergy(signal.rightEnergy * 0.65 + activity * 0.35),
    waveform: waveformSeries(signal).map((value) => Math.abs(value)),
  });
}

export function buildSyntheticVisualizerFrameBase64(state: FxChainState, signal: DevSignalFrame, sequence: bigint) {
  const nodeFrames = [];
  const taps = [];
  for (const chain of state.chains) {
    for (const node of chain.nodes) {
      const frame = createPayloadFrame(node, chain.id, signal);
      nodeFrames.push(frame);
      taps.push(createTapForNode(chain, node, signal));
    }
  }

  const inputGain = Math.max(0, state.master?.inputGainDb ?? 0) / 24;
  const outputGain = Math.max(0, state.master?.outputGainDb ?? 0) / 24;
  const wetDry = clamp01(state.master?.wetDry ?? 1);
  const masterInputPeakDb = dbFromEnergy(signal.energy + inputGain);
  const masterOutputPeakDb = dbFromEnergy(signal.energy * wetDry + outputGain);
  const gainReductionDb = Math.max(0, nodeFrames.reduce((maxValue, frame) => Math.max(maxValue, frame.inputPeakDb - frame.outputPeakDb), 0));

  const message = create(VisualizerFrameSchema, {
    gainReductionDb,
    masterInputPeakDb,
    masterInputPeakDbLeft: dbFromEnergy(signal.leftEnergy + inputGain),
    masterInputPeakDbRight: dbFromEnergy(signal.rightEnergy + inputGain),
    masterOutputPeakDb,
    masterOutputPeakDbLeft: dbFromEnergy(signal.leftEnergy * wetDry + outputGain),
    masterOutputPeakDbRight: dbFromEnergy(signal.rightEnergy * wetDry + outputGain),
    nodeFrames,
    sequence,
    taps,
  });

  return bytesToBase64(toBinary(VisualizerFrameSchema, message));
}
