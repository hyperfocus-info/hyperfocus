#include "audio/convolver-module-graph.h"
#include "audio/fx-state-validation.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <initializer_list>
#include <limits>
#include <string>

#include "generated/proto/fx-chain.pb.h"

namespace padpilot {
namespace {
struct StereoPeakDb {
  float mono{-120.0f};
  float left{-120.0f};
  float right{-120.0f};
};

float amplitudeToDb(float peak) {
  constexpr float kMinAmplitude = 1.0e-6f;
  const float safePeak = std::max(peak, kMinAmplitude);
  return 20.0f * std::log10(safePeak);
}

StereoPeakDb computeStereoPeakDb(const juce::AudioBuffer<float>& buffer) {
  const int channels = buffer.getNumChannels();
  const int samples = buffer.getNumSamples();
  if (channels <= 0 || samples <= 0) {
    return {};
  }

  const float leftPeak = buffer.getMagnitude(0, 0, samples);
  const float rightPeak = buffer.getMagnitude(std::min(1, channels - 1), 0, samples);
  float monoPeak = std::max(leftPeak, rightPeak);
  for (int channel = 2; channel < channels; ++channel) {
    monoPeak = std::max(monoPeak, buffer.getMagnitude(channel, 0, samples));
  }

  return {
      amplitudeToDb(monoPeak),
      amplitudeToDb(leftPeak),
      amplitudeToDb(rightPeak),
  };
}

std::uint32_t decodeChainId(const std::uint32_t targetId) { return (targetId >> 16U) & 0xffU; }

std::uint32_t decodeNodeId(const std::uint32_t targetId) { return (targetId >> 8U) & 0xffU; }

std::uint32_t decodeNodeParameterId(const std::uint32_t targetId) { return targetId & 0xffU; }

void copyBuffer(juce::AudioBuffer<float>& destination, const juce::AudioBuffer<float>& source) {
  const int channels = std::min(destination.getNumChannels(), source.getNumChannels());
  const int samples = std::min(destination.getNumSamples(), source.getNumSamples());
  destination.clear();
  for (int channel = 0; channel < channels; ++channel) {
    destination.copyFrom(channel, 0, source, channel, 0, samples);
  }
}

void clearBuffer(juce::AudioBuffer<float>& buffer) { buffer.clear(); }

void addBuffer(juce::AudioBuffer<float>& destination, const juce::AudioBuffer<float>& source) {
  const int channels = std::min(destination.getNumChannels(), source.getNumChannels());
  const int samples = std::min(destination.getNumSamples(), source.getNumSamples());
  for (int channel = 0; channel < channels; ++channel) {
    destination.addFrom(channel, 0, source, channel, 0, samples);
  }
}

float clampUnitInterval(float value) { return std::clamp(value, 0.0f, 1.0f); }

bool hasFiniteFxState(const padpilot::fx::FxChainState& state) {
  if (state.has_master() &&
      !padpilot::hasFiniteFxValues({state.master().input_gain_db(), state.master().output_gain_db(),
                                    state.master().wet_dry(), state.master().gain_reduction_db()})) {
    return false;
  }
  for (const auto& chain : state.chains()) {
    if (!std::isfinite(chain.mix())) {
      return false;
    }
    for (const auto& node : chain.nodes()) {
      if (!std::isfinite(node.mix()) || !padpilot::isValidFxNodeConfig(node, false)) {
        return false;
      }
      for (const auto& parameter : node.legacy_params()) {
        if (!padpilot::hasFiniteFxValues(
                {parameter.value(), parameter.min_value(), parameter.max_value(), parameter.default_value()})) {
          return false;
        }
      }
    }
  }
  for (const auto& modulator : state.modulators()) {
    if (!padpilot::hasFiniteFxValues({modulator.rate_hz(), modulator.phase_offset()})) return false;
  }
  for (const auto& route : state.modulation_routes()) {
    if (!padpilot::hasFiniteFxValues({route.depth(), route.min_value(), route.max_value(), route.base_value()})) {
      return false;
    }
  }
  return true;
}

float timingSyncBeatsForIndex(std::uint32_t index) {
  static constexpr std::array<float, 20> kTimingSyncBeats{
      0.125f,      1.0f / 12.0f, 0.1875f, 0.25f,       1.0f / 6.0f, 0.375f, 0.5f, 1.0f / 3.0f, 0.75f, 1.0f,
      2.0f / 3.0f, 1.5f,         2.0f,    4.0f / 3.0f, 3.0f,        4.0f,   8.0f, 16.0f,       32.0f, 64.0f,
  };
  return kTimingSyncBeats[std::min<std::size_t>(index, kTimingSyncBeats.size() - 1)];
}

std::uint32_t timingSyncIndex(float value) {
  return static_cast<std::uint32_t>(std::lround(std::clamp(value, 0.0f, 19.0f)));
}

double feedbackTailRepeats(float feedback) {
  constexpr double kSilenceThreshold = 0.001;
  const double safeFeedback = std::clamp(std::abs(static_cast<double>(feedback)), 0.0, 0.95);
  if (safeFeedback <= kSilenceThreshold) {
    return 1.0;
  }
  return std::max(1.0, std::ceil(std::log(kSilenceThreshold) / std::log(safeFeedback)));
}

padpilot::ParametricEqNode::BandType eqBandTypeFromString(const std::string& type, float frequencyHz) {
  const auto normalized = juce::String(type).toLowerCase();
  if (normalized == "shelf") {
    return frequencyHz < 1000.0f ? padpilot::ParametricEqNode::BandType::lowShelf
                                 : padpilot::ParametricEqNode::BandType::highShelf;
  }
  if (normalized == "pass") {
    return frequencyHz < 1000.0f ? padpilot::ParametricEqNode::BandType::highPass
                                 : padpilot::ParametricEqNode::BandType::lowPass;
  }
  if (normalized == "notch") {
    return padpilot::ParametricEqNode::BandType::notch;
  }
  return padpilot::ParametricEqNode::BandType::bell;
}
}  // namespace

void ConvolverModuleGraph::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
  sampleRate_ = sampleRate;
  samplesPerBlock_ = samplesPerBlock;
  numChannels_ = std::max(1, numChannels);
  prepared_ = true;

  inputScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true);
  outputScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true);
  dryNodeScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true);
  structuralDryScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true);
  for (auto& scratch : chainScratch_) {
    scratch.setSize(numChannels_, samplesPerBlock_, false, false, true);
    scratch.clear();
  }

  const auto blocksPerSecond = std::max(1.0, sampleRate_ / static_cast<double>(std::max(1, samplesPerBlock_)));
  telemetryVisibleIntervalBlocks_ = static_cast<std::uint32_t>(std::max(1.0, std::round(blocksPerSecond / 15.0)));
  telemetryDiagnosticsIntervalBlocks_ = static_cast<std::uint32_t>(std::max(1.0, std::round(blocksPerSecond / 2.0)));
  telemetryBlockCounter_ = 0;
  structuralWetGain_ = 1.0f;
  structuralRampStep_ = static_cast<float>(1.0 / std::max(1.0, sampleRate_ * 0.005));
  structuralBypassRequested_.store(false, std::memory_order_relaxed);
  structuralBypassComplete_.store(false, std::memory_order_relaxed);

  for (int chainIndex = 0; chainIndex < kMaxChains; ++chainIndex) {
    for (auto& node : chainSlots_[static_cast<std::size_t>(chainIndex)].nodes) {
      node.processors = NodeProcessors{};
    }
    resetChainSlot(chainSlots_[static_cast<std::size_t>(chainIndex)], chainIndex);
    orderedChainSlotIndices_[static_cast<std::size_t>(chainIndex)] = chainIndex;
    chainInputPeakDb_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainInputPeakDbRight_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDb_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      nodeInputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeInputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeMotionValue_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          0.0f, std::memory_order_relaxed);
      for (int bin = 0; bin < kWaveformBins; ++bin) {
        nodeInputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                          [static_cast<std::size_t>(bin)]
                              .store(0.0f, std::memory_order_relaxed);
        nodeOutputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                           [static_cast<std::size_t>(bin)]
                               .store(0.0f, std::memory_order_relaxed);
        nodeLeftSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                               [static_cast<std::size_t>(bin)]
                                   .store(0.0f, std::memory_order_relaxed);
        nodeRightSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                                [static_cast<std::size_t>(bin)]
                                    .store(0.0f, std::memory_order_relaxed);
      }
    }
  }

  inputGainLinear_ = 1.0f;
  masterWetDry_ = 1.0f;
  outputGainLinear_ = 1.0f;
  clearMeterSnapshots();

  blocks_.store(0, std::memory_order_relaxed);
  totalNs_.store(0, std::memory_order_relaxed);
  convolverNs_.store(0, std::memory_order_relaxed);
  delayNs_.store(0, std::memory_order_relaxed);
  reverbNs_.store(0, std::memory_order_relaxed);
  reverbPreDelayNs_.store(0, std::memory_order_relaxed);
  reverbCoreNs_.store(0, std::memory_order_relaxed);
  reverbMixNs_.store(0, std::memory_order_relaxed);
  modulationNs_.store(0, std::memory_order_relaxed);
  eqNs_.store(0, std::memory_order_relaxed);
  gainNs_.store(0, std::memory_order_relaxed);
  for (auto& chainTotalNs : chainTotalNs_) {
    chainTotalNs.store(0, std::memory_order_relaxed);
  }
  convolverBypassedBlocks_.store(0, std::memory_order_relaxed);
  delayBypassedBlocks_.store(0, std::memory_order_relaxed);
  reverbBypassedBlocks_.store(0, std::memory_order_relaxed);
  inputPeakDb_.store(-120.0f, std::memory_order_relaxed);
  inputPeakDbLeft_.store(-120.0f, std::memory_order_relaxed);
  inputPeakDbRight_.store(-120.0f, std::memory_order_relaxed);
  convolverPeakDb_.store(-120.0f, std::memory_order_relaxed);
  delayPeakDb_.store(-120.0f, std::memory_order_relaxed);
  reverbPeakDb_.store(-120.0f, std::memory_order_relaxed);
  modulationPeakDb_.store(-120.0f, std::memory_order_relaxed);
  eqPeakDb_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDb_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDbLeft_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDbRight_.store(-120.0f, std::memory_order_relaxed);
  publishTopologySnapshot();
}

void ConvolverModuleGraph::applyState(const padpilot::fx::FxChainState& state) {
  if (!prepared_ || !hasFiniteFxState(state)) {
    return;
  }

  for (int chainIndex = 0; chainIndex < kMaxChains; ++chainIndex) {
    resetChainSlot(chainSlots_[static_cast<std::size_t>(chainIndex)], chainIndex);
    orderedChainSlotIndices_[static_cast<std::size_t>(chainIndex)] = chainIndex;
  }

  const int chainCount = std::min(state.chains_size(), kMaxChains);
  for (int chainIndex = 0; chainIndex < chainCount; ++chainIndex) {
    const auto& sourceChain = state.chains(chainIndex);
    auto& chain = chainSlots_[static_cast<std::size_t>(chainIndex)];
    chain.id = sourceChain.id();
    chain.order = static_cast<std::uint32_t>(chainIndex);
    chain.configured = true;
    chain.active = true;
    chain.muted = sourceChain.muted();
    chain.solo = sourceChain.solo();
    chain.mix = std::clamp(sourceChain.mix(), 0.0f, 1.0f);
    chain.gainLinear = 1.0f;
    orderedChainSlotIndices_[static_cast<std::size_t>(chainIndex)] = chainIndex;

    const int nodeCount = std::min(sourceChain.nodes_size(), kMaxNodesPerChain);
    for (int nodeIndex = 0; nodeIndex < nodeCount; ++nodeIndex) {
      const auto& sourceNode = sourceChain.nodes(nodeIndex);
      auto& node = chain.nodes[static_cast<std::size_t>(nodeIndex)];
      node.id = sourceNode.id();
      node.order = static_cast<std::uint32_t>(nodeIndex);
      node.active = true;
      node.bypassed = sourceNode.bypassed();
      node.muted = sourceNode.muted();
      node.solo = sourceNode.solo();
      node.mix = std::clamp(sourceNode.mix(), 0.0f, 1.0f);
      node.type = nodeTypeFromIndex(static_cast<int>(sourceNode.type()));
      if (node.type == FXChainType::convolver) {
        // Structural apply runs only after the Audio Thread has faded to dry.
        // A fresh processor prevents an empty/replaced per-node IR from reusing
        // the previous node's convolution kernel.
        node.processors.convolver.reset();
      }
      node.sourceState = sourceNode;
      node.realtimeParameterValues.fill(0.0f);
      node.realtimeParameterPresent.fill(false);
      for (const auto& param : sourceNode.legacy_params()) {
        const auto parameterId = static_cast<std::size_t>(param.parameter_id());
        if (parameterId < kMaxRealtimeNodeParameters) {
          node.realtimeParameterValues[parameterId] = param.value();
          node.realtimeParameterPresent[parameterId] = true;
        }
      }
      configureNodeDefaults(node);
      applyTypedNodeState(node, sourceNode);
    }
  }

  modulators_ = {};
  modulationRoutes_ = {};
  const int modulatorCount = std::min(state.modulators_size(), static_cast<int>(kMaxModulators));
  for (int index = 0; index < modulatorCount; ++index) {
    const auto& source = state.modulators(index);
    auto& modulator = modulators_[static_cast<std::size_t>(index)];
    modulator.active = source.enabled();
    modulator.syncEnabled = source.has_rate_sync() && source.rate_sync().enabled();
    modulator.rateHz = std::clamp(source.rate_hz(), 0.01f, 20.0f);
    modulator.rateBeats = source.has_rate_sync() ? timingSyncBeatsForIndex(source.rate_sync().division_index()) : 1.0f;
    modulator.phase = std::clamp(source.phase_offset(), 0.0f, 1.0f) * juce::MathConstants<float>::twoPi;
    modulator.randomState += static_cast<std::uint32_t>(index) * 0x9e37'79b9U;
    const auto& shape = source.shape();
    modulator.shape = shape == "Triangle" || shape == "Tri" ? ModulatorShape::triangle
                      : shape == "Square"                   ? ModulatorShape::square
                      : shape == "Random"                   ? ModulatorShape::random
                                                            : ModulatorShape::sine;
  }
  const int routeCount = std::min(state.modulation_routes_size(), static_cast<int>(kMaxModulationRoutes));
  for (int index = 0; index < routeCount; ++index) {
    const auto& source = state.modulation_routes(index);
    if (source.modulator_id() < 1 || source.modulator_id() > kMaxModulators) continue;
    auto* chain = findChainById(source.chain_id());
    auto* node = chain != nullptr ? findNodeById(*chain, source.node_id()) : nullptr;
    if (node == nullptr || !supportsRealtimeNodeParameter(node->sourceState.type(), source.parameter_id())) continue;
    auto& route = modulationRoutes_[static_cast<std::size_t>(index)];
    route.active = source.enabled();
    route.modulatorIndex = static_cast<std::uint8_t>(source.modulator_id() - 1U);
    route.chainId = source.chain_id();
    route.nodeId = source.node_id();
    route.parameterId = source.parameter_id();
    route.depth = std::clamp(source.depth(), -1.0f, 1.0f);
    route.minValue = std::min(source.min_value(), source.max_value());
    route.maxValue = std::max(source.min_value(), source.max_value());
    route.baseValue = std::clamp(source.base_value(), route.minValue, route.maxValue);
  }

  if (state.has_master()) {
    inputGainLinear_ = std::pow(10.0f, std::clamp(state.master().input_gain_db(), -18.0f, 18.0f) / 20.0f);
    masterWetDry_ = std::clamp(state.master().wet_dry(), 0.0f, 1.0f);
    outputGainLinear_ = std::pow(10.0f, std::clamp(state.master().output_gain_db(), -18.0f, 18.0f) / 20.0f);
  }

  clearMeterSnapshots();
  publishTopologySnapshot();
}

double ConvolverModuleGraph::estimateTailLengthSeconds(const padpilot::fx::FxChainState& state, double sampleRate) {
  if (!hasFiniteFxState(state) || !state.has_master() || state.master().wet_dry() <= 0.0001f) {
    return 0.0;
  }

  const double safeSampleRate = std::isfinite(sampleRate) && sampleRate >= 1.0 ? sampleRate : 44'100.0;
  constexpr double kMinimumHostBpm = 20.0;
  constexpr double maximumDelaySeconds = DelayNode::kMaximumDelaySeconds;
  constexpr double maximumModulationDelaySeconds = ModulationNode::kMaximumDelaySeconds;
  constexpr double maximumReverbPreDelaySeconds = ReverbNode::kMaximumPreDelaySeconds;
  double tailSeconds = 0.0;

  for (const auto& chain : state.chains()) {
    if (chain.muted() || chain.mix() <= 0.0001f) {
      continue;
    }
    double chainTailSeconds = 0.0;
    for (const auto& node : chain.nodes()) {
      if (node.bypassed() || node.muted() || node.mix() <= 0.0001f) {
        continue;
      }
      double nodeTailSeconds = 0.0;
      switch (node.type()) {
        case padpilot::fx::FX_NODE_TYPE_CONVOLVER:
          if (node.has_convolver_config() && !node.convolver_config().ir_source_path().empty() &&
              node.convolver_config().blend() > 0.0001f) {
            nodeTailSeconds = 1.0;
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_DELAY:
          if (node.has_delay_config() && node.delay_config().focus_mix() > 0.0001f) {
            const auto& config = node.delay_config();
            const double requestedDelaySeconds =
                config.has_time_sync() && config.time_sync().enabled()
                    ? (60.0 / kMinimumHostBpm) *
                          static_cast<double>(std::min(timingSyncBeatsForIndex(config.time_sync().division_index()),
                                                       DelayNode::kMaximumSyncBeats))
                    : static_cast<double>(std::clamp(config.time(), 0.05f, 1.5f));
            const double delaySeconds = std::clamp(requestedDelaySeconds, 1.0 / safeSampleRate, maximumDelaySeconds);
            nodeTailSeconds = delaySeconds * feedbackTailRepeats(config.feedback());
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_REVERB:
          if (node.has_reverb_config() && node.reverb_config().focus_mix() > 0.0001f) {
            const auto& config = node.reverb_config();
            const double requestedPreDelaySeconds =
                config.has_pre_delay_sync() && config.pre_delay_sync().enabled()
                    ? (60.0 / kMinimumHostBpm) * static_cast<double>(std::min(
                                                     timingSyncBeatsForIndex(config.pre_delay_sync().division_index()),
                                                     ReverbNode::kMaximumPreDelaySyncBeats))
                    : static_cast<double>(std::clamp(config.pre_delay_ms(), 0.0f, 1000.0f)) / 1000.0;
            const double preDelaySeconds = std::clamp(requestedPreDelaySeconds, 0.0, maximumReverbPreDelaySeconds);
            const double decaySeconds = static_cast<double>(
                std::clamp(config.decay(), ReverbNode::kMinimumDecaySeconds, ReverbNode::kMaximumDecaySeconds));
            nodeTailSeconds = preDelaySeconds + decaySeconds * 6.0;
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_CHORUS:
          if (node.has_chorus_config()) {
            const auto& config = node.chorus_config();
            const double requestedDelaySeconds =
                config.has_voice_delay_sync() && config.voice_delay_sync().enabled()
                    ? (60.0 / kMinimumHostBpm) *
                          static_cast<double>(
                              std::min(timingSyncBeatsForIndex(config.voice_delay_sync().division_index()),
                                       ModulationNode::kMaximumDelaySyncBeats))
                    : static_cast<double>(std::clamp(config.voice_delay_ms(), 0.5f, 250.0f)) / 1000.0;
            const double delaySeconds =
                std::clamp(requestedDelaySeconds, 1.0 / safeSampleRate, maximumModulationDelaySeconds);
            nodeTailSeconds = delaySeconds * feedbackTailRepeats(config.feedback());
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_PHASER:
          break;
        case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER:
          nodeTailSeconds = ModulationNode::kRotaryMaximumDelaySeconds;
          break;
        case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT:
          if (node.has_pitch_drift_config() && node.pitch_drift_config().depth() > 0.0001f &&
              node.pitch_drift_config().range_cents() > 0.0001f) {
            nodeTailSeconds = ModulationNode::kPitchDriftMaximumDelaySeconds;
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_REVERSE:
          if (node.has_reverse_config()) {
            nodeTailSeconds = static_cast<double>(
                                  std::clamp(node.reverse_config().window_ms(), 50.0f, ReverseNode::kMaximumWindowMs)) /
                              1000.0;
          }
          break;
        case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
        case padpilot::fx::FX_NODE_TYPE_EQ:
        case padpilot::fx::FX_NODE_TYPE_COMPRESSOR:
        case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
        case padpilot::fx::FX_NODE_TYPE_NOISE_GATE:
        case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION:
        case padpilot::fx::FX_NODE_TYPE_BITCRUSHER:
        case padpilot::fx::FX_NODE_TYPE_EXCITER:
        case padpilot::fx::FX_NODE_TYPE_AUTO_PAN:
        case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER:
        case padpilot::fx::FX_NODE_TYPE_TREMOLO:
        case padpilot::fx::FX_NODE_TYPE_SATURATION:
        default:
          break;
      }
      // Serial effects can feed one tail into the next. Parallel chains end at
      // the longest chain, but tails inside one chain must be accumulated.
      chainTailSeconds += nodeTailSeconds;
    }
    tailSeconds = std::max(tailSeconds, chainTailSeconds);
  }
  return std::clamp(tailSeconds, 0.0, kMaximumFxTailLengthSeconds);
}

bool ConvolverModuleGraph::supportsRealtimeNodeParameter(padpilot::fx::FxNodeType type,
                                                         std::uint32_t parameterId) noexcept {
  switch (type) {
    case padpilot::fx::FX_NODE_TYPE_DELAY:
      return parameterId >= 1 && parameterId <= 10;
    case padpilot::fx::FX_NODE_TYPE_REVERB:
      return parameterId >= 1 && parameterId <= 9;
    case padpilot::fx::FX_NODE_TYPE_CHORUS:
      return parameterId >= 1 && parameterId <= 8;
    case padpilot::fx::FX_NODE_TYPE_EQ:
      return parameterId >= 1 && parameterId <= 8;
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR:
      return parameterId >= 1 && parameterId <= 5;
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_EXCITER:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_AUTO_PAN:
      return parameterId >= 1 && parameterId <= 5;
    case padpilot::fx::FX_NODE_TYPE_PHASER:
      return parameterId >= 1 && parameterId <= 5;
    case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT:
      return parameterId >= 1 && parameterId <= 5;
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER:
      return parameterId >= 1 && parameterId <= 3;
    case padpilot::fx::FX_NODE_TYPE_REVERSE:
      return parameterId >= 1 && parameterId <= 4;
    case padpilot::fx::FX_NODE_TYPE_TREMOLO:
      return parameterId >= 1 && parameterId <= 7;
    case padpilot::fx::FX_NODE_TYPE_SATURATION:
      return parameterId >= 1 && parameterId <= 5;
    case padpilot::fx::FX_NODE_TYPE_CONVOLVER:
      return parameterId == 2;
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      return false;
  }
}

void ConvolverModuleGraph::processBlock(juce::AudioBuffer<float>& buffer, double hostBpm) {
  if (!prepared_) {
    return;
  }

  if (samplesPerBlock_ <= 0) {
    return;
  }

  if (buffer.getNumSamples() <= 0) {
    return;
  }

  if (buffer.getNumSamples() > samplesPerBlock_) {
    // AudioBuffer keeps these stereo external channel pointers inline, so the
    // non-owning chunk views cannot allocate on the Audio Thread.
    const int chunkChannels = std::min(buffer.getNumChannels(), 2);
    if (chunkChannels <= 0) {
      return;
    }
    for (int startSample = 0; startSample < buffer.getNumSamples(); startSample += samplesPerBlock_) {
      const int chunkSamples = std::min(samplesPerBlock_, buffer.getNumSamples() - startSample);
      juce::AudioBuffer<float> chunk(buffer.getArrayOfWritePointers(), chunkChannels, startSample, chunkSamples);
      processBlock(chunk, hostBpm);
    }
    return;
  }

  const int activeSamples = buffer.getNumSamples();
  inputScratch_.setSize(numChannels_, activeSamples, false, false, true);
  outputScratch_.setSize(numChannels_, activeSamples, false, false, true);
  dryNodeScratch_.setSize(numChannels_, activeSamples, false, false, true);
  structuralDryScratch_.setSize(numChannels_, activeSamples, false, false, true);
  for (auto& scratch : chainScratch_) {
    scratch.setSize(numChannels_, activeSamples, false, false, true);
  }

  const bool profiling = profilingEnabled_.load(std::memory_order_relaxed);
  const auto blockStart = profiling ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point{};
  const auto telemetryMode = static_cast<TelemetryMode>(telemetryMode_.load(std::memory_order_relaxed));
  if (telemetryResetRequested_.exchange(false, std::memory_order_acq_rel)) {
    telemetryBlockCounter_ = 0;
    clearMeterSnapshots();
  }
  const bool telemetryEnabled = telemetryMode != TelemetryMode::off;
  const auto telemetryInterval = telemetryMode == TelemetryMode::diagnostics ? telemetryDiagnosticsIntervalBlocks_
                                                                             : telemetryVisibleIntervalBlocks_;
  ++telemetryBlockCounter_;
  const bool captureTelemetry = telemetryEnabled && telemetryBlockCounter_ >= telemetryInterval;
  if (captureTelemetry) {
    telemetryBlockCounter_ = 0;
    clearMeterSnapshots();
  }

  copyBuffer(structuralDryScratch_, buffer);
  copyBuffer(inputScratch_, buffer);
  inputScratch_.applyGain(inputGainLinear_);
  if (captureTelemetry) {
    const auto inputPeak = computeStereoPeakDb(inputScratch_);
    inputPeakDb_.store(inputPeak.mono, std::memory_order_relaxed);
    inputPeakDbLeft_.store(inputPeak.left, std::memory_order_relaxed);
    inputPeakDbRight_.store(inputPeak.right, std::memory_order_relaxed);
  }

  clearBuffer(outputScratch_);
  applyModulationRoutes(hostBpm, activeSamples);

  bool anySoloActive = false;
  int configuredChainCount = 0;
  for (const auto& chain : chainSlots_) {
    if (chain.active) {
      ++configuredChainCount;
    }
    if (chain.active && !chain.muted && chain.solo) {
      anySoloActive = true;
    }
  }

  float blockConvolverPeak = -120.0f;
  float blockDelayPeak = -120.0f;
  float blockReverbPeak = -120.0f;
  float blockModulationPeak = -120.0f;
  float blockEqPeak = -120.0f;
  int renderedChainCount = 0;

  for (int orderedIndex = 0; orderedIndex < kMaxChains; ++orderedIndex) {
    const int chainSlotIndex = orderedChainSlotIndices_[static_cast<std::size_t>(orderedIndex)];
    if (chainSlotIndex < 0 || chainSlotIndex >= kMaxChains) {
      continue;
    }

    auto& chain = chainSlots_[static_cast<std::size_t>(chainSlotIndex)];
    if (!chain.active || chain.muted || (anySoloActive && !chain.solo)) {
      continue;
    }

    copyBuffer(chainScratch_[static_cast<std::size_t>(chainSlotIndex)], inputScratch_);
    auto& chainBuffer = chainScratch_[static_cast<std::size_t>(chainSlotIndex)];
    StereoPeakDb chainInputPeak{};
    if (captureTelemetry) {
      chainInputPeak = computeStereoPeakDb(chainBuffer);
      setChainPeakSnapshot(chainSlotIndex, chainInputPeak.mono, chainInputPeak.left, chainInputPeak.right,
                           chainInputPeak.mono, chainInputPeak.left, chainInputPeak.right);
    }

    std::uint64_t chainElapsedNs = 0;
    int soloNodeIndex = -1;
    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      const auto& candidate = chain.nodes[static_cast<std::size_t>(nodeIndex)];
      if (candidate.active && candidate.solo) {
        soloNodeIndex = nodeIndex;
        break;
      }
    }

    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      auto& node = chain.nodes[static_cast<std::size_t>(nodeIndex)];
      if (!node.active) {
        continue;
      }

      const bool forceBypass = soloNodeIndex >= 0 && nodeIndex < soloNodeIndex;
      const bool forceMute = soloNodeIndex >= 0 && nodeIndex > soloNodeIndex;
      StereoPeakDb nodeInputPeak{};
      if (captureTelemetry) {
        nodeInputPeak = computeStereoPeakDb(chainBuffer);
        writeInputWaveformSnapshot(chainSlotIndex, nodeIndex, chainBuffer);
      }
      std::uint64_t elapsedNs = 0;
      const bool needsDryMix = !forceMute && !forceBypass && !node.bypassed && node.mix < 0.999f;
      if (needsDryMix) {
        copyBuffer(dryNodeScratch_, chainBuffer);
      }

      bool processed = false;
      if (node.muted || forceMute) {
        clearBuffer(chainBuffer);
      } else if (!node.bypassed && !forceBypass) {
        processed = processNode(node, chainBuffer, hostBpm, &elapsedNs);
        if (needsDryMix) {
          const int channels = std::min(chainBuffer.getNumChannels(), dryNodeScratch_.getNumChannels());
          const int samples = std::min(chainBuffer.getNumSamples(), dryNodeScratch_.getNumSamples());
          const float wet = std::clamp(node.mix, 0.0f, 1.0f);
          const float dry = 1.0f - wet;
          for (int channel = 0; channel < channels; ++channel) {
            float* write = chainBuffer.getWritePointer(channel);
            const float* read = dryNodeScratch_.getReadPointer(channel);
            for (int sample = 0; sample < samples; ++sample) {
              write[sample] = write[sample] * wet + read[sample] * dry;
            }
          }
        }
      }

      if (captureTelemetry) {
        const auto nodeOutputPeak = computeStereoPeakDb(chainBuffer);
        setNodePeakSnapshot(chainSlotIndex, nodeIndex, nodeInputPeak.mono, nodeInputPeak.left, nodeInputPeak.right,
                            nodeOutputPeak.mono, nodeOutputPeak.left, nodeOutputPeak.right);
        writeOutputWaveformSnapshot(chainSlotIndex, nodeIndex, chainBuffer);
        writeSignedWaveformSnapshot(chainSlotIndex, nodeIndex, chainBuffer);
        if (node.type == FXChainType::modulation && node.processors.modulation != nullptr) {
          setNodeMotionSnapshot(chainSlotIndex, nodeIndex, node.processors.modulation->getMotionValue());
        } else {
          setNodeMotionSnapshot(chainSlotIndex, nodeIndex, 0.0f);
        }

        if (processed) {
          if (node.type == FXChainType::convolver) {
            blockConvolverPeak = std::max(blockConvolverPeak, nodeOutputPeak.mono);
          } else if (node.type == FXChainType::delay) {
            blockDelayPeak = std::max(blockDelayPeak, nodeOutputPeak.mono);
          } else if (node.type == FXChainType::reverb) {
            blockReverbPeak = std::max(blockReverbPeak, nodeOutputPeak.mono);
          } else if (node.type == FXChainType::modulation) {
            blockModulationPeak = std::max(blockModulationPeak, nodeOutputPeak.mono);
          } else if (node.type == FXChainType::eq) {
            blockEqPeak = std::max(blockEqPeak, nodeOutputPeak.mono);
          }
        }
      }

      if (node.bypassed || forceBypass) {
        if (node.type == FXChainType::convolver) {
          convolverBypassedBlocks_.fetch_add(1, std::memory_order_relaxed);
        } else if (node.type == FXChainType::delay) {
          delayBypassedBlocks_.fetch_add(1, std::memory_order_relaxed);
        } else if (node.type == FXChainType::reverb) {
          reverbBypassedBlocks_.fetch_add(1, std::memory_order_relaxed);
        }
      }

      if (processed) {
        if (node.type == FXChainType::convolver) {
          if (profiling) {
            convolverNs_.fetch_add(elapsedNs, std::memory_order_relaxed);
          }
        } else if (node.type == FXChainType::delay) {
          if (profiling) {
            delayNs_.fetch_add(elapsedNs, std::memory_order_relaxed);
          }
        } else if (node.type == FXChainType::reverb) {
          if (profiling) {
            reverbNs_.fetch_add(elapsedNs, std::memory_order_relaxed);
          }
        } else if (node.type == FXChainType::modulation) {
          if (profiling) {
            modulationNs_.fetch_add(elapsedNs, std::memory_order_relaxed);
          }
        } else if (node.type == FXChainType::eq) {
          if (profiling) {
            eqNs_.fetch_add(elapsedNs, std::memory_order_relaxed);
          }
        }

        if (profiling) {
          chainElapsedNs += elapsedNs;
        }
      }
    }

    const float mix = std::clamp(chain.mix, 0.0f, 1.0f);
    const float dry = 1.0f - mix;
    const int channels = std::min(chainBuffer.getNumChannels(), inputScratch_.getNumChannels());
    const int samples = std::min(chainBuffer.getNumSamples(), inputScratch_.getNumSamples());
    for (int channel = 0; channel < channels; ++channel) {
      float* chainWrite = chainBuffer.getWritePointer(channel);
      const float* dryRead = inputScratch_.getReadPointer(channel);
      for (int sample = 0; sample < samples; ++sample) {
        chainWrite[sample] = (chainWrite[sample] * mix + dryRead[sample] * dry) * chain.gainLinear;
      }
    }

    if (captureTelemetry) {
      const auto chainOutputPeak = computeStereoPeakDb(chainBuffer);
      setChainPeakSnapshot(chainSlotIndex, chainInputPeak.mono, chainInputPeak.left, chainInputPeak.right,
                           chainOutputPeak.mono, chainOutputPeak.left, chainOutputPeak.right);
    }
    if (profiling) {
      chainTotalNs_[static_cast<std::size_t>(chainSlotIndex)].fetch_add(chainElapsedNs, std::memory_order_relaxed);
    }
    addBuffer(outputScratch_, chainBuffer);
    ++renderedChainCount;
  }

  if (configuredChainCount == 0) {
    copyBuffer(outputScratch_, inputScratch_);
  } else if (renderedChainCount > 1) {
    outputScratch_.applyGain(1.0f / static_cast<float>(renderedChainCount));
  }

  if (profiling) {
    std::uint64_t preDelayNs = 0;
    std::uint64_t coreNs = 0;
    std::uint64_t mixNs = 0;
    for (const auto& chain : chainSlots_) {
      for (const auto& node : chain.nodes) {
        if (!node.active || node.type != FXChainType::reverb || node.processors.reverb == nullptr) {
          continue;
        }
        const auto timing = node.processors.reverb->getTimingSnapshot();
        preDelayNs += timing.preDelayNs;
        coreNs += timing.coreNs;
        mixNs += timing.mixNs;
      }
    }
    reverbPreDelayNs_.store(preDelayNs, std::memory_order_relaxed);
    reverbCoreNs_.store(coreNs, std::memory_order_relaxed);
    reverbMixNs_.store(mixNs, std::memory_order_relaxed);
  }

  const auto gainStart = profiling ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point{};
  const float wetMix = std::clamp(masterWetDry_, 0.0f, 1.0f);
  const float dryMix = 1.0f - wetMix;
  const int wetDryChannels = std::min(outputScratch_.getNumChannels(), inputScratch_.getNumChannels());
  const int wetDrySamples = std::min(outputScratch_.getNumSamples(), inputScratch_.getNumSamples());
  for (int channel = 0; channel < wetDryChannels; ++channel) {
    float* wetWrite = outputScratch_.getWritePointer(channel);
    const float* dryRead = inputScratch_.getReadPointer(channel);
    for (int sample = 0; sample < wetDrySamples; ++sample) {
      wetWrite[sample] = wetWrite[sample] * wetMix + dryRead[sample] * dryMix;
    }
  }
  outputScratch_.applyGain(outputGainLinear_);
  const auto structuralTarget = structuralBypassRequested_.load(std::memory_order_acquire) ? 0.0f : 1.0f;
  const int structuralChannels = std::min(outputScratch_.getNumChannels(), structuralDryScratch_.getNumChannels());
  const int structuralSamples = std::min(outputScratch_.getNumSamples(), structuralDryScratch_.getNumSamples());
  for (int sample = 0; sample < structuralSamples; ++sample) {
    if (structuralWetGain_ < structuralTarget) {
      structuralWetGain_ = std::min(structuralTarget, structuralWetGain_ + structuralRampStep_);
    } else if (structuralWetGain_ > structuralTarget) {
      structuralWetGain_ = std::max(structuralTarget, structuralWetGain_ - structuralRampStep_);
    }
    const auto dryGain = 1.0f - structuralWetGain_;
    for (int channel = 0; channel < structuralChannels; ++channel) {
      const auto wet = outputScratch_.getSample(channel, sample);
      const auto dry = structuralDryScratch_.getSample(channel, sample);
      outputScratch_.setSample(channel, sample, wet * structuralWetGain_ + dry * dryGain);
    }
  }
  structuralBypassComplete_.store(structuralTarget == 0.0f && structuralWetGain_ <= 0.0f, std::memory_order_release);
  if (captureTelemetry) {
    const auto outputPeak = computeStereoPeakDb(outputScratch_);
    outputPeakDb_.store(outputPeak.mono, std::memory_order_relaxed);
    outputPeakDbLeft_.store(outputPeak.left, std::memory_order_relaxed);
    outputPeakDbRight_.store(outputPeak.right, std::memory_order_relaxed);
  }
  copyBuffer(buffer, outputScratch_);
  const auto gainEnd = profiling ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point{};

  if (captureTelemetry) {
    convolverPeakDb_.store(blockConvolverPeak, std::memory_order_relaxed);
    delayPeakDb_.store(blockDelayPeak, std::memory_order_relaxed);
    reverbPeakDb_.store(blockReverbPeak, std::memory_order_relaxed);
    modulationPeakDb_.store(blockModulationPeak, std::memory_order_relaxed);
    eqPeakDb_.store(blockEqPeak, std::memory_order_relaxed);
  }

  if (profiling) {
    gainNs_.fetch_add(
        static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(gainEnd - gainStart).count()),
        std::memory_order_relaxed);

    const auto blockEnd = std::chrono::steady_clock::now();
    totalNs_.fetch_add(
        static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(blockEnd - blockStart).count()),
        std::memory_order_relaxed);
    blocks_.fetch_add(1, std::memory_order_relaxed);
  }
}

bool ConvolverModuleGraph::applyCommand(const AudioCommand& command) {
  if (!std::isfinite(command.value) || !std::isfinite(command.valueB)) {
    return false;
  }
  switch (command.type) {
    case AudioCommandType::setFxChainEnabled: {
      if (auto* chain = findChainById(command.parameterId); chain != nullptr) {
        chain->active = command.boolValue;
        publishTopologySnapshot();
        return true;
      }
      return false;
    }
    case AudioCommandType::setFxChainType:
      return false;
    case AudioCommandType::setFxChainMix: {
      if (auto* chain = findChainById(command.parameterId); chain != nullptr) {
        chain->mix = std::clamp(command.value, 0.0f, 1.0f);
        return true;
      }
      return false;
    }
    case AudioCommandType::setFxChainGainDb: {
      if (auto* chain = findChainById(command.parameterId); chain != nullptr) {
        chain->gainLinear = std::pow(10.0f, std::clamp(command.value, -30.0f, 18.0f) / 20.0f);
        return true;
      }
      return false;
    }
    case AudioCommandType::setFxChainOrder: {
      const int fromIndex = findChainSlotIndexById(command.parameterId);
      if (fromIndex < 0) {
        return false;
      }
      const int destination = static_cast<int>(std::clamp(command.value, 0.0f, static_cast<float>(kMaxChains - 1)));
      int sourcePosition = -1;
      for (int index = 0; index < kMaxChains; ++index) {
        if (orderedChainSlotIndices_[static_cast<std::size_t>(index)] == fromIndex) {
          sourcePosition = index;
          break;
        }
      }
      if (sourcePosition < 0 || sourcePosition == destination) {
        return sourcePosition >= 0;
      }
      const int moved = orderedChainSlotIndices_[static_cast<std::size_t>(sourcePosition)];
      if (sourcePosition < destination) {
        for (int index = sourcePosition; index < destination; ++index) {
          orderedChainSlotIndices_[static_cast<std::size_t>(index)] =
              orderedChainSlotIndices_[static_cast<std::size_t>(index + 1)];
        }
      } else {
        for (int index = sourcePosition; index > destination; --index) {
          orderedChainSlotIndices_[static_cast<std::size_t>(index)] =
              orderedChainSlotIndices_[static_cast<std::size_t>(index - 1)];
        }
      }
      orderedChainSlotIndices_[static_cast<std::size_t>(destination)] = moved;
      return true;
    }
    case AudioCommandType::setFxChainMuted: {
      if (auto* chain = findChainById(command.parameterId); chain != nullptr) {
        chain->muted = command.boolValue;
        publishTopologySnapshot();
        return true;
      }
      return false;
    }
    case AudioCommandType::setFxChainSolo: {
      if (auto* chain = findChainById(command.parameterId); chain != nullptr) {
        chain->solo = command.boolValue;
        publishTopologySnapshot();
        return true;
      }
      return false;
    }
    case AudioCommandType::setFxNodeBypassed: {
      const auto chainId = decodeChainId(command.parameterId);
      const auto nodeId = decodeNodeId(command.parameterId);
      if (auto* chain = findChainById(chainId); chain != nullptr) {
        if (auto* node = findNodeById(*chain, nodeId); node != nullptr) {
          node->bypassed = command.boolValue;
          publishTopologySnapshot();
          return true;
        }
      }
      return false;
    }
    case AudioCommandType::setFxNodeMuted: {
      const auto chainId = decodeChainId(command.parameterId);
      const auto nodeId = decodeNodeId(command.parameterId);
      if (auto* chain = findChainById(chainId); chain != nullptr) {
        if (auto* node = findNodeById(*chain, nodeId); node != nullptr) {
          node->muted = command.boolValue;
          publishTopologySnapshot();
          return true;
        }
      }
      return false;
    }
    case AudioCommandType::setFxNodeSolo: {
      const auto chainId = decodeChainId(command.parameterId);
      const auto nodeId = decodeNodeId(command.parameterId);
      if (auto* chain = findChainById(chainId); chain != nullptr) {
        if (auto* node = findNodeById(*chain, nodeId); node != nullptr) {
          node->solo = command.boolValue;
          publishTopologySnapshot();
          return true;
        }
      }
      return false;
    }
    case AudioCommandType::setFxNodeMix: {
      const auto chainId = decodeChainId(command.parameterId);
      const auto nodeId = decodeNodeId(command.parameterId);
      if (auto* chain = findChainById(chainId); chain != nullptr) {
        if (auto* node = findNodeById(*chain, nodeId); node != nullptr) {
          node->mix = std::clamp(command.value, 0.0f, 1.0f);
          return true;
        }
      }
      return false;
    }
    case AudioCommandType::setFxNodeParamFloat: {
      const auto chainId = decodeChainId(command.parameterId);
      const auto nodeId = decodeNodeId(command.parameterId);
      const auto parameterId = decodeNodeParameterId(command.parameterId);
      if (auto* chain = findChainById(chainId); chain != nullptr) {
        if (auto* node = findNodeById(*chain, nodeId); node != nullptr) {
          const bool applied = applyRealtimeNodeParameter(*node, parameterId, command.value);
          if (applied) updateModulationRouteBase(chainId, nodeId, parameterId, command.value);
          return applied;
        }
      }
      return false;
    }
    case AudioCommandType::setMasterInputGainDb:
      inputGainLinear_ = std::pow(10.0f, std::clamp(command.value, -18.0f, 18.0f) / 20.0f);
      return true;
    case AudioCommandType::setMasterWetDry:
      masterWetDry_ = std::clamp(command.value, 0.0f, 1.0f);
      return true;
    case AudioCommandType::setOutputGainDb:
      outputGainLinear_ = std::pow(10.0f, std::clamp(command.value, -18.0f, 18.0f) / 20.0f);
      return true;
    case AudioCommandType::setConvolverWetDry: {
      auto* node = findFirstNodeOfType(FXChainType::convolver);
      if (node == nullptr || node->processors.convolver == nullptr) {
        return false;
      }
      node->processors.convolver->setWetDry(command.value, command.valueB);
      return true;
    }
    case AudioCommandType::setDelayWetDry:
    case AudioCommandType::setDelayTimeBeats:
    case AudioCommandType::setDelayTimeHz:
    case AudioCommandType::setDelaySyncEnabled:
    case AudioCommandType::setDelayFeedback:
    case AudioCommandType::setDelayLowCutHz:
    case AudioCommandType::setDelayHighCutHz:
    case AudioCommandType::setDelayWidth: {
      auto* node = findFirstNodeOfType(FXChainType::delay);
      if (node == nullptr || node->processors.delay == nullptr) {
        return false;
      }
      switch (command.type) {
        case AudioCommandType::setDelayWetDry:
          node->processors.delay->setWetDry(command.value, command.valueB);
          break;
        case AudioCommandType::setDelayTimeBeats:
          node->processors.delay->setTimeBeats(command.value);
          break;
        case AudioCommandType::setDelayTimeHz:
          node->processors.delay->setTimeHz(command.value);
          break;
        case AudioCommandType::setDelaySyncEnabled:
          node->processors.delay->setSyncEnabled(command.boolValue);
          break;
        case AudioCommandType::setDelayFeedback:
          node->processors.delay->setFeedback(command.value);
          break;
        case AudioCommandType::setDelayLowCutHz:
          node->processors.delay->setLowCutHz(command.value);
          break;
        case AudioCommandType::setDelayHighCutHz:
          node->processors.delay->setHighCutHz(command.value);
          break;
        case AudioCommandType::setDelayWidth:
          node->processors.delay->setWidth(command.value);
          break;
        default:
          break;
      }
      return true;
    }
    case AudioCommandType::setReverbWetDry:
    case AudioCommandType::setReverbPreDelayMs:
    case AudioCommandType::setReverbDecaySeconds:
    case AudioCommandType::setReverbSize:
    case AudioCommandType::setReverbDampening:
    case AudioCommandType::setReverbWidth: {
      auto* node = findFirstNodeOfType(FXChainType::reverb);
      if (node == nullptr || node->processors.reverb == nullptr) {
        return false;
      }
      switch (command.type) {
        case AudioCommandType::setReverbWetDry:
          node->processors.reverb->setWetDry(command.value, command.valueB);
          break;
        case AudioCommandType::setReverbPreDelayMs:
          node->processors.reverb->setPreDelayMs(command.value);
          break;
        case AudioCommandType::setReverbDecaySeconds:
          node->processors.reverb->setDecaySeconds(command.value);
          break;
        case AudioCommandType::setReverbSize:
          node->processors.reverb->setSize(command.value);
          break;
        case AudioCommandType::setReverbDampening:
          node->processors.reverb->setDampening(command.value);
          break;
        case AudioCommandType::setReverbWidth:
          node->processors.reverb->setWidth(command.value);
          break;
        default:
          break;
      }
      return true;
    }
    case AudioCommandType::setModulationRateHz:
    case AudioCommandType::setModulationDepth:
    case AudioCommandType::setModulationFeedback:
    case AudioCommandType::setModulationMix:
    case AudioCommandType::setModulationStereoPhase:
    case AudioCommandType::setModulationMode: {
      auto* node = findFirstNodeOfType(FXChainType::modulation);
      if (node == nullptr || node->processors.modulation == nullptr) {
        return false;
      }
      switch (command.type) {
        case AudioCommandType::setModulationRateHz:
          node->processors.modulation->setRateHz(command.value);
          break;
        case AudioCommandType::setModulationDepth:
          node->processors.modulation->setDepth(command.value);
          break;
        case AudioCommandType::setModulationFeedback:
          node->processors.modulation->setFeedback(command.value);
          break;
        case AudioCommandType::setModulationMix:
          node->processors.modulation->setMix(command.value);
          break;
        case AudioCommandType::setModulationStereoPhase:
          node->processors.modulation->setStereoPhase(command.value);
          break;
        case AudioCommandType::setModulationMode:
          node->processors.modulation->setMode(
              static_cast<ModulationNode::Mode>(static_cast<int>(std::lround(std::clamp(command.value, 0.0f, 2.0f)))));
          break;
        default:
          break;
      }
      return true;
    }
    case AudioCommandType::setEqBandCount:
    case AudioCommandType::setEqBandType:
    case AudioCommandType::setEqBandFrequency:
    case AudioCommandType::setEqBandGainDb:
    case AudioCommandType::setEqBandQ:
    case AudioCommandType::setEqBandEnabled: {
      auto* node = findFirstNodeOfType(FXChainType::eq);
      if (node == nullptr || node->processors.eq == nullptr) {
        return false;
      }
      if (command.parameterId >= static_cast<std::uint32_t>(ParametricEqNode::kMaxBands)) {
        return false;
      }
      const auto bandIndex = static_cast<int>(command.parameterId);
      switch (command.type) {
        case AudioCommandType::setEqBandCount:
          node->processors.eq->setBandCount(static_cast<int>(
              std::lround(std::clamp(command.value, 0.0f, static_cast<float>(ParametricEqNode::kMaxBands)))));
          break;
        case AudioCommandType::setEqBandType:
          node->processors.eq->setBandType(bandIndex, static_cast<ParametricEqNode::BandType>(static_cast<int>(
                                                          std::lround(std::clamp(command.value, 0.0f, 5.0f)))));
          break;
        case AudioCommandType::setEqBandFrequency:
          node->processors.eq->setBandFrequency(bandIndex, command.value);
          break;
        case AudioCommandType::setEqBandGainDb:
          node->processors.eq->setBandGainDb(bandIndex, command.value);
          break;
        case AudioCommandType::setEqBandQ:
          node->processors.eq->setBandQ(bandIndex, command.value);
          break;
        case AudioCommandType::setEqBandEnabled:
          node->processors.eq->setBandEnabled(bandIndex, command.boolValue);
          break;
        default:
          break;
      }
      return true;
    }
    case AudioCommandType::setParameter:
    default:
      return false;
  }
}

ConvolverModuleGraph::TimingSnapshot ConvolverModuleGraph::getTimingSnapshot() const noexcept {
  TimingSnapshot snapshot{};
  snapshot.blocks = blocks_.load(std::memory_order_relaxed);
  snapshot.totalNs = totalNs_.load(std::memory_order_relaxed);
  snapshot.convolverNs = convolverNs_.load(std::memory_order_relaxed);
  snapshot.delayNs = delayNs_.load(std::memory_order_relaxed);
  snapshot.reverbNs = reverbNs_.load(std::memory_order_relaxed);
  snapshot.reverbPreDelayNs = reverbPreDelayNs_.load(std::memory_order_relaxed);
  snapshot.reverbCoreNs = reverbCoreNs_.load(std::memory_order_relaxed);
  snapshot.reverbMixNs = reverbMixNs_.load(std::memory_order_relaxed);
  snapshot.modulationNs = modulationNs_.load(std::memory_order_relaxed);
  snapshot.eqNs = eqNs_.load(std::memory_order_relaxed);
  snapshot.gainNs = gainNs_.load(std::memory_order_relaxed);
  snapshot.convolverBypassedBlocks = convolverBypassedBlocks_.load(std::memory_order_relaxed);
  snapshot.delayBypassedBlocks = delayBypassedBlocks_.load(std::memory_order_relaxed);
  snapshot.reverbBypassedBlocks = reverbBypassedBlocks_.load(std::memory_order_relaxed);
  snapshot.inputPeakDb = inputPeakDb_.load(std::memory_order_relaxed);
  snapshot.inputPeakDbLeft = inputPeakDbLeft_.load(std::memory_order_relaxed);
  snapshot.inputPeakDbRight = inputPeakDbRight_.load(std::memory_order_relaxed);
  snapshot.convolverPeakDb = convolverPeakDb_.load(std::memory_order_relaxed);
  snapshot.delayPeakDb = delayPeakDb_.load(std::memory_order_relaxed);
  snapshot.reverbPeakDb = reverbPeakDb_.load(std::memory_order_relaxed);
  snapshot.modulationPeakDb = modulationPeakDb_.load(std::memory_order_relaxed);
  snapshot.eqPeakDb = eqPeakDb_.load(std::memory_order_relaxed);
  snapshot.outputPeakDb = outputPeakDb_.load(std::memory_order_relaxed);
  snapshot.outputPeakDbLeft = outputPeakDbLeft_.load(std::memory_order_relaxed);
  snapshot.outputPeakDbRight = outputPeakDbRight_.load(std::memory_order_relaxed);

  for (int chainIndex = 0; chainIndex < kMaxChains; ++chainIndex) {
    auto& chainSnapshot = snapshot.chains[static_cast<std::size_t>(chainIndex)];
    chainSnapshot.active = snapshotChainActive_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.chainId = snapshotChainId_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.muted = snapshotChainMuted_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.solo = snapshotChainSolo_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.totalNs = chainTotalNs_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.inputPeakDb = chainInputPeakDb_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.inputPeakDbLeft =
        chainInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.inputPeakDbRight =
        chainInputPeakDbRight_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.outputPeakDb =
        chainOutputPeakDb_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.outputPeakDbLeft =
        chainOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    chainSnapshot.outputPeakDbRight =
        chainOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)].load(std::memory_order_relaxed);
    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      const auto nodeActive =
          snapshotNodeActive_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      const auto nodeBypassed =
          snapshotNodeBypassed_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      if (nodeActive && !nodeBypassed) {
        ++chainSnapshot.activeNodeCount;
      }
      auto& nodeSnapshot = chainSnapshot.nodes[static_cast<std::size_t>(nodeIndex)];
      nodeSnapshot.active = nodeActive;
      nodeSnapshot.chainId = chainSnapshot.chainId;
      nodeSnapshot.nodeId =
          snapshotNodeId_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.inputPeakDb =
          nodeInputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.inputPeakDbLeft =
          nodeInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.inputPeakDbRight =
          nodeInputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.outputPeakDb =
          nodeOutputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.outputPeakDbLeft =
          nodeOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      nodeSnapshot.outputPeakDbRight =
          nodeOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
      for (int bin = 0; bin < kWaveformBins; ++bin) {
        nodeSnapshot.inputWaveform[static_cast<std::size_t>(bin)] =
            nodeInputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                              [static_cast<std::size_t>(bin)]
                                  .load(std::memory_order_relaxed);
        nodeSnapshot.outputWaveform[static_cast<std::size_t>(bin)] =
            nodeOutputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                               [static_cast<std::size_t>(bin)]
                                   .load(std::memory_order_relaxed);
        nodeSnapshot.leftSignedWaveform[static_cast<std::size_t>(bin)] =
            nodeLeftSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                                   [static_cast<std::size_t>(bin)]
                                       .load(std::memory_order_relaxed);
        nodeSnapshot.rightSignedWaveform[static_cast<std::size_t>(bin)] =
            nodeRightSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                                    [static_cast<std::size_t>(bin)]
                                        .load(std::memory_order_relaxed);
      }
      nodeSnapshot.motionValue =
          nodeMotionValue_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].load(
              std::memory_order_relaxed);
    }
  }
  return snapshot;
}

void ConvolverModuleGraph::setProfilingEnabled(bool enabled) noexcept {
  profilingEnabled_.store(enabled, std::memory_order_relaxed);
}

void ConvolverModuleGraph::setTelemetryMode(TelemetryMode mode) noexcept {
  telemetryMode_.store(static_cast<int>(mode), std::memory_order_relaxed);
  telemetryResetRequested_.store(true, std::memory_order_release);
}

bool ConvolverModuleGraph::isWetPathBypassed() const noexcept {
  for (const auto& chain : chainSlots_) {
    if (!chain.active || chain.muted) {
      continue;
    }
    for (const auto& node : chain.nodes) {
      if (node.active && !node.bypassed) {
        return false;
      }
    }
  }
  return true;
}

void ConvolverModuleGraph::requestStructuralBypass(bool bypassed) noexcept {
  structuralBypassRequested_.store(bypassed, std::memory_order_release);
  if (!bypassed) {
    structuralBypassComplete_.store(false, std::memory_order_release);
  }
}

bool ConvolverModuleGraph::isStructuralBypassComplete() const noexcept {
  return structuralBypassComplete_.load(std::memory_order_acquire);
}

void ConvolverModuleGraph::clearMeterSnapshots() {
  for (int chainIndex = 0; chainIndex < kMaxChains; ++chainIndex) {
    chainInputPeakDb_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainInputPeakDbRight_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDb_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    chainOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)].store(-120.0f, std::memory_order_relaxed);
    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      nodeInputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeInputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeInputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDb_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDbLeft_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeOutputPeakDbRight_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          -120.0f, std::memory_order_relaxed);
      nodeMotionValue_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          0.0f, std::memory_order_relaxed);
      for (int bin = 0; bin < kWaveformBins; ++bin) {
        nodeInputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                          [static_cast<std::size_t>(bin)]
                              .store(0.0f, std::memory_order_relaxed);
        nodeOutputWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                           [static_cast<std::size_t>(bin)]
                               .store(0.0f, std::memory_order_relaxed);
        nodeLeftSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                               [static_cast<std::size_t>(bin)]
                                   .store(0.0f, std::memory_order_relaxed);
        nodeRightSignedWaveform_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)]
                                [static_cast<std::size_t>(bin)]
                                    .store(0.0f, std::memory_order_relaxed);
      }
    }
  }

  inputPeakDb_.store(-120.0f, std::memory_order_relaxed);
  inputPeakDbLeft_.store(-120.0f, std::memory_order_relaxed);
  inputPeakDbRight_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDb_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDbLeft_.store(-120.0f, std::memory_order_relaxed);
  outputPeakDbRight_.store(-120.0f, std::memory_order_relaxed);
}

void ConvolverModuleGraph::resetChainSlot(ChainSlot& chain, int slotIndex) {
  chain.id = static_cast<std::uint32_t>(slotIndex + 1);
  chain.order = static_cast<std::uint32_t>(slotIndex);
  chain.configured = false;
  chain.active = false;
  chain.muted = false;
  chain.solo = false;
  chain.mix = 1.0f;
  chain.gainLinear = 1.0f;
  for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
    auto& node = chain.nodes[static_cast<std::size_t>(nodeIndex)];
    node.id = static_cast<std::uint32_t>(nodeIndex + 1);
    node.order = static_cast<std::uint32_t>(nodeIndex);
    node.active = false;
    node.bypassed = false;
    node.muted = false;
    node.solo = false;
    node.mix = 1.0f;
    node.type = FXChainType::delay;
    node.sourceState.Clear();
    node.sourceState.set_type(padpilot::fx::FX_NODE_TYPE_UNSPECIFIED);
    node.envelope = 0.0f;
    node.phase = 0.0f;
    node.holdCounter = 0;
    node.randomState = 0x12345678U + static_cast<std::uint32_t>(nodeIndex * 977U + slotIndex * 131U);
    node.heldSample = {};
    node.lowState = {};
    node.auxState = {};
    node.realtimeParameterValues.fill(0.0f);
    node.realtimeParameterPresent.fill(false);
    node.exciterSmoothing = 0.08f;
  }
}

void ConvolverModuleGraph::ensureNodePrepared(NodeSlot& node) {
  if (!prepared_) {
    return;
  }

  juce::dsp::ProcessSpec spec;
  spec.sampleRate = sampleRate_;
  spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock_);
  spec.numChannels = static_cast<juce::uint32>(std::max(1, numChannels_));

  switch (node.type) {
    case FXChainType::convolver:
      if (node.processors.convolver == nullptr) {
        node.processors.convolver = std::make_unique<ConvolverNode>();
        node.processors.convolver->prepare(spec);
      }
      break;
    case FXChainType::delay:
      if (node.processors.delay == nullptr) {
        node.processors.delay = std::make_unique<DelayNode>();
        node.processors.delay->prepare(spec);
      }
      break;
    case FXChainType::reverb:
      if (node.processors.reverb == nullptr) {
        node.processors.reverb = std::make_unique<ReverbNode>();
        node.processors.reverb->prepare(spec);
      }
      break;
    case FXChainType::modulation:
      if (node.processors.modulation == nullptr) {
        node.processors.modulation = std::make_unique<ModulationNode>();
        node.processors.modulation->prepare(spec);
      }
      break;
    case FXChainType::eq:
      if (node.processors.eq == nullptr) {
        node.processors.eq = std::make_unique<ParametricEqNode>();
        node.processors.eq->prepare(spec);
      }
      break;
    case FXChainType::reverse:
      if (node.processors.reverse == nullptr) {
        node.processors.reverse = std::make_unique<ReverseNode>();
        node.processors.reverse->prepare(spec);
      }
      break;
    case FXChainType::passthrough:
      break;
  }
}

void ConvolverModuleGraph::configureNodeDefaults(NodeSlot& node) {
  ensureNodePrepared(node);
  switch (node.type) {
    case FXChainType::convolver:
      if (node.processors.convolver != nullptr) {
        node.processors.convolver->setWetDry(0.8f, 0.2f);
      }
      break;
    case FXChainType::delay:
      if (node.processors.delay != nullptr) {
        node.processors.delay->setWetDry(1.0f, 0.0f);
        node.processors.delay->setSyncEnabled(false);
      }
      break;
    case FXChainType::reverb:
      if (node.processors.reverb != nullptr) {
        node.processors.reverb->setWetDry(1.0f, 0.0f);
        node.processors.reverb->setPreDelaySyncEnabled(false);
        node.processors.reverb->setModulationSpeedSyncEnabled(false);
        node.processors.reverb->setModulationDepth(0.0f);
      }
      break;
    case FXChainType::modulation:
      if (node.processors.modulation != nullptr) {
        node.processors.modulation->setMix(0.3f);
        node.processors.modulation->setRateSyncEnabled(false);
        node.processors.modulation->setBaseDelaySyncEnabled(false);
      }
      break;
    case FXChainType::eq:
      if (node.processors.eq != nullptr) {
        node.processors.eq->setMix(1.0f);
        node.processors.eq->setOutputGainDb(0.0f);
        node.processors.eq->setBandCount(1);
        node.processors.eq->setBandEnabled(0, true);
      }
      break;
    case FXChainType::reverse:
      break;
    case FXChainType::passthrough:
      break;
  }
}

void ConvolverModuleGraph::applyTypedNodeState(NodeSlot& node, const padpilot::fx::NodeState& sourceNode) {
  ensureNodePrepared(node);

  switch (sourceNode.type()) {
    case padpilot::fx::FX_NODE_TYPE_CONVOLVER:
      if (sourceNode.has_convolver_config() && node.processors.convolver != nullptr) {
        const auto& config = sourceNode.convolver_config();
        const float wet = clampUnitInterval(config.blend());
        node.processors.convolver->setWetDry(wet, 1.0f - wet);
        if (!config.ir_source_path().empty()) {
          node.processors.convolver->loadImpulseResponse(config.ir_source_path());
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_DELAY:
      if (sourceNode.has_delay_config() && node.processors.delay != nullptr) {
        const auto& config = sourceNode.delay_config();
        const float wet = clampUnitInterval(config.focus_mix());
        const bool syncEnabled = config.has_time_sync() && config.time_sync().enabled();
        node.processors.delay->setSyncEnabled(syncEnabled);
        if (syncEnabled) {
          node.processors.delay->setTimeBeats(timingSyncBeatsForIndex(config.time_sync().division_index()));
        } else {
          const float timeSeconds = std::max(config.time(), 0.05f);
          node.processors.delay->setTimeHz(1.0f / timeSeconds);
        }
        node.processors.delay->setFeedback(config.feedback());
        node.processors.delay->setLowCutHz(config.low_cut_hz() > 0.0f ? config.low_cut_hz() : 110.0f);
        node.processors.delay->setHighCutHz(config.high_cut_hz() > 0.0f ? config.high_cut_hz() : 6800.0f);
        node.processors.delay->setWidth(config.width() > 0.0f ? config.width() : 1.0f);
        node.processors.delay->setSaturation(config.saturation());
        const auto character = juce::String(config.character()).toLowerCase();
        node.processors.delay->setCharacter(character == "tape"      ? 1
                                            : character == "bbd"     ? 2
                                            : character == "digital" ? 3
                                                                     : 0);
        node.processors.delay->setWetDry(wet, 1.0f - wet);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_REVERB:
      if (sourceNode.has_reverb_config() && node.processors.reverb != nullptr) {
        const auto& config = sourceNode.reverb_config();
        const auto mode = juce::String(config.mode()).toLowerCase();
        const float wet = clampUnitInterval(config.focus_mix());
        float width = 0.55f + clampUnitInterval(config.modulation_depth()) * 0.35f;
        if (mode == "room") {
          width = 0.45f;
        } else if (mode == "plate") {
          width = 0.8f;
        } else if (mode == "shimmer") {
          width = 0.9f;
        }
        node.processors.reverb->setWetDry(wet, 1.0f - wet);
        node.processors.reverb->setDecaySeconds(config.decay());
        node.processors.reverb->setSize(config.size());
        node.processors.reverb->setDampening(config.damping());
        node.processors.reverb->setPreDelayMs(config.pre_delay_ms());
        node.processors.reverb->setPreDelaySyncEnabled(config.has_pre_delay_sync() &&
                                                       config.pre_delay_sync().enabled());
        if (config.has_pre_delay_sync()) {
          node.processors.reverb->setPreDelayBeats(timingSyncBeatsForIndex(config.pre_delay_sync().division_index()));
        }
        node.processors.reverb->setWidth(width);
        node.processors.reverb->setModulationSpeedHz(config.modulation_speed_hz());
        node.processors.reverb->setModulationSpeedSyncEnabled(config.has_modulation_speed_sync() &&
                                                              config.modulation_speed_sync().enabled());
        if (config.has_modulation_speed_sync()) {
          node.processors.reverb->setModulationSpeedBeats(
              timingSyncBeatsForIndex(config.modulation_speed_sync().division_index()));
        }
        node.processors.reverb->setModulationDepth(config.modulation_depth());
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_EQ:
      if (sourceNode.has_eq_config() && node.processors.eq != nullptr) {
        const auto& config = sourceNode.eq_config();
        auto* eq = node.processors.eq.get();
        eq->setMix(1.0f);

        int bandIndex = 0;
        eq->setBandEnabled(bandIndex, true);
        eq->setBandType(bandIndex, ParametricEqNode::BandType::lowShelf);
        eq->setBandFrequency(bandIndex,
                             config.low_shelf_frequency_hz() > 0.0f ? config.low_shelf_frequency_hz() : 120.0f);
        eq->setBandGainDb(bandIndex, config.low_shelf_gain_db());
        eq->setBandQ(bandIndex, 0.707f);
        ++bandIndex;

        const int maxBandsFromConfig = std::min(config.bands_size(), ParametricEqNode::kMaxBands - 2);
        for (int index = 0; index < maxBandsFromConfig; ++index) {
          const auto& band = config.bands(index);
          eq->setBandEnabled(bandIndex, band.enabled());
          eq->setBandType(bandIndex, eqBandTypeFromString(band.type(), band.frequency_hz()));
          eq->setBandFrequency(bandIndex, band.frequency_hz());
          eq->setBandGainDb(bandIndex, band.gain_db());
          eq->setBandQ(bandIndex, band.q());
          ++bandIndex;
        }

        eq->setBandEnabled(bandIndex, true);
        eq->setBandType(bandIndex, ParametricEqNode::BandType::highShelf);
        eq->setBandFrequency(bandIndex,
                             config.high_shelf_frequency_hz() > 0.0f ? config.high_shelf_frequency_hz() : 8000.0f);
        eq->setBandGainDb(bandIndex, config.high_shelf_gain_db());
        eq->setBandQ(bandIndex, 0.707f);
        ++bandIndex;

        eq->setBandCount(bandIndex);
        eq->setOutputGainDb(config.master_gain_db());
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_CHORUS:
      if (sourceNode.has_chorus_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.chorus_config();
        node.processors.modulation->setMode(ModulationNode::Mode::chorus);
        node.processors.modulation->setRateSyncEnabled(config.has_rate_sync() && config.rate_sync().enabled());
        if (config.has_rate_sync()) {
          node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(config.rate_sync().division_index()));
        }
        node.processors.modulation->setRateHz(config.rate_hz());
        node.processors.modulation->setBaseDelaySyncEnabled(config.has_voice_delay_sync() &&
                                                            config.voice_delay_sync().enabled());
        if (config.has_voice_delay_sync()) {
          node.processors.modulation->setBaseDelayBeats(
              timingSyncBeatsForIndex(config.voice_delay_sync().division_index()));
        }
        node.processors.modulation->setBaseDelayMs(config.voice_delay_ms());
        node.processors.modulation->setDepth(config.depth());
        node.processors.modulation->setFeedback(config.feedback());
        node.processors.modulation->setMix(0.2f + clampUnitInterval(config.width()) * 0.45f);
        node.processors.modulation->setStereoPhase(clampUnitInterval(config.width()));
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_AUTO_PAN:
      if (sourceNode.has_auto_pan_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.auto_pan_config();
        node.processors.modulation->setMode(ModulationNode::Mode::autoPan);
        node.processors.modulation->setRateSyncEnabled(config.has_rate_sync() && config.rate_sync().enabled());
        if (config.has_rate_sync()) {
          node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(config.rate_sync().division_index()));
        }
        node.processors.modulation->setRateHz(config.rate_hz());
        node.processors.modulation->setAutoPanAmount(config.amount());
        node.processors.modulation->setAutoPanPhaseOffset(config.phase_offset());
        node.processors.modulation->setAutoPanSmoothing(config.smoothing());
        const auto shape = juce::String(config.lfo_shape()).toLowerCase();
        if (shape == "tri") {
          node.processors.modulation->setAutoPanShape(ModulationNode::LfoShape::triangle);
        } else if (shape == "square") {
          node.processors.modulation->setAutoPanShape(ModulationNode::LfoShape::square);
        } else if (shape == "random") {
          node.processors.modulation->setAutoPanShape(ModulationNode::LfoShape::random);
        } else {
          node.processors.modulation->setAutoPanShape(ModulationNode::LfoShape::sine);
        }
        node.processors.modulation->setFeedback(0.0f);
        node.processors.modulation->setMix(1.0f);
        node.processors.modulation->setStereoPhase(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_PHASER:
      if (sourceNode.has_phaser_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.phaser_config();
        node.processors.modulation->setMode(ModulationNode::Mode::phaser);
        node.processors.modulation->setRateHz(config.speed_hz());
        node.processors.modulation->setRateSyncEnabled(config.has_speed_sync() && config.speed_sync().enabled());
        if (config.has_speed_sync()) {
          node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(config.speed_sync().division_index()));
        }
        node.processors.modulation->setPhaserCenterFrequencyHz(config.center_frequency_hz());
        node.processors.modulation->setPhaserStages(static_cast<int>(std::min<std::uint32_t>(config.stages(), 12U)));
        node.processors.modulation->setPhaserResonance(config.resonance());
        node.processors.modulation->setStereoPhase(config.stereo_phase_offset());
        node.processors.modulation->setMix(1.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER:
      if (sourceNode.has_rotary_speaker_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.rotary_speaker_config();
        node.processors.modulation->setMode(ModulationNode::Mode::rotarySpeaker);
        node.processors.modulation->setRotaryFast(config.fast());
        node.processors.modulation->setRotaryDrive(config.drive());
        node.processors.modulation->setRotaryHornDrumBalance(config.horn_drum_balance());
        node.processors.modulation->setRotaryMicDistance(config.mic_distance());
        node.processors.modulation->setRotaryAcceleration(config.acceleration());
        node.processors.modulation->setMix(1.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT:
      if (sourceNode.has_pitch_drift_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.pitch_drift_config();
        const auto shape = juce::String(config.drift_shape()).toLowerCase();
        node.processors.modulation->setMode(ModulationNode::Mode::pitchDrift);
        node.processors.modulation->setDepth(config.depth());
        node.processors.modulation->setRateHz(config.rate_hz());
        node.processors.modulation->setRateSyncEnabled(config.has_rate_sync() && config.rate_sync().enabled());
        if (config.has_rate_sync()) {
          node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(config.rate_sync().division_index()));
        }
        node.processors.modulation->setPitchDriftShape((shape == "random" || shape == "analog")
                                                           ? ModulationNode::LfoShape::random
                                                       : shape == "triangle" ? ModulationNode::LfoShape::triangle
                                                                             : ModulationNode::LfoShape::sine);
        node.processors.modulation->setPitchDriftStereoOffset(config.stereo_offset());
        node.processors.modulation->setPitchDriftRangeCents(config.range_cents());
        node.processors.modulation->setMix(1.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_TREMOLO:
      if (sourceNode.has_tremolo_config() && node.processors.modulation != nullptr) {
        const auto& config = sourceNode.tremolo_config();
        const auto shape = juce::String(config.lfo_shape()).toLowerCase();
        node.processors.modulation->setMode(ModulationNode::Mode::tremolo);
        node.processors.modulation->setRateHz(config.rate_hz());
        node.processors.modulation->setRateSyncEnabled(config.has_rate_sync() && config.rate_sync().enabled());
        if (config.has_rate_sync()) {
          node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(config.rate_sync().division_index()));
        }
        node.processors.modulation->setDepth(config.depth());
        node.processors.modulation->setStereoPhase(config.stereo_phase_offset());
        node.processors.modulation->setAutoPanSmoothing(config.smoothing());
        node.processors.modulation->setAutoPanShape(shape == "tri" || shape == "triangle"
                                                        ? ModulationNode::LfoShape::triangle
                                                    : shape == "square" ? ModulationNode::LfoShape::square
                                                    : shape == "random" ? ModulationNode::LfoShape::random
                                                                        : ModulationNode::LfoShape::sine);
        node.processors.modulation->setMix(1.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_REVERSE:
      if (sourceNode.has_reverse_config() && node.processors.reverse != nullptr) {
        const auto& config = sourceNode.reverse_config();
        node.processors.reverse->setWindowMs(config.window_ms());
        node.processors.reverse->setPitchSemitones(config.pitch_semitones());
        node.processors.reverse->setForwardMix(config.forward_mix());
        node.processors.reverse->setCrossfadeMs(config.crossfade_ms());
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_EXCITER:
      if (sourceNode.has_exciter_config()) {
        const auto band = juce::String(sourceNode.exciter_config().frequency_band_solo()).toLowerCase();
        node.exciterSmoothing = band == "low" ? 0.18f : band == "mid" ? 0.1f : band == "high" ? 0.04f : 0.08f;
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR:
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE:
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION:
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER:
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER:
    case padpilot::fx::FX_NODE_TYPE_SATURATION:
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      break;
  }
}

bool ConvolverModuleGraph::applyRealtimeNodeParameter(NodeSlot& node, std::uint32_t parameterId, float value) noexcept {
  const auto index = static_cast<std::size_t>(parameterId);
  if (index >= kMaxRealtimeNodeParameters || !std::isfinite(value) ||
      !supportsRealtimeNodeParameter(node.sourceState.type(), parameterId)) {
    return false;
  }

  bool parameterFound = false;
  auto safeValue = value;
  for (const auto& parameter : node.sourceState.legacy_params()) {
    if (parameter.parameter_id() != parameterId) {
      continue;
    }
    parameterFound = true;
    if (std::isfinite(parameter.min_value()) && std::isfinite(parameter.max_value()) &&
        parameter.min_value() <= parameter.max_value()) {
      safeValue = std::clamp(value, parameter.min_value(), parameter.max_value());
    }
    break;
  }
  if (!parameterFound) {
    return false;
  }

  node.realtimeParameterValues[index] = safeValue;
  node.realtimeParameterPresent[index] = true;

  switch (node.sourceState.type()) {
    case padpilot::fx::FX_NODE_TYPE_CONVOLVER: {
      if (!node.sourceState.has_convolver_config() || node.processors.convolver == nullptr) {
        return false;
      }
      const auto& config = node.sourceState.convolver_config();
      const auto wet = clampUnitInterval(getRealtimeNodeParameter(node, 2, config.blend()));
      node.processors.convolver->setWetDry(wet, 1.0f - wet);
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_DELAY: {
      if (!node.sourceState.has_delay_config() || node.processors.delay == nullptr) {
        return false;
      }
      const auto& config = node.sourceState.delay_config();
      const auto syncEnabled =
          getRealtimeNodeParameter(node, 4, config.has_time_sync() && config.time_sync().enabled() ? 1.0f : 0.0f) >=
          0.5f;
      node.processors.delay->setSyncEnabled(syncEnabled);
      if (syncEnabled) {
        const auto division = timingSyncIndex(getRealtimeNodeParameter(
            node, 5, config.has_time_sync() ? static_cast<float>(config.time_sync().division_index()) : 0.0f));
        node.processors.delay->setTimeBeats(timingSyncBeatsForIndex(division));
      } else {
        const auto seconds = std::max(0.05f, getRealtimeNodeParameter(node, 1, config.time()));
        node.processors.delay->setTimeHz(1.0f / seconds);
      }
      node.processors.delay->setFeedback(getRealtimeNodeParameter(node, 2, config.feedback()));
      node.processors.delay->setLowCutHz(getRealtimeNodeParameter(node, 6, config.low_cut_hz()));
      node.processors.delay->setHighCutHz(getRealtimeNodeParameter(node, 7, config.high_cut_hz()));
      node.processors.delay->setWidth(getRealtimeNodeParameter(node, 8, config.width()));
      node.processors.delay->setSaturation(getRealtimeNodeParameter(node, 9, config.saturation()));
      node.processors.delay->setCharacter(static_cast<int>(std::lround(getRealtimeNodeParameter(node, 10, 0.0f))));
      const auto wet = clampUnitInterval(getRealtimeNodeParameter(node, 3, config.focus_mix()));
      node.processors.delay->setWetDry(wet, 1.0f - wet);
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_REVERB: {
      if (!node.sourceState.has_reverb_config() || node.processors.reverb == nullptr) {
        return false;
      }
      const auto& config = node.sourceState.reverb_config();
      const auto wet = clampUnitInterval(getRealtimeNodeParameter(node, 3, config.focus_mix()));
      node.processors.reverb->setWetDry(wet, 1.0f - wet);
      node.processors.reverb->setDecaySeconds(getRealtimeNodeParameter(node, 1, config.decay()));
      node.processors.reverb->setSize(getRealtimeNodeParameter(node, 2, config.size()));
      node.processors.reverb->setPreDelayMs(getRealtimeNodeParameter(node, 4, config.pre_delay_ms()));
      node.processors.reverb->setPreDelaySyncEnabled(
          getRealtimeNodeParameter(
              node, 5, config.has_pre_delay_sync() && config.pre_delay_sync().enabled() ? 1.0f : 0.0f) >= 0.5f);
      node.processors.reverb->setPreDelayBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
          node, 6,
          config.has_pre_delay_sync() ? static_cast<float>(config.pre_delay_sync().division_index()) : 0.0f))));
      node.processors.reverb->setModulationSpeedHz(getRealtimeNodeParameter(node, 7, config.modulation_speed_hz()));
      node.processors.reverb->setModulationSpeedSyncEnabled(
          getRealtimeNodeParameter(
              node, 8, config.has_modulation_speed_sync() && config.modulation_speed_sync().enabled() ? 1.0f : 0.0f) >=
          0.5f);
      node.processors.reverb->setModulationSpeedBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
          node, 9,
          config.has_modulation_speed_sync() ? static_cast<float>(config.modulation_speed_sync().division_index())
                                             : 0.0f))));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_EQ: {
      if (!node.sourceState.has_eq_config() || node.processors.eq == nullptr) {
        return false;
      }
      const auto& config = node.sourceState.eq_config();
      if (config.bands_size() <= 0) {
        return false;
      }
      const auto& band = config.bands(0);
      constexpr int kFirstConfigBand = 1;
      node.processors.eq->setBandFrequency(kFirstConfigBand, getRealtimeNodeParameter(node, 1, band.frequency_hz()));
      node.processors.eq->setBandGainDb(kFirstConfigBand, getRealtimeNodeParameter(node, 2, band.gain_db()));
      node.processors.eq->setBandQ(kFirstConfigBand, getRealtimeNodeParameter(node, 3, band.q()));
      node.processors.eq->setBandFrequency(0, getRealtimeNodeParameter(node, 4, config.low_shelf_frequency_hz()));
      node.processors.eq->setBandGainDb(0, getRealtimeNodeParameter(node, 5, config.low_shelf_gain_db()));
      const int highShelfBand = std::min(config.bands_size() + 1, ParametricEqNode::kMaxBands - 1);
      node.processors.eq->setBandFrequency(highShelfBand,
                                           getRealtimeNodeParameter(node, 6, config.high_shelf_frequency_hz()));
      node.processors.eq->setBandGainDb(highShelfBand, getRealtimeNodeParameter(node, 7, config.high_shelf_gain_db()));
      node.processors.eq->setOutputGainDb(getRealtimeNodeParameter(node, 8, config.master_gain_db()));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_CHORUS:
    case padpilot::fx::FX_NODE_TYPE_AUTO_PAN:
    case padpilot::fx::FX_NODE_TYPE_TREMOLO: {
      if (node.processors.modulation == nullptr) {
        return false;
      }
      const auto type = node.sourceState.type();
      if (type == padpilot::fx::FX_NODE_TYPE_CHORUS && node.sourceState.has_chorus_config()) {
        const auto& config = node.sourceState.chorus_config();
        node.processors.modulation->setRateHz(getRealtimeNodeParameter(node, 1, config.rate_hz()));
        node.processors.modulation->setDepth(getRealtimeNodeParameter(node, 2, config.depth()));
        node.processors.modulation->setFeedback(getRealtimeNodeParameter(node, 3, config.feedback()));
        node.processors.modulation->setRateSyncEnabled(
            getRealtimeNodeParameter(node, 4, config.has_rate_sync() && config.rate_sync().enabled() ? 1.0f : 0.0f) >=
            0.5f);
        node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
            node, 5, config.has_rate_sync() ? static_cast<float>(config.rate_sync().division_index()) : 0.0f))));
        node.processors.modulation->setBaseDelayMs(getRealtimeNodeParameter(node, 6, config.voice_delay_ms()));
        node.processors.modulation->setBaseDelaySyncEnabled(
            getRealtimeNodeParameter(
                node, 7, config.has_voice_delay_sync() && config.voice_delay_sync().enabled() ? 1.0f : 0.0f) >= 0.5f);
        node.processors.modulation->setBaseDelayBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
            node, 8,
            config.has_voice_delay_sync() ? static_cast<float>(config.voice_delay_sync().division_index()) : 0.0f))));
        return true;
      }
      if (type == padpilot::fx::FX_NODE_TYPE_AUTO_PAN && node.sourceState.has_auto_pan_config()) {
        const auto& config = node.sourceState.auto_pan_config();
        node.processors.modulation->setRateHz(getRealtimeNodeParameter(node, 1, config.rate_hz()));
        node.processors.modulation->setAutoPanAmount(getRealtimeNodeParameter(node, 2, config.amount()));
        node.processors.modulation->setAutoPanPhaseOffset(getRealtimeNodeParameter(node, 3, config.phase_offset()));
        node.processors.modulation->setRateSyncEnabled(
            getRealtimeNodeParameter(node, 4, config.has_rate_sync() && config.rate_sync().enabled() ? 1.0f : 0.0f) >=
            0.5f);
        node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
            node, 5, config.has_rate_sync() ? static_cast<float>(config.rate_sync().division_index()) : 0.0f))));
        return true;
      }
      if (type == padpilot::fx::FX_NODE_TYPE_TREMOLO && node.sourceState.has_tremolo_config()) {
        const auto& config = node.sourceState.tremolo_config();
        node.processors.modulation->setRateHz(getRealtimeNodeParameter(node, 1, config.rate_hz()));
        node.processors.modulation->setDepth(getRealtimeNodeParameter(node, 2, config.depth()));
        node.processors.modulation->setStereoPhase(getRealtimeNodeParameter(node, 3, config.stereo_phase_offset()));
        node.processors.modulation->setRateSyncEnabled(
            getRealtimeNodeParameter(node, 4, config.has_rate_sync() && config.rate_sync().enabled() ? 1.0f : 0.0f) >=
            0.5f);
        node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
            node, 5, config.has_rate_sync() ? static_cast<float>(config.rate_sync().division_index()) : 0.0f))));
        node.processors.modulation->setAutoPanSmoothing(getRealtimeNodeParameter(node, 6, config.smoothing()));
        const int shape = static_cast<int>(std::lround(getRealtimeNodeParameter(node, 7, 0.0f)));
        node.processors.modulation->setAutoPanShape(static_cast<ModulationNode::LfoShape>(std::clamp(shape, 0, 3)));
        return true;
      }
      return false;
    }
    case padpilot::fx::FX_NODE_TYPE_PHASER: {
      if (!node.sourceState.has_phaser_config() || node.processors.modulation == nullptr) return false;
      const auto& config = node.sourceState.phaser_config();
      node.processors.modulation->setRateHz(getRealtimeNodeParameter(node, 1, config.speed_hz()));
      node.processors.modulation->setPhaserCenterFrequencyHz(
          getRealtimeNodeParameter(node, 2, config.center_frequency_hz()));
      node.processors.modulation->setPhaserResonance(getRealtimeNodeParameter(node, 3, config.resonance()));
      node.processors.modulation->setRateSyncEnabled(
          getRealtimeNodeParameter(node, 4, config.has_speed_sync() && config.speed_sync().enabled() ? 1.0f : 0.0f) >=
          0.5f);
      node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
          node, 5, config.has_speed_sync() ? static_cast<float>(config.speed_sync().division_index()) : 0.0f))));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER: {
      if (!node.sourceState.has_rotary_speaker_config() || node.processors.modulation == nullptr) return false;
      const auto& config = node.sourceState.rotary_speaker_config();
      node.processors.modulation->setRotaryFast(getRealtimeNodeParameter(node, 1, config.fast() ? 1.0f : 0.0f) >= 0.5f);
      node.processors.modulation->setRotaryDrive(getRealtimeNodeParameter(node, 2, config.drive()));
      node.processors.modulation->setRotaryHornDrumBalance(
          getRealtimeNodeParameter(node, 3, config.horn_drum_balance()));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT: {
      if (!node.sourceState.has_pitch_drift_config() || node.processors.modulation == nullptr) return false;
      const auto& config = node.sourceState.pitch_drift_config();
      node.processors.modulation->setDepth(getRealtimeNodeParameter(node, 1, config.depth()));
      node.processors.modulation->setRateHz(getRealtimeNodeParameter(node, 2, config.rate_hz()));
      node.processors.modulation->setPitchDriftRangeCents(getRealtimeNodeParameter(node, 3, config.range_cents()));
      node.processors.modulation->setRateSyncEnabled(
          getRealtimeNodeParameter(node, 4, config.has_rate_sync() && config.rate_sync().enabled() ? 1.0f : 0.0f) >=
          0.5f);
      node.processors.modulation->setRateBeats(timingSyncBeatsForIndex(timingSyncIndex(getRealtimeNodeParameter(
          node, 5, config.has_rate_sync() ? static_cast<float>(config.rate_sync().division_index()) : 0.0f))));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_REVERSE: {
      if (!node.sourceState.has_reverse_config() || node.processors.reverse == nullptr) return false;
      const auto& config = node.sourceState.reverse_config();
      node.processors.reverse->setWindowMs(getRealtimeNodeParameter(node, 1, config.window_ms()));
      node.processors.reverse->setPitchSemitones(getRealtimeNodeParameter(node, 2, config.pitch_semitones()));
      node.processors.reverse->setForwardMix(getRealtimeNodeParameter(node, 3, config.forward_mix()));
      node.processors.reverse->setCrossfadeMs(getRealtimeNodeParameter(node, 4, config.crossfade_ms()));
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR:
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE:
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION:
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER:
    case padpilot::fx::FX_NODE_TYPE_EXCITER:
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER:
    case padpilot::fx::FX_NODE_TYPE_SATURATION:
      return true;
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      return false;
  }
}

void ConvolverModuleGraph::applyModulationRoutes(double hostBpm, int samples) noexcept {
  std::array<float, kMaxModulators> values{};
  const double safeBpm = std::isfinite(hostBpm) ? std::max(20.0, hostBpm) : 120.0;
  for (std::size_t index = 0; index < modulators_.size(); ++index) {
    auto& modulator = modulators_[index];
    if (!modulator.active) continue;
    switch (modulator.shape) {
      case ModulatorShape::triangle: {
        const float normalized = modulator.phase / juce::MathConstants<float>::twoPi;
        values[index] = 1.0f - 4.0f * std::abs(normalized - 0.5f);
        break;
      }
      case ModulatorShape::square:
        values[index] = std::sin(modulator.phase) >= 0.0f ? 1.0f : -1.0f;
        break;
      case ModulatorShape::random:
        values[index] = modulator.randomValue;
        break;
      case ModulatorShape::sine:
      default:
        values[index] = std::sin(modulator.phase);
        break;
    }
    const float rate = modulator.syncEnabled
                           ? static_cast<float>(1.0 / ((60.0 / safeBpm) * std::max(1.0e-4f, modulator.rateBeats)))
                           : modulator.rateHz;
    modulator.phase += juce::MathConstants<float>::twoPi * rate * static_cast<float>(samples) /
                       static_cast<float>(std::max(1.0, sampleRate_));
    if (modulator.phase >= juce::MathConstants<float>::twoPi) {
      modulator.phase = std::fmod(modulator.phase, juce::MathConstants<float>::twoPi);
      if (modulator.shape == ModulatorShape::random) {
        modulator.randomState = modulator.randomState * 1664525U + 1013904223U;
        modulator.randomValue = static_cast<float>(modulator.randomState >> 8U) / 8'388'607.5f - 1.0f;
      }
    }
  }

  for (const auto& route : modulationRoutes_) {
    if (!route.active || route.modulatorIndex >= modulators_.size()) continue;
    const auto& modulator = modulators_[route.modulatorIndex];
    const float modulation = modulator.active ? values[route.modulatorIndex] : 0.0f;
    const float value =
        std::clamp(route.baseValue + modulation * route.depth * 0.5f * (route.maxValue - route.minValue),
                   route.minValue, route.maxValue);
    auto* chain = findChainById(route.chainId);
    auto* node = chain != nullptr ? findNodeById(*chain, route.nodeId) : nullptr;
    if (node != nullptr) applyRealtimeNodeParameter(*node, route.parameterId, value);
  }
}

void ConvolverModuleGraph::updateModulationRouteBase(std::uint32_t chainId, std::uint32_t nodeId,
                                                     std::uint32_t parameterId, float value) noexcept {
  for (auto& route : modulationRoutes_) {
    if (route.active && route.chainId == chainId && route.nodeId == nodeId && route.parameterId == parameterId) {
      route.baseValue = std::clamp(value, route.minValue, route.maxValue);
    }
  }
}

float ConvolverModuleGraph::getRealtimeNodeParameter(const NodeSlot& node, std::uint32_t parameterId,
                                                     float fallback) const noexcept {
  const auto index = static_cast<std::size_t>(parameterId);
  if (index >= kMaxRealtimeNodeParameters || !node.realtimeParameterPresent[index]) {
    return fallback;
  }
  return node.realtimeParameterValues[index];
}

bool ConvolverModuleGraph::processCustomNode(NodeSlot& node, juce::AudioBuffer<float>& buffer) {
  const int channels = std::min(buffer.getNumChannels(), 2);
  const int samples = buffer.getNumSamples();
  if (channels <= 0 || samples <= 0) {
    return false;
  }

  auto nextRandomSigned = [&node]() {
    node.randomState = node.randomState * 1664525U + 1013904223U;
    return static_cast<float>(static_cast<int>(node.randomState >> 16U) & 0x7fff) / 16383.5f - 1.0f;
  };

  switch (node.sourceState.type()) {
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR: {
      if (!node.sourceState.has_compressor_config()) {
        return false;
      }
      const auto& config = node.sourceState.compressor_config();
      const float attackSamples =
          std::max(1.0f, std::clamp(getRealtimeNodeParameter(node, 4, config.attack_ms()), 0.01f, 60'000.0f) * 0.001f *
                             static_cast<float>(sampleRate_));
      const float releaseSamples =
          std::max(1.0f, std::clamp(getRealtimeNodeParameter(node, 5, config.release_ms()), 0.01f, 60'000.0f) * 0.001f *
                             static_cast<float>(sampleRate_));
      const float attackCoeff = std::exp(-1.0f / attackSamples);
      const float releaseCoeff = std::exp(-1.0f / releaseSamples);
      const float threshold = std::clamp(getRealtimeNodeParameter(node, 1, config.threshold_db()), -120.0f, 24.0f);
      const float ratio = std::clamp(getRealtimeNodeParameter(node, 2, config.ratio()), 0.05f, 100.0f);
      const float makeup = std::clamp(getRealtimeNodeParameter(node, 3, config.makeup_db()), -96.0f, 24.0f);
      for (int sample = 0; sample < samples; ++sample) {
        float peak = 0.0f;
        for (int channel = 0; channel < channels; ++channel) {
          peak = std::max(peak, std::abs(buffer.getSample(channel, sample)));
        }
        const float targetEnv = std::max(peak, 1.0e-5f);
        const float envCoeff = targetEnv > node.envelope ? attackCoeff : releaseCoeff;
        node.envelope = envCoeff * node.envelope + (1.0f - envCoeff) * targetEnv;
        const float envDb = juce::Decibels::gainToDecibels(node.envelope, -96.0f);
        float targetGainDb = makeup;
        if (ratio >= 1.0f && envDb > threshold) {
          targetGainDb += (threshold + (envDb - threshold) / ratio) - envDb;
        } else if (ratio < 1.0f && envDb < threshold) {
          targetGainDb += (threshold + (envDb - threshold) / ratio) - envDb;
        }
        const float gain = juce::Decibels::decibelsToGain(targetGainDb);
        for (int channel = 0; channel < channels; ++channel) {
          buffer.setSample(channel, sample, buffer.getSample(channel, sample) * gain);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER: {
      if (!node.sourceState.has_transient_shaper_config()) {
        return false;
      }
      const auto& config = node.sourceState.transient_shaper_config();
      const float sensitivity = 0.01f + clampUnitInterval(config.sensitivity()) * 0.2f;
      const float gain = juce::Decibels::decibelsToGain(
          std::clamp(getRealtimeNodeParameter(node, 3, config.gain_db()), -96.0f, 24.0f));
      const float attack = std::clamp(getRealtimeNodeParameter(node, 1, config.attack()), -1.0f, 1.0f);
      const float sustain = std::clamp(getRealtimeNodeParameter(node, 2, config.sustain()), -1.0f, 1.0f);
      for (int sample = 0; sample < samples; ++sample) {
        float peak = 0.0f;
        for (int channel = 0; channel < channels; ++channel) {
          peak = std::max(peak, std::abs(buffer.getSample(channel, sample)));
        }
        const float previous = node.envelope;
        node.envelope += (peak - node.envelope) * sensitivity;
        const float transient = peak - previous;
        const float shapeGain = std::max(0.0f, 1.0f + transient * attack * 4.0f - node.envelope * sustain * 0.05f);
        for (int channel = 0; channel < channels; ++channel) {
          float value = buffer.getSample(channel, sample) * shapeGain * gain;
          if (config.soft_clip()) {
            value = std::tanh(value * 1.5f);
          }
          buffer.setSample(channel, sample, value);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE: {
      if (!node.sourceState.has_noise_gate_config()) {
        return false;
      }
      const auto& config = node.sourceState.noise_gate_config();
      const float threshold = juce::Decibels::decibelsToGain(
          std::clamp(getRealtimeNodeParameter(node, 1, config.threshold_db()), -120.0f, 24.0f));
      const float floorGain = juce::Decibels::decibelsToGain(
          std::clamp(getRealtimeNodeParameter(node, 2, config.range_db()), -120.0f, 0.0f));
      const float attackSamples =
          std::max(1.0f, std::clamp(config.attack_ms(), 0.01f, 60'000.0f) * 0.001f * static_cast<float>(sampleRate_));
      const float releaseSamples =
          std::max(1.0f, std::clamp(getRealtimeNodeParameter(node, 3, config.release_ms()), 0.01f, 60'000.0f) * 0.001f *
                             static_cast<float>(sampleRate_));
      const auto holdSampleCount = std::clamp(static_cast<double>(config.hold_ms()) * 0.001 * sampleRate_, 0.0,
                                              static_cast<double>(std::numeric_limits<int>::max()));
      const int holdSamples = static_cast<int>(holdSampleCount);
      const float attackCoeff = std::exp(-1.0f / attackSamples);
      const float releaseCoeff = std::exp(-1.0f / releaseSamples);
      for (int sample = 0; sample < samples; ++sample) {
        float peak = 0.0f;
        for (int channel = 0; channel < channels; ++channel) {
          peak = std::max(peak, std::abs(buffer.getSample(channel, sample)));
        }
        const float envCoeff = peak > node.envelope ? attackCoeff : releaseCoeff;
        node.envelope = envCoeff * node.envelope + (1.0f - envCoeff) * peak;
        if (node.envelope >= threshold) {
          node.holdCounter = holdSamples;
        } else if (node.holdCounter > 0) {
          --node.holdCounter;
        }
        const float target = (node.envelope >= threshold || node.holdCounter > 0) ? 1.0f : floorGain;
        node.auxState[0] += (target - node.auxState[0]) * 0.2f;
        for (int channel = 0; channel < channels; ++channel) {
          buffer.setSample(channel, sample, buffer.getSample(channel, sample) * node.auxState[0]);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION: {
      if (!node.sourceState.has_tape_saturation_config()) {
        return false;
      }
      const auto& config = node.sourceState.tape_saturation_config();
      const float drive = 1.0f + clampUnitInterval(getRealtimeNodeParameter(node, 1, config.drive())) * 8.0f;
      const float warmth = clampUnitInterval(getRealtimeNodeParameter(node, 2, config.warmth()));
      const float bias = (clampUnitInterval(getRealtimeNodeParameter(node, 3, config.bias())) - 0.5f) * 0.4f;
      const float wowFlutter = clampUnitInterval(config.wow_flutter()) * 0.03f;
      const float speedScale = std::clamp(config.tape_speed_ips() / 30.0f, 0.25f, 4.0f);
      const float hysteresis = clampUnitInterval(config.hysteresis()) * 0.15f;
      for (int sample = 0; sample < samples; ++sample) {
        node.phase += (0.0015f + wowFlutter) * speedScale;
        if (node.phase >= juce::MathConstants<float>::twoPi) {
          node.phase = std::fmod(node.phase, juce::MathConstants<float>::twoPi);
        }
        const float wobble = 1.0f + std::sin(node.phase) * wowFlutter;
        for (int channel = 0; channel < channels; ++channel) {
          const float input = buffer.getSample(channel, sample);
          const float saturated = std::tanh((input + bias + node.auxState[channel] * hysteresis) * drive * wobble);
          node.lowState[channel] += (saturated - node.lowState[channel]) * (0.08f + warmth * 0.2f);
          node.auxState[channel] = saturated;
          buffer.setSample(channel, sample,
                           saturated * (1.0f - warmth * 0.35f) + node.lowState[channel] * warmth * 0.35f);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_SATURATION: {
      if (!node.sourceState.has_saturation_config()) return false;
      const auto& config = node.sourceState.saturation_config();
      const float amount = clampUnitInterval(getRealtimeNodeParameter(node, 1, config.drive()));
      const float drive = 1.0f + amount * 15.0f;
      const float tone = clampUnitInterval(getRealtimeNodeParameter(node, 2, config.tone()));
      const float bias = std::clamp(getRealtimeNodeParameter(node, 3, config.bias()), -1.0f, 1.0f) * 0.2f;
      const int character =
          std::clamp(static_cast<int>(std::lround(getRealtimeNodeParameter(node, 4,
                                                                           config.character() == "Tube"         ? 1.0f
                                                                           : config.character() == "Transistor" ? 2.0f
                                                                           : config.character() == "Fold"       ? 3.0f
                                                                                                          : 0.0f))),
                     0, 3);
      const float output = juce::Decibels::decibelsToGain(
          std::clamp(getRealtimeNodeParameter(node, 5, config.output_gain_db()), -18.0f, 12.0f));
      const float toneCoefficient = 0.01f + tone * 0.45f;
      const float normalization = std::max(0.001f, std::tanh(drive));
      for (int sample = 0; sample < samples; ++sample) {
        for (int channel = 0; channel < channels; ++channel) {
          const float input = buffer.getSample(channel, sample);
          float shaped = 0.0f;
          if (character == 1) {
            shaped = (std::tanh((input + bias) * drive) - std::tanh(bias * drive)) / normalization;
          } else if (character == 2) {
            shaped = std::clamp(input * drive + bias, -1.0f, 0.72f) / drive;
          } else if (character == 3) {
            const float folded = std::fmod((input * drive + 3.0f), 4.0f) - 2.0f;
            shaped = (folded > 1.0f ? 2.0f - folded : folded < -1.0f ? -2.0f - folded : folded);
          } else {
            shaped = std::tanh(input * drive) / normalization;
          }
          node.lowState[static_cast<std::size_t>(channel)] +=
              (shaped - node.lowState[static_cast<std::size_t>(channel)]) * toneCoefficient;
          const float toned = shaped * tone + node.lowState[static_cast<std::size_t>(channel)] * (1.0f - tone);
          buffer.setSample(channel, sample, toned * output);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER: {
      if (!node.sourceState.has_bitcrusher_config()) {
        return false;
      }
      const auto& config = node.sourceState.bitcrusher_config();
      const float bits = std::clamp(getRealtimeNodeParameter(node, 1, config.bits()), 1.0f, 24.0f);
      const int levels = std::max(2, static_cast<int>(std::pow(2.0f, std::min(bits, 16.0f))));
      const int baseHold = std::max(1, static_cast<int>(std::lround(std::clamp(
                                           getRealtimeNodeParameter(node, 2, config.downsample()), 1.0f, 65'536.0f))));
      const float wetDry = clampUnitInterval(getRealtimeNodeParameter(node, 3, config.wet_dry()));
      const float jitter = clampUnitInterval(config.jitter());
      const float postFilter = clampUnitInterval(config.post_filter());
      for (int sample = 0; sample < samples; ++sample) {
        if (node.holdCounter <= 0) {
          const int jitterOffset =
              static_cast<int>(std::round(nextRandomSigned() * jitter * static_cast<float>(baseHold)));
          node.holdCounter = std::max(1, baseHold + jitterOffset);
          for (int channel = 0; channel < channels; ++channel) {
            const float input = buffer.getSample(channel, sample);
            node.heldSample[channel] = std::round(input * static_cast<float>(levels)) / static_cast<float>(levels);
          }
        }
        --node.holdCounter;
        for (int channel = 0; channel < channels; ++channel) {
          node.lowState[channel] += (node.heldSample[channel] - node.lowState[channel]) * (1.0f - postFilter * 0.85f);
          const float crushed = node.lowState[channel];
          const float dry = buffer.getSample(channel, sample);
          buffer.setSample(channel, sample, dry * (1.0f - wetDry) + crushed * wetDry);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_EXCITER: {
      if (!node.sourceState.has_exciter_config()) {
        return false;
      }
      const auto& config = node.sourceState.exciter_config();
      const float drive = 1.0f + clampUnitInterval(getRealtimeNodeParameter(node, 1, config.harmonic_drive())) * 10.0f;
      const float mix = clampUnitInterval(getRealtimeNodeParameter(node, 2, config.mix()));
      const float bias =
          (clampUnitInterval(getRealtimeNodeParameter(node, 3, config.odd_even_balance())) - 0.5f) * 0.5f;
      for (int sample = 0; sample < samples; ++sample) {
        for (int channel = 0; channel < channels; ++channel) {
          const float dry = buffer.getSample(channel, sample);
          node.lowState[channel] += (dry - node.lowState[channel]) * node.exciterSmoothing;
          const float high = dry - node.lowState[channel];
          const float excited = std::tanh((high + bias) * drive) - std::tanh(bias * drive);
          buffer.setSample(channel, sample, dry + excited * mix * 0.6f);
        }
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER: {
      if (!node.sourceState.has_stereo_imager_config() || channels < 2) {
        return false;
      }
      const auto& config = node.sourceState.stereo_imager_config();
      const float width = std::clamp(getRealtimeNodeParameter(node, 1, config.width_percent()) / 100.0f, 0.0f, 2.0f);
      const float balance =
          std::clamp(getRealtimeNodeParameter(node, 2, config.stereo_balance()) * 2.0f - 1.0f, -1.0f, 1.0f);
      const float pan = std::clamp(getRealtimeNodeParameter(node, 3, config.pan()), -1.0f, 1.0f);
      const float crossoverHz = std::clamp(config.bass_mono_crossover_hz(), 40.0f, 400.0f);
      const float monoBassCoefficient = 1.0f - std::exp(-2.0f * juce::MathConstants<float>::pi * crossoverHz /
                                                        static_cast<float>(std::max(1.0, sampleRate_)));
      for (int sample = 0; sample < samples; ++sample) {
        const float leftIn = buffer.getSample(0, sample);
        const float rightIn = buffer.getSample(1, sample);
        node.lowState[0] += (leftIn - node.lowState[0]) * monoBassCoefficient;
        node.lowState[1] += (rightIn - node.lowState[1]) * monoBassCoefficient;
        const float monoLow = 0.5f * (node.lowState[0] + node.lowState[1]);
        const float leftHigh = leftIn - node.lowState[0];
        const float rightHigh = rightIn - node.lowState[1];
        float mid = monoLow + 0.5f * (leftHigh + rightHigh);
        float side = 0.5f * (leftHigh - rightHigh) * width;
        float left = (mid + side) * (balance <= 0.0f ? 1.0f : 1.0f - balance);
        float right = (mid - side) * (balance >= 0.0f ? 1.0f : 1.0f + balance);
        const float panLeft = pan <= 0.0f ? 1.0f : 1.0f - pan;
        const float panRight = pan >= 0.0f ? 1.0f : 1.0f + pan;
        buffer.setSample(0, sample, left * panLeft);
        buffer.setSample(1, sample, right * panRight);
      }
      return true;
    }
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      return false;
  }
}

bool ConvolverModuleGraph::processNode(NodeSlot& node, juce::AudioBuffer<float>& buffer, double hostBpm,
                                       std::uint64_t* elapsedNs) {
  const bool profiling = profilingEnabled_.load(std::memory_order_relaxed);
  const auto start = profiling ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point{};
  bool processed = false;
  switch (node.type) {
    case FXChainType::convolver:
      processed = node.processors.convolver != nullptr && node.processors.convolver->process(buffer);
      break;
    case FXChainType::delay:
      if (node.processors.delay != nullptr) {
        node.processors.delay->setHostBpm(hostBpm);
        processed = node.processors.delay->process(buffer);
      }
      break;
    case FXChainType::reverb:
      if (node.processors.reverb != nullptr) {
        node.processors.reverb->setHostBpm(hostBpm);
        processed = node.processors.reverb->process(buffer, profiling);
      }
      break;
    case FXChainType::modulation:
      if (node.processors.modulation != nullptr) {
        node.processors.modulation->setHostBpm(hostBpm);
        processed = node.processors.modulation->process(buffer);
      }
      break;
    case FXChainType::eq:
      processed = node.processors.eq != nullptr && node.processors.eq->process(buffer);
      break;
    case FXChainType::reverse:
      processed = node.processors.reverse != nullptr && node.processors.reverse->process(buffer);
      break;
    case FXChainType::passthrough:
      processed = processCustomNode(node, buffer);
      break;
  }

  if (elapsedNs != nullptr && profiling) {
    const auto end = std::chrono::steady_clock::now();
    *elapsedNs = static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count());
  }
  return processed;
}

ConvolverModuleGraph::NodeSlot* ConvolverModuleGraph::findFirstNodeOfType(FXChainType type) noexcept {
  for (auto& chain : chainSlots_) {
    if (!chain.active) {
      continue;
    }
    for (auto& node : chain.nodes) {
      if (node.active && node.type == type) {
        return &node;
      }
    }
  }
  return nullptr;
}

void ConvolverModuleGraph::publishTopologySnapshot() noexcept {
  for (int chainIndex = 0; chainIndex < kMaxChains; ++chainIndex) {
    const auto& chain = chainSlots_[static_cast<std::size_t>(chainIndex)];
    snapshotChainActive_[static_cast<std::size_t>(chainIndex)].store(chain.active, std::memory_order_relaxed);
    snapshotChainId_[static_cast<std::size_t>(chainIndex)].store(chain.id, std::memory_order_relaxed);
    snapshotChainMuted_[static_cast<std::size_t>(chainIndex)].store(chain.muted, std::memory_order_relaxed);
    snapshotChainSolo_[static_cast<std::size_t>(chainIndex)].store(chain.solo, std::memory_order_relaxed);
    for (int nodeIndex = 0; nodeIndex < kMaxNodesPerChain; ++nodeIndex) {
      const auto& node = chain.nodes[static_cast<std::size_t>(nodeIndex)];
      snapshotNodeActive_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          node.active, std::memory_order_relaxed);
      snapshotNodeBypassed_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          node.bypassed, std::memory_order_relaxed);
      snapshotNodeId_[static_cast<std::size_t>(chainIndex)][static_cast<std::size_t>(nodeIndex)].store(
          node.id, std::memory_order_relaxed);
    }
  }
}

ConvolverModuleGraph::ChainSlot* ConvolverModuleGraph::findChainById(std::uint32_t chainId) noexcept {
  for (auto& chain : chainSlots_) {
    if (chain.configured && chain.id == chainId) {
      return &chain;
    }
  }
  return nullptr;
}

const ConvolverModuleGraph::ChainSlot* ConvolverModuleGraph::findChainById(std::uint32_t chainId) const noexcept {
  for (const auto& chain : chainSlots_) {
    if (chain.configured && chain.id == chainId) {
      return &chain;
    }
  }
  return nullptr;
}

ConvolverModuleGraph::NodeSlot* ConvolverModuleGraph::findNodeById(ChainSlot& chain, std::uint32_t nodeId) noexcept {
  for (auto& node : chain.nodes) {
    if (node.active && node.id == nodeId) {
      return &node;
    }
  }
  return nullptr;
}

const ConvolverModuleGraph::NodeSlot* ConvolverModuleGraph::findNodeById(const ChainSlot& chain,
                                                                         std::uint32_t nodeId) const noexcept {
  for (const auto& node : chain.nodes) {
    if (node.active && node.id == nodeId) {
      return &node;
    }
  }
  return nullptr;
}

int ConvolverModuleGraph::findChainSlotIndexById(std::uint32_t chainId) const noexcept {
  for (int index = 0; index < kMaxChains; ++index) {
    if (chainSlots_[static_cast<std::size_t>(index)].configured &&
        chainSlots_[static_cast<std::size_t>(index)].id == chainId) {
      return index;
    }
  }
  return -1;
}

ConvolverModuleGraph::FXChainType ConvolverModuleGraph::nodeTypeFromIndex(int typeIndex) const noexcept {
  switch (typeIndex) {
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_DELAY):
      return FXChainType::delay;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_REVERB):
      return FXChainType::reverb;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_CHORUS):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_AUTO_PAN):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_PHASER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_TREMOLO):
      return FXChainType::modulation;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_REVERSE):
      return FXChainType::reverse;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_EQ):
      return FXChainType::eq;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_CONVOLVER):
      return FXChainType::convolver;
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_COMPRESSOR):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_NOISE_GATE):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_BITCRUSHER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_EXCITER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER):
    case static_cast<int>(padpilot::fx::FX_NODE_TYPE_SATURATION):
      return FXChainType::passthrough;
    default:
      return FXChainType::passthrough;
  }
}

void ConvolverModuleGraph::writeInputWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex,
                                                      const juce::AudioBuffer<float>& buffer) {
  const int channels = std::max(1, buffer.getNumChannels());
  const int samples = std::max(1, buffer.getNumSamples());
  const int bucketSize = std::max(1, samples / kWaveformBins);
  for (int bucket = 0; bucket < kWaveformBins; ++bucket) {
    const int startSample = std::min(bucket * bucketSize, samples - 1);
    const int endSample = std::min(samples, startSample + bucketSize);
    float peak = 0.0f;
    for (int channel = 0; channel < channels; ++channel) {
      const float* read = buffer.getReadPointer(channel);
      for (int sample = startSample; sample < endSample; ++sample) {
        peak = std::max(peak, std::abs(read[sample]));
      }
    }
    nodeInputWaveform_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)]
                      [static_cast<std::size_t>(bucket)]
                          .store(peak, std::memory_order_relaxed);
  }
}

void ConvolverModuleGraph::writeOutputWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex,
                                                       const juce::AudioBuffer<float>& buffer) {
  const int channels = std::max(1, buffer.getNumChannels());
  const int samples = std::max(1, buffer.getNumSamples());
  const int bucketSize = std::max(1, samples / kWaveformBins);
  for (int bucket = 0; bucket < kWaveformBins; ++bucket) {
    const int startSample = std::min(bucket * bucketSize, samples - 1);
    const int endSample = std::min(samples, startSample + bucketSize);
    float peak = 0.0f;
    for (int channel = 0; channel < channels; ++channel) {
      const float* read = buffer.getReadPointer(channel);
      for (int sample = startSample; sample < endSample; ++sample) {
        peak = std::max(peak, std::abs(read[sample]));
      }
    }
    nodeOutputWaveform_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)]
                       [static_cast<std::size_t>(bucket)]
                           .store(peak, std::memory_order_relaxed);
  }
}

void ConvolverModuleGraph::writeSignedWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex,
                                                       const juce::AudioBuffer<float>& buffer) {
  const int samples = std::max(1, buffer.getNumSamples());
  const int bucketSize = std::max(1, samples / kWaveformBins);
  for (int bucket = 0; bucket < kWaveformBins; ++bucket) {
    const int startSample = std::min(bucket * bucketSize, samples - 1);
    const int endSample = std::min(samples, startSample + bucketSize);
    float leftValue = 0.0f;
    float rightValue = 0.0f;
    const float* leftRead = buffer.getReadPointer(0);
    const float* rightRead = buffer.getNumChannels() > 1 ? buffer.getReadPointer(1) : leftRead;
    for (int sample = startSample; sample < endSample; ++sample) {
      leftValue += leftRead[sample];
      rightValue += rightRead[sample];
    }
    const float scale = 1.0f / static_cast<float>(std::max(1, endSample - startSample));
    nodeLeftSignedWaveform_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)]
                           [static_cast<std::size_t>(bucket)]
                               .store(leftValue * scale, std::memory_order_relaxed);
    nodeRightSignedWaveform_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)]
                            [static_cast<std::size_t>(bucket)]
                                .store(rightValue * scale, std::memory_order_relaxed);
  }
}

void ConvolverModuleGraph::setNodeMotionSnapshot(int chainSlotIndex, int nodeSlotIndex, float motionValue) {
  nodeMotionValue_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      motionValue, std::memory_order_relaxed);
}

void ConvolverModuleGraph::setNodePeakSnapshot(int chainSlotIndex, int nodeSlotIndex, float inputPeakDb,
                                               float inputPeakDbLeft, float inputPeakDbRight, float outputPeakDb,
                                               float outputPeakDbLeft, float outputPeakDbRight) {
  nodeInputPeakDb_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      inputPeakDb, std::memory_order_relaxed);
  nodeInputPeakDbLeft_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      inputPeakDbLeft, std::memory_order_relaxed);
  nodeInputPeakDbRight_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      inputPeakDbRight, std::memory_order_relaxed);
  nodeOutputPeakDb_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      outputPeakDb, std::memory_order_relaxed);
  nodeOutputPeakDbLeft_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      outputPeakDbLeft, std::memory_order_relaxed);
  nodeOutputPeakDbRight_[static_cast<std::size_t>(chainSlotIndex)][static_cast<std::size_t>(nodeSlotIndex)].store(
      outputPeakDbRight, std::memory_order_relaxed);
}

void ConvolverModuleGraph::setChainPeakSnapshot(int chainSlotIndex, float inputPeakDb, float inputPeakDbLeft,
                                                float inputPeakDbRight, float outputPeakDb, float outputPeakDbLeft,
                                                float outputPeakDbRight) {
  chainInputPeakDb_[static_cast<std::size_t>(chainSlotIndex)].store(inputPeakDb, std::memory_order_relaxed);
  chainInputPeakDbLeft_[static_cast<std::size_t>(chainSlotIndex)].store(inputPeakDbLeft, std::memory_order_relaxed);
  chainInputPeakDbRight_[static_cast<std::size_t>(chainSlotIndex)].store(inputPeakDbRight, std::memory_order_relaxed);
  chainOutputPeakDb_[static_cast<std::size_t>(chainSlotIndex)].store(outputPeakDb, std::memory_order_relaxed);
  chainOutputPeakDbLeft_[static_cast<std::size_t>(chainSlotIndex)].store(outputPeakDbLeft, std::memory_order_relaxed);
  chainOutputPeakDbRight_[static_cast<std::size_t>(chainSlotIndex)].store(outputPeakDbRight, std::memory_order_relaxed);
}

}  // namespace padpilot
