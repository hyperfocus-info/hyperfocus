import { FxNodeType } from "../../../proto/generated/fx-chain-pb";

/**
 * Interactive FX fields with an observable native DSP mapping.
 *
 * Keep this aligned with ConvolverModuleGraph's typed-state, realtime-parameter,
 * and custom-node processors. Registry tests fail if UI controls drift from it.
 */
export const FX_NATIVE_SUPPORTED_CONTROL_KEYS: Record<FxNodeType, readonly string[]> = {
  [FxNodeType.UNSPECIFIED]: [],
  [FxNodeType.CONVOLVER]: ["blend", "irId", "irSourcePath", "irSourceName"],
  [FxNodeType.DELAY]: ["time", "feedback", "focusMix", "lowCutHz", "highCutHz", "width", "saturation", "character"],
  [FxNodeType.REVERB]: ["decay", "size", "focusMix", "mode", "damping", "preDelayMs", "modulationSpeedHz", "modulationDepth"],
  [FxNodeType.CHORUS]: ["rateHz", "depth", "width", "voiceDelayMs", "feedback"],
  [FxNodeType.EQ]: ["lowShelfFrequencyHz", "lowShelfGainDb", "highShelfFrequencyHz", "highShelfGainDb", "masterGainDb", "band0FrequencyHz", "band0Q", "band0GainDb", "band0Type"],
  [FxNodeType.COMPRESSOR]: ["thresholdDb", "ratio", "makeupDb", "attackMs", "releaseMs"],
  [FxNodeType.TRANSIENT_SHAPER]: ["attack", "sustain", "softClip", "gainDb", "sensitivity"],
  [FxNodeType.NOISE_GATE]: ["thresholdDb", "rangeDb", "attackMs", "holdMs", "releaseMs"],
  [FxNodeType.TAPE_SATURATION]: ["drive", "warmth", "tapeSpeedIps", "wowFlutter", "hysteresis", "bias"],
  [FxNodeType.BITCRUSHER]: ["bits", "downsample", "jitter", "postFilter", "wetDry"],
  [FxNodeType.EXCITER]: ["harmonicDrive", "mix", "frequencyBandSolo", "oddEvenBalance"],
  [FxNodeType.PHASER]: ["speedHz", "centerFrequencyHz", "stages", "resonance", "stereoPhaseOffset"],
  [FxNodeType.AUTO_PAN]: ["rateHz", "amount", "lfoShape", "phaseOffset", "smoothing"],
  [FxNodeType.ROTARY_SPEAKER]: ["fast", "drive", "hornDrumBalance", "micDistance", "acceleration"],
  [FxNodeType.STEREO_IMAGER]: ["widthPercent", "bassMonoCrossoverHz", "stereoBalance", "pan"],
  [FxNodeType.PITCH_DRIFT]: ["depth", "rateHz", "driftShape", "stereoOffset", "rangeCents"],
  [FxNodeType.REVERSE]: ["windowMs", "pitchSemitones", "forwardMix", "crossfadeMs"],
  [FxNodeType.TREMOLO]: ["rateHz", "depth", "stereoPhaseOffset", "lfoShape", "smoothing"],
  [FxNodeType.SATURATION]: ["drive", "tone", "outputGainDb", "character", "bias"],
} as const;

/** Serialized fields retained so existing presets remain wire-compatible, but not exposed as controls. */
export const FX_PROTO_COMPATIBILITY_ONLY_FIELDS: Partial<Record<FxNodeType, readonly string[]>> = {
  [FxNodeType.CONVOLVER]: ["irStretch", "reverse", "startTrim", "endTrim", "highPassHz", "lowPassHz"],
  [FxNodeType.DELAY]: ["grainMode", "grainSize", "grainDensity", "grainSpray", "grainPitchShift"],
  [FxNodeType.REVERB]: ["shimmerFeedback"],
  [FxNodeType.CHORUS]: ["voices"],
  [FxNodeType.COMPRESSOR]: ["kneeDb", "sidechainHpfHz", "lookaheadMs", "multibandEnabled", "lowBand", "midBand", "highBand"],
  [FxNodeType.NOISE_GATE]: ["sidechainListen"],
};
