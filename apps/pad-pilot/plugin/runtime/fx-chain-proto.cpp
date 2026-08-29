#include "runtime/fx-chain-proto.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

#include "runtime/bounded-json.h"
#include "runtime/plugin-state-wire.h"

namespace padpilot::proto {
namespace {
constexpr std::uint32_t kSchemaVersion = 3;
constexpr double kDefaultSyncBpm = 120.0;
constexpr std::array<float, 20> kTimingSyncBeats {
    0.125f,
    1.0f / 12.0f,
    0.1875f,
    0.25f,
    1.0f / 6.0f,
    0.375f,
    0.5f,
    1.0f / 3.0f,
    0.75f,
    1.0f,
    2.0f / 3.0f,
    1.5f,
    2.0f,
    4.0f / 3.0f,
    3.0f,
    4.0f,
    8.0f,
    16.0f,
    32.0f,
    64.0f,
};

void populateNodeConfigFromLegacyParams(padpilot::fx::NodeState* node);

padpilot::fx::NodeParamState makeParam(std::uint32_t parameterId,
                                       const std::string& label,
                                       float defaultValue,
                                       float minValue,
                                       float maxValue,
                                       const std::string& unit) {
  padpilot::fx::NodeParamState param;
  param.set_parameter_id(parameterId);
  param.set_label(label);
  param.set_value(defaultValue);
  param.set_min_value(minValue);
  param.set_max_value(maxValue);
  param.set_default_value(defaultValue);
  param.set_unit(unit);
  return param;
}

padpilot::fx::NodeState makeNode(std::uint32_t id,
                                 padpilot::fx::FxNodeType type,
                                 const std::string& name,
                                 std::initializer_list<padpilot::fx::NodeParamState> params) {
  padpilot::fx::NodeState node;
  node.set_id(id);
  node.set_type(type);
  node.set_name(name);
  node.set_order(id > 0 ? id - 1 : 0);
  node.set_bypassed(false);
  node.set_muted(false);
  node.set_solo(false);
  node.set_mix(1.0f);
  node.set_selected_preset_id("");
  for (const auto& param : params) {
    *node.add_legacy_params() = param;
  }
  populateNodeConfigFromLegacyParams(&node);
  return node;
}

padpilot::fx::ChainState makeChain(std::uint32_t id,
                                   const std::string& name,
                                   std::uint32_t order,
                                   float mix,
                                   std::initializer_list<padpilot::fx::NodeState> nodes) {
  padpilot::fx::ChainState chain;
  chain.set_id(id);
  chain.set_name(name);
  chain.set_order(order);
  chain.set_mix(mix);
  chain.set_muted(false);
  chain.set_solo(false);
  for (const auto& node : nodes) {
    *chain.add_nodes() = node;
  }
  return chain;
}

float getOptionalNumber(const juce::var& value, float fallback) {
  const auto parsed = padpilot::readBoundedJsonFloat(value, -1.0e6f, 1.0e6f);
  return parsed.value_or(fallback);
}

float findLegacyParamValue(const padpilot::fx::NodeState& node, const char* label, float fallback) {
  const auto target = juce::String(label).toLowerCase();
  for (const auto& param : node.legacy_params()) {
    if (juce::String(param.label()).toLowerCase() == target) {
      return param.value();
    }
  }
  return fallback;
}

float findLegacyParamValueById(const padpilot::fx::NodeState& node, std::uint32_t parameterId, float fallback) {
  for (const auto& param : node.legacy_params()) {
    if (param.parameter_id() == parameterId) {
      return param.value();
    }
  }
  return fallback;
}

std::uint32_t clampTimingSyncDivisionIndex(float index) {
  return static_cast<std::uint32_t>(std::clamp(static_cast<int>(std::lround(index)), 0, static_cast<int>(kTimingSyncBeats.size() - 1)));
}

float beatsFromTimingValue(float value, bool milliseconds, bool hertz) {
  const auto safeValue = std::max(1.0e-6f, value);
  if (hertz) {
    return static_cast<float>((1.0 / static_cast<double>(safeValue)) * (kDefaultSyncBpm / 60.0));
  }
  const double seconds = milliseconds ? static_cast<double>(safeValue) / 1000.0 : static_cast<double>(safeValue);
  return static_cast<float>(seconds * (kDefaultSyncBpm / 60.0));
}

std::uint32_t nearestTimingSyncDivisionIndex(float value, bool milliseconds = false, bool hertz = false) {
  const float beats = beatsFromTimingValue(value, milliseconds, hertz);
  std::uint32_t bestIndex = 0;
  float bestDistance = std::numeric_limits<float>::max();
  for (std::uint32_t index = 0; index < kTimingSyncBeats.size(); ++index) {
    const float distance = std::abs(kTimingSyncBeats[index] - beats);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

void setTempoSyncState(padpilot::fx::TempoSyncState* state, bool enabled, std::uint32_t divisionIndex) {
  if (state == nullptr) {
    return;
  }
  state->set_enabled(enabled);
  state->set_division_index(std::min<std::uint32_t>(divisionIndex, static_cast<std::uint32_t>(kTimingSyncBeats.size() - 1)));
}

void populateNodeConfigFromLegacyParams(padpilot::fx::NodeState* node) {
  if (node == nullptr) {
    return;
  }

  switch (node->type()) {
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR: {
      auto* config = node->mutable_compressor_config();
      config->set_threshold_db(findLegacyParamValue(*node, "threshold", -18.0f));
      config->set_ratio(findLegacyParamValue(*node, "ratio", 4.0f));
      config->set_makeup_db(findLegacyParamValue(*node, "makeup", 0.0f));
      config->set_attack_ms(12.0f);
      config->set_release_ms(120.0f);
      config->set_knee_db(6.0f);
      config->set_sidechain_hpf_hz(120.0f);
      config->set_lookahead_ms(0.0f);
      config->set_multiband_enabled(false);
      config->mutable_low_band()->set_threshold_db(-18.0f);
      config->mutable_low_band()->set_ratio(4.0f);
      config->mutable_mid_band()->set_threshold_db(-18.0f);
      config->mutable_mid_band()->set_ratio(4.0f);
      config->mutable_high_band()->set_threshold_db(-18.0f);
      config->mutable_high_band()->set_ratio(4.0f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_EQ: {
      auto* config = node->mutable_eq_config();
      config->set_low_shelf_gain_db(0.0f);
      config->set_high_shelf_gain_db(0.0f);
      config->set_master_gain_db(0.0f);
      config->clear_bands();
      auto* band = config->add_bands();
      band->set_frequency_hz(findLegacyParamValue(*node, "freq", 1200.0f));
      band->set_q(findLegacyParamValue(*node, "q", 1.1f));
      band->set_gain_db(findLegacyParamValue(*node, "gain", 0.0f));
      band->set_type("Bell");
      band->set_enabled(true);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER: {
      auto* config = node->mutable_transient_shaper_config();
      config->set_attack(findLegacyParamValue(*node, "attack", 0.5f));
      config->set_sustain(findLegacyParamValue(*node, "sustain", 0.5f));
      config->set_soft_clip(false);
      config->set_gain_db(0.0f);
      config->set_sensitivity(0.5f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE: {
      auto* config = node->mutable_noise_gate_config();
      config->set_threshold_db(findLegacyParamValue(*node, "threshold", -36.0f));
      config->set_range_db(findLegacyParamValue(*node, "range", -18.0f));
      config->set_attack_ms(5.0f);
      config->set_hold_ms(40.0f);
      config->set_release_ms(80.0f);
      config->set_sidechain_listen(false);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_DELAY: {
      auto* config = node->mutable_delay_config();
      const float time = findLegacyParamValue(*node, "time", 0.35f);
      config->set_time(time);
      config->set_feedback(findLegacyParamValue(*node, "feedback", 0.42f));
      config->set_focus_mix(findLegacyParamValue(*node, "mix", 0.4f));
      config->set_grain_mode(false);
      config->set_grain_size(0.2f);
      config->set_grain_density(0.5f);
      config->set_grain_spray(0.2f);
      config->set_grain_pitch_shift(0.0f);
      setTempoSyncState(config->mutable_time_sync(),
                        findLegacyParamValueById(*node, 4, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 5, static_cast<float>(nearestTimingSyncDivisionIndex(time)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_REVERB: {
      auto* config = node->mutable_reverb_config();
      config->set_mode("Hall");
      config->set_decay(findLegacyParamValue(*node, "decay", 1.2f));
      config->set_size(findLegacyParamValue(*node, "size", 0.72f));
      config->set_focus_mix(findLegacyParamValue(*node, "mix", 0.45f));
      config->set_damping(0.35f);
      const float preDelayMs = findLegacyParamValueById(*node, 4, 18.0f);
      const float modulationSpeedHz = findLegacyParamValueById(*node, 7, 0.35f);
      config->set_pre_delay_ms(preDelayMs);
      config->set_modulation_speed_hz(modulationSpeedHz);
      config->set_modulation_depth(0.2f);
      config->set_shimmer_feedback(0.15f);
      setTempoSyncState(config->mutable_pre_delay_sync(),
                        findLegacyParamValueById(*node, 5, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 6, static_cast<float>(nearestTimingSyncDivisionIndex(preDelayMs, true, false)))));
      setTempoSyncState(config->mutable_modulation_speed_sync(),
                        findLegacyParamValueById(*node, 8, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 9, static_cast<float>(nearestTimingSyncDivisionIndex(modulationSpeedHz, false, true)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_CONVOLVER: {
      auto* config = node->mutable_convolver_config();
      config->set_ir_id("builtin-stadium");
      config->set_blend(findLegacyParamValue(*node, "blend", 0.8f));
      config->set_ir_stretch(findLegacyParamValue(*node, "stretch", 1.0f));
      config->set_reverse(false);
      config->set_start_trim(0.0f);
      config->set_end_trim(1.0f);
      config->set_high_pass_hz(40.0f);
      config->set_low_pass_hz(18000.0f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION: {
      auto* config = node->mutable_tape_saturation_config();
      config->set_drive(findLegacyParamValue(*node, "drive", 0.35f));
      config->set_warmth(findLegacyParamValue(*node, "warmth", 0.55f));
      config->set_tape_speed_ips(15.0f);
      config->set_wow_flutter(0.2f);
      config->set_hysteresis(0.4f);
      config->set_bias(0.5f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER: {
      auto* config = node->mutable_bitcrusher_config();
      config->set_bits(findLegacyParamValue(*node, "bits", 12.0f));
      config->set_downsample(findLegacyParamValue(*node, "downsample", 4.0f));
      config->set_jitter(0.1f);
      config->set_post_filter(0.4f);
      config->set_wet_dry(0.65f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_EXCITER: {
      auto* config = node->mutable_exciter_config();
      config->set_harmonic_drive(findLegacyParamValue(*node, "harmonic drive", 0.4f));
      config->set_mix(findLegacyParamValue(*node, "mix", 0.5f));
      config->set_frequency_band_solo("None");
      config->set_odd_even_balance(0.5f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_CHORUS: {
      auto* config = node->mutable_chorus_config();
      const float rateHz = findLegacyParamValue(*node, "rate", 0.65f);
      config->set_rate_hz(rateHz);
      config->set_depth(findLegacyParamValue(*node, "depth", 0.35f));
      config->set_voices(4);
      config->set_width(0.6f);
      const float voiceDelayMs = findLegacyParamValueById(*node, 6, 14.0f);
      config->set_voice_delay_ms(voiceDelayMs);
      config->set_feedback(findLegacyParamValue(*node, "feedback", 0.1f));
      setTempoSyncState(config->mutable_rate_sync(),
                        findLegacyParamValueById(*node, 4, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 5, static_cast<float>(nearestTimingSyncDivisionIndex(rateHz, false, true)))));
      setTempoSyncState(config->mutable_voice_delay_sync(),
                        findLegacyParamValueById(*node, 7, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 8, static_cast<float>(nearestTimingSyncDivisionIndex(voiceDelayMs, true, false)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_PHASER: {
      auto* config = node->mutable_phaser_config();
      const float speedHz = findLegacyParamValue(*node, "speed", 0.55f);
      config->set_speed_hz(speedHz);
      config->set_center_frequency_hz(findLegacyParamValue(*node, "center freq", 900.0f));
      config->set_stages(6);
      config->set_resonance(0.35f);
      config->set_stereo_phase_offset(0.5f);
      setTempoSyncState(config->mutable_speed_sync(),
                        findLegacyParamValueById(*node, 4, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 5, static_cast<float>(nearestTimingSyncDivisionIndex(speedHz, false, true)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_AUTO_PAN: {
      auto* config = node->mutable_auto_pan_config();
      const float rateHz = findLegacyParamValue(*node, "rate", 0.7f);
      config->set_rate_hz(rateHz);
      config->set_amount(findLegacyParamValue(*node, "amount", 0.6f));
      config->set_lfo_shape("Sine");
      config->set_phase_offset(0.5f);
      config->set_smoothing(0.2f);
      setTempoSyncState(config->mutable_rate_sync(),
                        findLegacyParamValueById(*node, 4, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 5, static_cast<float>(nearestTimingSyncDivisionIndex(rateHz, false, true)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER: {
      auto* config = node->mutable_rotary_speaker_config();
      config->set_fast(false);
      config->set_drive(findLegacyParamValue(*node, "drive", 0.25f));
      config->set_horn_drum_balance(0.5f);
      config->set_mic_distance(0.5f);
      config->set_acceleration(0.4f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER: {
      auto* config = node->mutable_stereo_imager_config();
      config->set_width_percent(findLegacyParamValue(*node, "width", 100.0f));
      config->set_bass_mono_crossover_hz(160.0f);
      config->set_stereo_balance(0.0f);
      config->set_pan(0.0f);
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT: {
      auto* config = node->mutable_pitch_drift_config();
      config->set_depth(findLegacyParamValue(*node, "depth", 0.2f));
      const float rateHz = findLegacyParamValue(*node, "rate", 0.45f);
      config->set_rate_hz(rateHz);
      config->set_drift_shape("Analog");
      config->set_stereo_offset(0.15f);
      config->set_range_cents(18.0f);
      setTempoSyncState(config->mutable_rate_sync(),
                        findLegacyParamValueById(*node, 4, 0.0f) >= 0.5f,
                        clampTimingSyncDivisionIndex(findLegacyParamValueById(*node, 5, static_cast<float>(nearestTimingSyncDivisionIndex(rateHz, false, true)))));
      break;
    }
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      break;
  }
}

void setNodeParamsFromLegacyObject(const juce::DynamicObject* object,
                                   padpilot::fx::NodeState* node) {
  if (object == nullptr || node == nullptr) {
    return;
  }

  for (int index = 0; index < node->legacy_params_size(); ++index) {
    auto* param = node->mutable_legacy_params(index);
    if (param == nullptr) {
      continue;
    }

    const auto label = juce::String(param->label()).toLowerCase();
    if (label == "stretch") {
      param->set_value(getOptionalNumber(object->getProperty("timestretch"), param->default_value()));
    } else if (label == "blend") {
      param->set_value(getOptionalNumber(object->getProperty("wet"), param->default_value()));
    } else if (label == "time") {
      const float timeHz = getOptionalNumber(object->getProperty("timeHz"), 0.0f);
      if (timeHz > 0.0f) {
        param->set_value(1.0f / timeHz);
      }
    } else if (label == "feedback") {
      param->set_value(getOptionalNumber(object->getProperty("feedback"), param->default_value()));
    } else if (label == "time sync") {
      param->set_value(static_cast<bool>(object->getProperty("syncEnabled")) ? 1.0f : 0.0f);
    } else if (label == "time division") {
      const float timeBeats = getOptionalNumber(object->getProperty("timeBeats"), -1.0f);
      if (timeBeats > 0.0f) {
        const float timeSecondsAtDefaultBpm = static_cast<float>((60.0 / kDefaultSyncBpm) * timeBeats);
        param->set_value(static_cast<float>(nearestTimingSyncDivisionIndex(timeSecondsAtDefaultBpm)));
      }
    } else if (label == "decay") {
      param->set_value(getOptionalNumber(object->getProperty("decaySeconds"), param->default_value()));
    } else if (label == "size") {
      param->set_value(getOptionalNumber(object->getProperty("size"), param->default_value()));
    } else if (label == "rate") {
      param->set_value(getOptionalNumber(object->getProperty("rateHz"), param->default_value()));
    } else if (label == "depth") {
      param->set_value(getOptionalNumber(object->getProperty("depth"), param->default_value()));
    } else if (label == "freq") {
      param->set_value(getOptionalNumber(object->getProperty("frequency"), param->default_value()));
    } else if (label == "gain") {
      param->set_value(getOptionalNumber(object->getProperty("gainDb"), param->default_value()));
    } else if (label == "q") {
      param->set_value(getOptionalNumber(object->getProperty("q"), param->default_value()));
    }
  }

  populateNodeConfigFromLegacyParams(node);
}

float chainOutputPeak(float mix, float fallback) {
  const auto normalized = std::clamp(mix, 0.0f, 1.0f);
  return std::max(fallback, -42.0f + normalized * 30.0f);
}

float tapPeakForNode(float chainMix, int nodeIndex, int nodeCount, float fallback, float offset) {
  const auto safeNodeCount = std::max(nodeCount, 1);
  const auto nodeProgress = static_cast<float>(nodeIndex + 1) / static_cast<float>(safeNodeCount + 1);
  const auto contour = std::clamp(chainMix * 0.65f + nodeProgress * 0.35f + offset, 0.0f, 1.0f);
  return std::max(fallback, -48.0f + contour * 36.0f);
}

void appendWaveformSamples(padpilot::fx::MeterTap* tap, float seed) {
  if (tap == nullptr) {
    return;
  }

  for (int sample = 0; sample < 24; ++sample) {
    const auto phase = (static_cast<float>(sample) + 1.0f) * seed;
    tap->add_waveform(std::max(0.05f, std::abs(std::sin(phase) * 0.8f + std::cos(phase * 0.37f) * 0.2f)));
  }
}

template <typename T>
void appendLossySamples(const std::array<float, padpilot::ConvolverModuleGraph::kWaveformBins>& waveform, T* out) {
  if (out == nullptr) {
    return;
  }

  for (const auto sample : waveform) {
    out->Add(sample);
  }
}

std::array<float, padpilot::ConvolverModuleGraph::kWaveformBins> buildPseudoSpectrum(
    const std::array<float, padpilot::ConvolverModuleGraph::kWaveformBins>& waveform) {
  constexpr int kBins = padpilot::ConvolverModuleGraph::kWaveformBins;
  std::array<float, kBins> spectrum {};
  float mean = 0.0f;
  for (const auto sample : waveform) {
    mean += sample;
  }
  mean /= static_cast<float>(kBins);

  float maxMagnitude = 0.0001f;
  for (int bin = 0; bin < kBins; ++bin) {
    float real = 0.0f;
    float imag = 0.0f;
    for (int index = 0; index < kBins; ++index) {
      const float centered = waveform[static_cast<std::size_t>(index)] - mean;
      const float window = 0.54f - 0.46f * std::cos((juce::MathConstants<float>::twoPi * static_cast<float>(index)) / static_cast<float>(kBins - 1));
      const float phase = (juce::MathConstants<float>::twoPi * static_cast<float>(bin) * static_cast<float>(index)) / static_cast<float>(kBins);
      const float windowed = centered * window;
      real += windowed * std::cos(phase);
      imag -= windowed * std::sin(phase);
    }
    spectrum[static_cast<std::size_t>(bin)] = std::sqrt(real * real + imag * imag) / static_cast<float>(kBins);
    maxMagnitude = std::max(maxMagnitude, spectrum[static_cast<std::size_t>(bin)]);
  }

  for (auto& sample : spectrum) {
    sample = std::clamp(sample / maxMagnitude, 0.0f, 1.0f);
  }

  return spectrum;
}

template <typename T>
void appendPseudoSpectrum(const std::array<float, padpilot::ConvolverModuleGraph::kWaveformBins>& waveform, T* out) {
  if (out == nullptr) {
    return;
  }

  const auto spectrum = buildPseudoSpectrum(waveform);
  for (const auto sample : spectrum) {
    out->Add(sample);
  }
}

const padpilot::fx::NodeState* findNodeState(const padpilot::fx::FxChainState& state, std::uint32_t chainId, std::uint32_t nodeId) {
  for (const auto& chain : state.chains()) {
    if (chain.id() != chainId) {
      continue;
    }
    for (const auto& node : chain.nodes()) {
      if (node.id() == nodeId) {
        return &node;
      }
    }
  }
  return nullptr;
}
}  // namespace

padpilot::fx::FxNodeType nodeTypeFromString(const juce::String& type) {
  const auto normalized = type.toLowerCase();
  if (normalized.contains("delay")) {
    return padpilot::fx::FX_NODE_TYPE_DELAY;
  }
  if (normalized.contains("reverb")) {
    return padpilot::fx::FX_NODE_TYPE_REVERB;
  }
  if (normalized.contains("mod")) {
    return padpilot::fx::FX_NODE_TYPE_CHORUS;
  }
  if (normalized == "eq") {
    return padpilot::fx::FX_NODE_TYPE_EQ;
  }
  if (normalized.contains("compress")) {
    return padpilot::fx::FX_NODE_TYPE_COMPRESSOR;
  }
  if (normalized.contains("gate")) {
    return padpilot::fx::FX_NODE_TYPE_NOISE_GATE;
  }
  if (normalized.contains("convol")) {
    return padpilot::fx::FX_NODE_TYPE_CONVOLVER;
  }
  return padpilot::fx::FX_NODE_TYPE_UNSPECIFIED;
}

padpilot::fx::FxChainState createDefaultFxChainState() {
  padpilot::fx::FxChainState state;
  state.set_schema_version(kSchemaVersion);
  state.set_revision(1);
  state.set_selected_preset_id("factory-cinematic");
  auto* master = state.mutable_master();
  master->set_input_gain_db(0.0f);
  master->set_output_gain_db(0.0f);
  master->set_wet_dry(1.0f);
  master->set_gain_reduction_db(0.0f);

  *state.add_chains() = makeChain(
      1,
      "Cinematic Impact",
      0,
      0.8f,
      {
          makeNode(1, padpilot::fx::FX_NODE_TYPE_EQ, "EQ", {
              makeParam(1, "Freq", 1200.0f, 20.0f, 12000.0f, "Hz"),
              makeParam(2, "Gain", 0.0f, -18.0f, 18.0f, "dB"),
              makeParam(3, "Q", 1.1f, 0.1f, 12.0f, "Q"),
          }),
          makeNode(2, padpilot::fx::FX_NODE_TYPE_REVERB, "Reverb", {
              makeParam(1, "Decay", 0.6f, 0.2f, 12.0f, "s"),
              makeParam(2, "Size", 0.72f, 0.0f, 1.0f, "%"),
              makeParam(3, "Mix", 0.45f, 0.0f, 1.0f, "%"),
              makeParam(4, "Pre-delay", 18.0f, 0.0f, 1000.0f, "ms"),
              makeParam(5, "Pre-delay Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(6, "Pre-delay Division", 4.0f, 0.0f, 10.0f, ""),
              makeParam(7, "Mod Speed", 0.35f, 0.02f, 10.0f, "Hz"),
              makeParam(8, "Mod Speed Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(9, "Mod Speed Division", 8.0f, 0.0f, 19.0f, ""),
          }),
      });
  *state.add_chains() = makeChain(
      2,
      "Foley Crunch",
      1,
      0.65f,
      {
          makeNode(1, padpilot::fx::FX_NODE_TYPE_DELAY, "Delay", {
              makeParam(1, "Time", 0.35f, 0.05f, 1.5f, "s"),
              makeParam(2, "Feedback", 0.42f, 0.0f, 0.95f, "%"),
              makeParam(3, "Mix", 0.4f, 0.0f, 1.0f, "%"),
              makeParam(4, "Time Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(5, "Time Division", 8.0f, 0.0f, 10.0f, ""),
          }),
          makeNode(2, padpilot::fx::FX_NODE_TYPE_EQ, "EQ", {
              makeParam(1, "Freq", 1200.0f, 20.0f, 12000.0f, "Hz"),
              makeParam(2, "Gain", 0.0f, -18.0f, 18.0f, "dB"),
              makeParam(3, "Q", 1.1f, 0.1f, 12.0f, "Q"),
          }),
      });
  *state.add_chains() = makeChain(
      3,
      "Atmosphere",
      2,
      0.65f,
      {
          makeNode(1, padpilot::fx::FX_NODE_TYPE_DELAY, "Delay", {
              makeParam(1, "Time", 0.35f, 0.05f, 1.5f, "s"),
              makeParam(2, "Feedback", 0.42f, 0.0f, 0.95f, "%"),
              makeParam(3, "Mix", 0.4f, 0.0f, 1.0f, "%"),
              makeParam(4, "Time Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(5, "Time Division", 8.0f, 0.0f, 10.0f, ""),
          }),
          makeNode(2, padpilot::fx::FX_NODE_TYPE_CHORUS, "Chorus", {
              makeParam(1, "Rate", 0.65f, 0.05f, 10.0f, "Hz"),
              makeParam(2, "Depth", 0.35f, 0.0f, 1.0f, "%"),
              makeParam(3, "Feedback", 0.1f, 0.0f, 0.95f, "%"),
              makeParam(4, "Rate Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(5, "Rate Division", 6.0f, 0.0f, 19.0f, ""),
              makeParam(6, "Voice Delay", 14.0f, 1.0f, 40.0f, "ms"),
              makeParam(7, "Voice Delay Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(8, "Voice Delay Division", 1.0f, 0.0f, 10.0f, ""),
          }),
          makeNode(3, padpilot::fx::FX_NODE_TYPE_REVERB, "Reverb", {
              makeParam(1, "Decay", 0.6f, 0.2f, 12.0f, "s"),
              makeParam(2, "Size", 0.72f, 0.0f, 1.0f, "%"),
              makeParam(3, "Mix", 0.45f, 0.0f, 1.0f, "%"),
              makeParam(4, "Pre-delay", 18.0f, 0.0f, 1000.0f, "ms"),
              makeParam(5, "Pre-delay Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(6, "Pre-delay Division", 4.0f, 0.0f, 10.0f, ""),
              makeParam(7, "Mod Speed", 0.35f, 0.02f, 10.0f, "Hz"),
              makeParam(8, "Mod Speed Sync", 0.0f, 0.0f, 1.0f, ""),
              makeParam(9, "Mod Speed Division", 8.0f, 0.0f, 19.0f, ""),
          }),
      });
  return state;
}

padpilot::fx::FxChainState migrateLegacyJsonToFxChainState(const std::string& payloadJson,
                                                           const std::string& selectedPresetId) {
  auto state = createDefaultFxChainState();
  state.set_selected_preset_id(selectedPresetId);

  const auto parsed = juce::JSON::parse(juce::String(payloadJson));
  if (!parsed.isObject()) {
    return state;
  }

  const auto* root = parsed.getDynamicObject();
  if (root == nullptr) {
    return state;
  }

  state.clear_chains();
  if (const auto chainsVar = root->getProperty("chains"); chainsVar.isArray()) {
    const auto* chains = chainsVar.getArray();
    std::uint32_t order = 0;
    for (const auto& chainVar : *chains) {
      if (order >= static_cast<std::uint32_t>(padpilot::ConvolverModuleGraph::kMaxChains)) {
        break;
      }
      const auto* chainObject = chainVar.getDynamicObject();
      if (chainObject == nullptr) {
        continue;
      }

      const auto chainTypeValue = chainObject->getProperty("type");
      const auto chainType = chainTypeValue.isString() && chainTypeValue.toString().length() <= 64
                                 ? chainTypeValue.toString()
                                 : juce::String {};
      const auto parsedChainId = padpilot::readBoundedJsonUInt(chainObject->getProperty("id"), 0xffU);
      const auto chainId = parsedChainId.value_or(0U);
      auto chain = makeChain(
          chainId == 0 ? order + 1 : chainId,
          chainType.isNotEmpty() ? chainType.toStdString() : std::string("Chain ") + std::to_string(order + 1),
          order,
          std::clamp(getOptionalNumber(chainObject->getProperty("mix"), 0.65f), 0.0f, 1.0f),
          { makeNode(1, nodeTypeFromString(chainType), chainType.isNotEmpty() ? chainType.toStdString() : "Node", {}) });
      chain.set_muted(!static_cast<bool>(chainObject->getProperty("enabled")));
      chain.set_solo(false);
      ++order;
      *state.add_chains() = chain;
    }

    if (state.chains_size() > 0) {
      return state;
    }
  }

  const struct LegacyNodeSpec {
    const char* key;
    const char* name;
    padpilot::fx::FxNodeType type;
  } specs[] = {
      {"delay", "Delay", padpilot::fx::FX_NODE_TYPE_DELAY},
      {"reverb", "Reverb", padpilot::fx::FX_NODE_TYPE_REVERB},
      {"modulation", "Chorus", padpilot::fx::FX_NODE_TYPE_CHORUS},
      {"eq", "EQ", padpilot::fx::FX_NODE_TYPE_EQ},
  };

  std::uint32_t order = 0;
  for (const auto& spec : specs) {
    const auto nodeVar = root->getProperty(spec.key);
    if (!nodeVar.isObject()) {
      continue;
    }

    auto chain = makeChain(order + 1, spec.name, order, 0.65f, { makeNode(1, spec.type, spec.name, {}) });
    auto* node = chain.mutable_nodes(0);
    if (spec.type == padpilot::fx::FX_NODE_TYPE_DELAY) {
      *node = makeNode(1, spec.type, spec.name, {
          makeParam(1, "Time", 0.35f, 0.05f, 1.5f, "s"),
          makeParam(2, "Feedback", 0.42f, 0.0f, 0.95f, "%"),
          makeParam(3, "Mix", 0.4f, 0.0f, 1.0f, "%"),
          makeParam(4, "Time Sync", 0.0f, 0.0f, 1.0f, ""),
          makeParam(5, "Time Division", 8.0f, 0.0f, 10.0f, ""),
      });
    } else if (spec.type == padpilot::fx::FX_NODE_TYPE_REVERB) {
      *node = makeNode(1, spec.type, spec.name, {
          makeParam(1, "Decay", 0.6f, 0.2f, 12.0f, "s"),
          makeParam(2, "Size", 0.72f, 0.0f, 1.0f, "%"),
          makeParam(3, "Mix", 0.45f, 0.0f, 1.0f, "%"),
          makeParam(4, "Pre-delay", 18.0f, 0.0f, 1000.0f, "ms"),
          makeParam(5, "Pre-delay Sync", 0.0f, 0.0f, 1.0f, ""),
          makeParam(6, "Pre-delay Division", 4.0f, 0.0f, 10.0f, ""),
          makeParam(7, "Mod Speed", 0.35f, 0.02f, 10.0f, "Hz"),
          makeParam(8, "Mod Speed Sync", 0.0f, 0.0f, 1.0f, ""),
          makeParam(9, "Mod Speed Division", 8.0f, 0.0f, 19.0f, ""),
      });
    } else if (spec.type == padpilot::fx::FX_NODE_TYPE_CHORUS) {
      *node = makeNode(1, spec.type, spec.name, {
          makeParam(1, "Rate", 0.65f, 0.05f, 10.0f, "Hz"),
          makeParam(2, "Depth", 0.35f, 0.0f, 1.0f, "%"),
          makeParam(3, "Feedback", 0.1f, 0.0f, 0.95f, "%"),
          makeParam(4, "Rate Sync", 0.0f, 0.0f, 1.0f, ""),
          makeParam(5, "Rate Division", 6.0f, 0.0f, 19.0f, ""),
          makeParam(6, "Voice Delay", 14.0f, 1.0f, 40.0f, "ms"),
          makeParam(7, "Voice Delay Sync", 0.0f, 0.0f, 1.0f, ""),
          makeParam(8, "Voice Delay Division", 1.0f, 0.0f, 10.0f, ""),
      });
    } else if (spec.type == padpilot::fx::FX_NODE_TYPE_EQ) {
      *node = makeNode(1, spec.type, spec.name, {
          makeParam(1, "Freq", 1200.0f, 20.0f, 12000.0f, "Hz"),
          makeParam(2, "Gain", 0.0f, -18.0f, 18.0f, "dB"),
          makeParam(3, "Q", 1.1f, 0.1f, 12.0f, "Q"),
      });
    }

    setNodeParamsFromLegacyObject(nodeVar.getDynamicObject(), node);
    ++order;
    *state.add_chains() = chain;
  }

  if (const auto globalMixVar = root->getProperty("globalMix"); state.chains_size() > 0) {
    const auto globalMix = padpilot::readBoundedJsonFloat(globalMixVar, 0.0f, 1.0f);
    if (!globalMix.has_value()) {
      return state;
    }
    state.mutable_master()->set_wet_dry(*globalMix);
    for (int index = 0; index < state.chains_size(); ++index) {
      state.mutable_chains(index)->set_mix(*globalMix);
    }
  }

  if (state.chains_size() == 0) {
    return createDefaultFxChainState();
  }

  return state;
}

std::string serializeFxChainState(const padpilot::fx::FxChainState& state) {
  std::string bytes;
  state.SerializeToString(&bytes);
  return bytes;
}

bool parseFxChainState(const std::string& bytes, padpilot::fx::FxChainState* state) {
  return state != nullptr && preflightFxChainStateWire(bytes) && state->ParseFromString(bytes);
}

void syncNodeConfigFromLegacyParams(padpilot::fx::NodeState* node) {
  populateNodeConfigFromLegacyParams(node);
}

std::string buildVisualizerFrameBase64(const padpilot::fx::FxChainState& state,
                                       const padpilot::ConvolverModuleGraph::TimingSnapshot& timing,
                                       std::uint64_t sequence) {
  juce::ignoreUnused(state);
  padpilot::fx::VisualizerFrame frame;
  frame.set_sequence(sequence);
  frame.set_master_input_peak_db(timing.inputPeakDb);
  frame.set_master_input_peak_db_left(timing.inputPeakDbLeft);
  frame.set_master_input_peak_db_right(timing.inputPeakDbRight);
  frame.set_master_output_peak_db(timing.outputPeakDb);
  frame.set_master_output_peak_db_left(timing.outputPeakDbLeft);
  frame.set_master_output_peak_db_right(timing.outputPeakDbRight);
  frame.set_gain_reduction_db(0.0f);

  for (const auto& chain : timing.chains) {
    if (!chain.active) {
      continue;
    }

    for (const auto& node : chain.nodes) {
      if (!node.active) {
        continue;
      }

      auto* tap = frame.add_taps();
      tap->set_chain_id(node.chainId);
      tap->set_node_id(node.nodeId);
      tap->set_input_peak_db(node.inputPeakDb);
      tap->set_input_peak_db_left(node.inputPeakDbLeft);
      tap->set_input_peak_db_right(node.inputPeakDbRight);
      tap->set_output_peak_db(node.outputPeakDb);
      tap->set_output_peak_db_left(node.outputPeakDbLeft);
      tap->set_output_peak_db_right(node.outputPeakDbRight);
      for (const auto sample : node.outputWaveform) {
        tap->add_waveform(sample);
      }

      auto* nodeFrame = frame.add_node_frames();
      nodeFrame->set_chain_id(node.chainId);
      nodeFrame->set_node_id(node.nodeId);
      nodeFrame->set_input_peak_db(node.inputPeakDb);
      nodeFrame->set_input_peak_db_left(node.inputPeakDbLeft);
      nodeFrame->set_input_peak_db_right(node.inputPeakDbRight);
      nodeFrame->set_output_peak_db(node.outputPeakDb);
      nodeFrame->set_output_peak_db_left(node.outputPeakDbLeft);
      nodeFrame->set_output_peak_db_right(node.outputPeakDbRight);

      const auto* sourceNode = findNodeState(state, node.chainId, node.nodeId);
      const auto type = sourceNode != nullptr ? sourceNode->type() : padpilot::fx::FX_NODE_TYPE_UNSPECIFIED;
      switch (type) {
        case padpilot::fx::FX_NODE_TYPE_COMPRESSOR: {
          auto* payload = nodeFrame->mutable_compressor();
          const auto inputSpectrum = buildPseudoSpectrum(node.inputWaveform);
          const auto outputSpectrum = buildPseudoSpectrum(node.outputWaveform);
          for (const auto sample : inputSpectrum) {
            payload->mutable_input_curve()->Add(sample);
          }
          for (int bin = 0; bin < padpilot::ConvolverModuleGraph::kWaveformBins; ++bin) {
            payload->add_gain_curve(
                outputSpectrum[static_cast<std::size_t>(bin)] - inputSpectrum[static_cast<std::size_t>(bin)]);
          }
          const bool expansionMode = sourceNode != nullptr && sourceNode->has_compressor_config() && sourceNode->compressor_config().ratio() < 1.0f;
          const float gainDelta = node.inputPeakDb - node.outputPeakDb;
          payload->set_expansion_mode(expansionMode);
          payload->set_low_gain_reduction_db(gainDelta);
          payload->set_mid_gain_reduction_db(gainDelta * 0.85f);
          payload->set_high_gain_reduction_db(gainDelta * 0.7f);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_EQ: {
          auto* payload = nodeFrame->mutable_eq();
          appendPseudoSpectrum(node.outputWaveform, payload->mutable_spectrum_bins());
          appendPseudoSpectrum(node.outputWaveform, payload->mutable_response_curve());
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER: {
          auto* payload = nodeFrame->mutable_transient_shaper();
          appendLossySamples(node.inputWaveform, payload->mutable_original_envelope());
          appendLossySamples(node.outputWaveform, payload->mutable_shaped_envelope());
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_NOISE_GATE: {
          auto* payload = nodeFrame->mutable_noise_gate();
          payload->set_gate_open(node.outputPeakDb > -50.0f);
          payload->set_signal_level_db(node.outputPeakDb);
          payload->set_threshold_db(sourceNode != nullptr && sourceNode->has_noise_gate_config()
                                        ? sourceNode->noise_gate_config().threshold_db()
                                        : -36.0f);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_DELAY: {
          auto* payload = nodeFrame->mutable_delay();
          for (int index = 0; index < static_cast<int>(node.outputWaveform.size()); ++index) {
            payload->add_tap_positions(static_cast<float>(index) / static_cast<float>(node.outputWaveform.size()));
            payload->add_tap_levels(node.outputWaveform[static_cast<std::size_t>(index)]);
          }
          payload->set_grain_mode(false);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_REVERB: {
          auto* payload = nodeFrame->mutable_reverb();
          const float diffusion = std::clamp((node.outputPeakDb + 60.0f) / 60.0f, 0.0f, 1.0f);
          payload->set_diffusion(diffusion);
          payload->set_texture(sourceNode != nullptr && sourceNode->has_reverb_config() ? sourceNode->reverb_config().damping() : 0.5f);
          payload->set_shimmer(0.0f);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_CONVOLVER: {
          appendLossySamples(node.outputWaveform, nodeFrame->mutable_convolver()->mutable_ir_waveform());
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION: {
          auto* payload = nodeFrame->mutable_tape_saturation();
          payload->set_reel_rotation(static_cast<float>(sequence % 360U));
          payload->set_flux(std::clamp((node.outputPeakDb + 60.0f) / 60.0f, 0.0f, 1.0f));
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_BITCRUSHER: {
          auto* payload = nodeFrame->mutable_bitcrusher();
          appendLossySamples(node.outputWaveform, payload->mutable_aliased_waveform());
          payload->set_stair_step_amount(0.5f);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_EXCITER: {
          appendLossySamples(node.outputWaveform, nodeFrame->mutable_exciter()->mutable_generated_harmonics());
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_CHORUS: {
          auto* payload = nodeFrame->mutable_chorus();
          if (sourceNode != nullptr && sourceNode->has_chorus_config()) {
            payload->add_phase_offsets(0.0f);
            payload->add_phase_offsets(std::clamp(sourceNode->chorus_config().width(), 0.0f, 1.0f) * 0.5f);
          } else {
            appendLossySamples(node.outputWaveform, payload->mutable_phase_offsets());
          }
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_PHASER: {
          appendLossySamples(node.outputWaveform,
                             nodeFrame->mutable_phaser()->mutable_comb_response());
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_AUTO_PAN: {
          nodeFrame->mutable_auto_pan()->set_pan_position(node.motionValue);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER: {
          auto* payload = nodeFrame->mutable_rotary_speaker();
          const float normalized = std::clamp(node.motionValue * 0.5f + 0.5f, 0.0f, 1.0f);
          payload->set_horn_angle(normalized);
          payload->set_drum_angle(std::fmod(normalized * 0.86f, 1.0f));
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER: {
          constexpr float kInvSqrt2 = 0.70710678118f;
          float maxAbs = 0.0f;
          for (int bin = 0; bin < padpilot::ConvolverModuleGraph::kWaveformBins; ++bin) {
            const float left = node.leftSignedWaveform[static_cast<std::size_t>(bin)];
            const float right = node.rightSignedWaveform[static_cast<std::size_t>(bin)];
            const float x = (right - left) * kInvSqrt2;
            const float y = (left + right) * kInvSqrt2;
            maxAbs = std::max(maxAbs, std::abs(x));
            maxAbs = std::max(maxAbs, std::abs(y));
          }
          maxAbs = std::max(maxAbs, 0.0001f);
          auto* payload = nodeFrame->mutable_stereo_imager();
          for (int bin = 0; bin < padpilot::ConvolverModuleGraph::kWaveformBins; ++bin) {
            const float left = node.leftSignedWaveform[static_cast<std::size_t>(bin)];
            const float right = node.rightSignedWaveform[static_cast<std::size_t>(bin)];
            const float x = ((right - left) * kInvSqrt2) / maxAbs;
            const float y = ((left + right) * kInvSqrt2) / maxAbs;
            payload->add_vectorscope_points(std::clamp(x, -1.0f, 1.0f));
            payload->add_vectorscope_points(std::clamp(y, -1.0f, 1.0f));
          }
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT: {
          nodeFrame->mutable_pitch_drift()->add_drift_cents(node.motionValue);
          break;
        }
        case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
        default:
          break;
      }
    }
  }

  std::string bytes;
  frame.SerializeToString(&bytes);
  return bytesToBase64(bytes);
}

bool parsePresetSaveRequestBase64(const std::string& payloadBase64,
                                  padpilot::bridge::PresetSaveRequest* request) {
  if (request == nullptr || payloadBase64.empty() ||
      payloadBase64.size() > kMaxBridgeProtoRequestBase64Chars) {
    return false;
  }
  std::string bytes;
  return base64ToBytes(payloadBase64, &bytes) &&
         bytes.size() <= kMaxBridgeProtoRequestBytes &&
         preflightPresetSaveRequestWire(bytes) && request->ParseFromString(bytes);
}

bool parseSetModuleStateRequestBase64(const std::string& payloadBase64,
                                      padpilot::bridge::SetModuleStateRequest* request) {
  if (request == nullptr || payloadBase64.empty() ||
      payloadBase64.size() > kMaxBridgeProtoRequestBase64Chars) {
    return false;
  }
  std::string bytes;
  return base64ToBytes(payloadBase64, &bytes) &&
         bytes.size() <= kMaxBridgeProtoRequestBytes &&
         preflightSetModuleStateRequestWire(bytes) && request->ParseFromString(bytes);
}

}  // namespace padpilot::proto




