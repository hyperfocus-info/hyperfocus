#include "audio/fx-state-validation.h"
#include "core/pad-pilot-processor-internal.h"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <limits>
#include <vector>

#include <Windows.h>

#include <juce_audio_processors/juce_audio_processors.h>

#include "runtime/fx-chain-proto.h"

namespace {
using padpilot::processor_detail::encodeNodeTargetId;


thread_local const PadPilotAudioProcessor* callbackSuppressionOwner = nullptr;

class ScopedParameterCallbackSuppression {
 public:
  explicit ScopedParameterCallbackSuppression(const PadPilotAudioProcessor* owner)
      : previousOwner_(callbackSuppressionOwner) {
    callbackSuppressionOwner = owner;
  }

  ~ScopedParameterCallbackSuppression() { callbackSuppressionOwner = previousOwner_; }

 private:
  const PadPilotAudioProcessor* previousOwner_{nullptr};
};

padpilot::fx::ChainState* findChainById(padpilot::fx::FxChainState& state, std::uint32_t chainId) {
  for (int index = 0; index < state.chains_size(); ++index) {
    auto* chain = state.mutable_chains(index);
    if (chain != nullptr && chain->id() == chainId) {
      return chain;
    }
  }
  return nullptr;
}

padpilot::fx::NodeState* findNodeById(padpilot::fx::ChainState* chain, std::uint32_t nodeId) {
  if (chain == nullptr) {
    return nullptr;
  }

  for (int index = 0; index < chain->nodes_size(); ++index) {
    auto* node = chain->mutable_nodes(index);
    if (node != nullptr && node->id() == nodeId) {
      return node;
    }
  }
  return nullptr;
}

padpilot::fx::NodeParamState* findLegacyParam(padpilot::fx::NodeState* node, std::uint32_t parameterId) {
  if (node == nullptr) {
    return nullptr;
  }

  for (int index = 0; index < node->legacy_params_size(); ++index) {
    auto* param = node->mutable_legacy_params(index);
    if (param != nullptr && param->parameter_id() == parameterId) {
      return param;
    }
  }
  return nullptr;
}

padpilot::fx::NodeState stripSupportedRuntimeFields(const padpilot::fx::NodeState& input) {
  auto copy = input;
  copy.set_id(0);
  copy.set_order(0);
  copy.set_name("");
  copy.set_bypassed(false);
  copy.set_muted(false);
  copy.set_solo(false);
  copy.set_mix(0.0f);
  copy.set_selected_preset_id("");

  const auto normalizeMirroredParameter = [&copy](std::uint32_t parameterId, float expectedValue) {
    for (int index = 0; index < copy.legacy_params_size(); ++index) {
      auto* parameter = copy.mutable_legacy_params(index);
      if (parameter->parameter_id() != parameterId) {
        continue;
      }
      if (std::abs(parameter->value() - expectedValue) > 0.0001f) {
        return false;
      }
      parameter->set_value(0.0f);
      return true;
    }
    return false;
  };

  switch (copy.type()) {
    case padpilot::fx::FX_NODE_TYPE_DELAY:
      if (copy.has_delay_config()) {
        auto* config = copy.mutable_delay_config();
        if (normalizeMirroredParameter(1, config->time())) config->set_time(0.0f);
        if (normalizeMirroredParameter(2, config->feedback())) config->set_feedback(0.0f);
        if (normalizeMirroredParameter(3, config->focus_mix())) config->set_focus_mix(0.0f);
        if (config->has_time_sync()) {
          if (normalizeMirroredParameter(4, config->time_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_time_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(5, static_cast<float>(config->time_sync().division_index()))) {
            config->mutable_time_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_REVERB:
      if (copy.has_reverb_config()) {
        auto* config = copy.mutable_reverb_config();
        if (normalizeMirroredParameter(1, config->decay())) config->set_decay(0.0f);
        if (normalizeMirroredParameter(2, config->size())) config->set_size(0.0f);
        if (normalizeMirroredParameter(3, config->focus_mix())) config->set_focus_mix(0.0f);
        if (normalizeMirroredParameter(4, config->pre_delay_ms())) config->set_pre_delay_ms(0.0f);
        if (config->has_pre_delay_sync()) {
          if (normalizeMirroredParameter(5, config->pre_delay_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_pre_delay_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(6, static_cast<float>(config->pre_delay_sync().division_index()))) {
            config->mutable_pre_delay_sync()->set_division_index(0);
          }
        }
        if (normalizeMirroredParameter(7, config->modulation_speed_hz())) {
          config->set_modulation_speed_hz(0.0f);
        }
        if (config->has_modulation_speed_sync()) {
          if (normalizeMirroredParameter(8, config->modulation_speed_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_modulation_speed_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(9, static_cast<float>(config->modulation_speed_sync().division_index()))) {
            config->mutable_modulation_speed_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_CHORUS:
      if (copy.has_chorus_config()) {
        auto* config = copy.mutable_chorus_config();
        if (normalizeMirroredParameter(1, config->rate_hz())) config->set_rate_hz(0.0f);
        if (normalizeMirroredParameter(2, config->depth())) config->set_depth(0.0f);
        if (normalizeMirroredParameter(3, config->feedback())) config->set_feedback(0.0f);
        if (config->has_rate_sync()) {
          if (normalizeMirroredParameter(4, config->rate_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_rate_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(5, static_cast<float>(config->rate_sync().division_index()))) {
            config->mutable_rate_sync()->set_division_index(0);
          }
        }
        if (normalizeMirroredParameter(6, config->voice_delay_ms())) {
          config->set_voice_delay_ms(0.0f);
        }
        if (config->has_voice_delay_sync()) {
          if (normalizeMirroredParameter(7, config->voice_delay_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_voice_delay_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(8, static_cast<float>(config->voice_delay_sync().division_index()))) {
            config->mutable_voice_delay_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_EQ:
      if (copy.has_eq_config() && copy.eq_config().bands_size() > 0) {
        auto* band = copy.mutable_eq_config()->mutable_bands(0);
        if (normalizeMirroredParameter(1, band->frequency_hz())) band->set_frequency_hz(0.0f);
        if (normalizeMirroredParameter(2, band->gain_db())) band->set_gain_db(0.0f);
        if (normalizeMirroredParameter(3, band->q())) band->set_q(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_COMPRESSOR:
      if (copy.has_compressor_config()) {
        auto* config = copy.mutable_compressor_config();
        if (normalizeMirroredParameter(1, config->threshold_db())) config->set_threshold_db(0.0f);
        if (normalizeMirroredParameter(2, config->ratio())) config->set_ratio(0.0f);
        if (normalizeMirroredParameter(3, config->makeup_db())) config->set_makeup_db(0.0f);
        if (normalizeMirroredParameter(4, config->attack_ms())) config->set_attack_ms(0.0f);
        if (normalizeMirroredParameter(5, config->release_ms())) config->set_release_ms(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
      if (copy.has_transient_shaper_config()) {
        auto* config = copy.mutable_transient_shaper_config();
        if (normalizeMirroredParameter(1, config->attack())) config->set_attack(0.0f);
        if (normalizeMirroredParameter(2, config->sustain())) config->set_sustain(0.0f);
        if (normalizeMirroredParameter(3, config->gain_db())) config->set_gain_db(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_NOISE_GATE:
      if (copy.has_noise_gate_config()) {
        auto* config = copy.mutable_noise_gate_config();
        if (normalizeMirroredParameter(1, config->threshold_db())) config->set_threshold_db(0.0f);
        if (normalizeMirroredParameter(2, config->range_db())) config->set_range_db(0.0f);
        if (normalizeMirroredParameter(3, config->release_ms())) config->set_release_ms(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_TAPE_SATURATION:
      if (copy.has_tape_saturation_config()) {
        auto* config = copy.mutable_tape_saturation_config();
        if (normalizeMirroredParameter(1, config->drive())) config->set_drive(0.0f);
        if (normalizeMirroredParameter(2, config->warmth())) config->set_warmth(0.0f);
        if (normalizeMirroredParameter(3, config->bias())) config->set_bias(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_BITCRUSHER:
      if (copy.has_bitcrusher_config()) {
        auto* config = copy.mutable_bitcrusher_config();
        if (normalizeMirroredParameter(1, config->bits())) config->set_bits(0.0f);
        if (normalizeMirroredParameter(2, config->downsample())) config->set_downsample(0.0f);
        if (normalizeMirroredParameter(3, config->wet_dry())) config->set_wet_dry(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_EXCITER:
      if (copy.has_exciter_config()) {
        auto* config = copy.mutable_exciter_config();
        if (normalizeMirroredParameter(1, config->harmonic_drive())) config->set_harmonic_drive(0.0f);
        if (normalizeMirroredParameter(2, config->mix())) config->set_mix(0.0f);
        if (normalizeMirroredParameter(3, config->odd_even_balance())) {
          config->set_odd_even_balance(0.0f);
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_AUTO_PAN:
      if (copy.has_auto_pan_config()) {
        auto* config = copy.mutable_auto_pan_config();
        if (normalizeMirroredParameter(1, config->rate_hz())) config->set_rate_hz(0.0f);
        if (normalizeMirroredParameter(2, config->amount())) config->set_amount(0.0f);
        if (normalizeMirroredParameter(3, config->phase_offset())) config->set_phase_offset(0.0f);
        if (config->has_rate_sync()) {
          if (normalizeMirroredParameter(4, config->rate_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_rate_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(5, static_cast<float>(config->rate_sync().division_index()))) {
            config->mutable_rate_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_PHASER:
      if (copy.has_phaser_config()) {
        auto* config = copy.mutable_phaser_config();
        if (normalizeMirroredParameter(1, config->speed_hz())) config->set_speed_hz(0.0f);
        if (normalizeMirroredParameter(2, config->center_frequency_hz())) config->set_center_frequency_hz(0.0f);
        if (normalizeMirroredParameter(3, config->resonance())) config->set_resonance(0.0f);
        if (config->has_speed_sync()) {
          if (normalizeMirroredParameter(4, config->speed_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_speed_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(5, static_cast<float>(config->speed_sync().division_index()))) {
            config->mutable_speed_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER:
      if (copy.has_rotary_speaker_config()) {
        auto* config = copy.mutable_rotary_speaker_config();
        if (normalizeMirroredParameter(1, config->fast() ? 1.0f : 0.0f)) config->set_fast(false);
        if (normalizeMirroredParameter(2, config->drive())) config->set_drive(0.0f);
        if (normalizeMirroredParameter(3, config->horn_drum_balance())) config->set_horn_drum_balance(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT:
      if (copy.has_pitch_drift_config()) {
        auto* config = copy.mutable_pitch_drift_config();
        if (normalizeMirroredParameter(1, config->depth())) config->set_depth(0.0f);
        if (normalizeMirroredParameter(2, config->rate_hz())) config->set_rate_hz(0.0f);
        if (normalizeMirroredParameter(3, config->range_cents())) config->set_range_cents(0.0f);
        if (config->has_rate_sync()) {
          if (normalizeMirroredParameter(4, config->rate_sync().enabled() ? 1.0f : 0.0f)) {
            config->mutable_rate_sync()->set_enabled(false);
          }
          if (normalizeMirroredParameter(5, static_cast<float>(config->rate_sync().division_index()))) {
            config->mutable_rate_sync()->set_division_index(0);
          }
        }
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER:
      if (copy.has_stereo_imager_config()) {
        auto* config = copy.mutable_stereo_imager_config();
        if (normalizeMirroredParameter(1, config->width_percent())) config->set_width_percent(0.0f);
        if (normalizeMirroredParameter(2, config->stereo_balance())) {
          config->set_stereo_balance(0.0f);
        }
        if (normalizeMirroredParameter(3, config->pan())) config->set_pan(0.0f);
      }
      break;
    case padpilot::fx::FX_NODE_TYPE_CONVOLVER:
    case padpilot::fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      break;
  }
  return copy;
}

std::optional<std::uint16_t> parseVirtualKey(const juce::String& rawToken) {
  const auto token = rawToken.trim();
  if (token.isEmpty()) {
    return std::nullopt;
  }

  if (token.equalsIgnoreCase("Mod") || token.equalsIgnoreCase("Control") || token.equalsIgnoreCase("Ctrl")) {
    return static_cast<std::uint16_t>(VK_CONTROL);
  }
  if (token.equalsIgnoreCase("Shift")) {
    return static_cast<std::uint16_t>(VK_SHIFT);
  }
  if (token.equalsIgnoreCase("Alt") || token.equalsIgnoreCase("Option")) {
    return static_cast<std::uint16_t>(VK_MENU);
  }
  if (token.equalsIgnoreCase("Meta") || token.equalsIgnoreCase("Command") || token.equalsIgnoreCase("Cmd") ||
      token.equalsIgnoreCase("Win")) {
    return static_cast<std::uint16_t>(VK_LWIN);
  }
  if (token.equalsIgnoreCase("Enter") || token.equalsIgnoreCase("Return")) {
    return static_cast<std::uint16_t>(VK_RETURN);
  }
  if (token.equalsIgnoreCase("Escape") || token.equalsIgnoreCase("Esc")) {
    return static_cast<std::uint16_t>(VK_ESCAPE);
  }
  if (token.equalsIgnoreCase("Space")) {
    return static_cast<std::uint16_t>(VK_SPACE);
  }
  if (token.equalsIgnoreCase("Tab")) {
    return static_cast<std::uint16_t>(VK_TAB);
  }
  if (token.equalsIgnoreCase("Backspace")) {
    return static_cast<std::uint16_t>(VK_BACK);
  }
  if (token.equalsIgnoreCase("Delete") || token.equalsIgnoreCase("Del")) {
    return static_cast<std::uint16_t>(VK_DELETE);
  }
  if (token.equalsIgnoreCase("ArrowUp") || token.equalsIgnoreCase("Up")) {
    return static_cast<std::uint16_t>(VK_UP);
  }
  if (token.equalsIgnoreCase("ArrowDown") || token.equalsIgnoreCase("Down")) {
    return static_cast<std::uint16_t>(VK_DOWN);
  }
  if (token.equalsIgnoreCase("ArrowLeft") || token.equalsIgnoreCase("Left")) {
    return static_cast<std::uint16_t>(VK_LEFT);
  }
  if (token.equalsIgnoreCase("ArrowRight") || token.equalsIgnoreCase("Right")) {
    return static_cast<std::uint16_t>(VK_RIGHT);
  }
  if (token.equalsIgnoreCase("Home")) {
    return static_cast<std::uint16_t>(VK_HOME);
  }
  if (token.equalsIgnoreCase("End")) {
    return static_cast<std::uint16_t>(VK_END);
  }
  if (token.equalsIgnoreCase("PageUp") || token.equalsIgnoreCase("PgUp")) {
    return static_cast<std::uint16_t>(VK_PRIOR);
  }
  if (token.equalsIgnoreCase("PageDown") || token.equalsIgnoreCase("PgDn")) {
    return static_cast<std::uint16_t>(VK_NEXT);
  }

  if (token.length() == 1) {
    const auto character = juce::CharacterFunctions::toUpperCase(token[0]);
    if (character >= 'A' && character <= 'Z') {
      return static_cast<std::uint16_t>(character);
    }
    if (character >= '0' && character <= '9') {
      return static_cast<std::uint16_t>(character);
    }
  }

  if (token.startsWithIgnoreCase("F")) {
    const auto functionIndex = token.substring(1).getIntValue();
    if (functionIndex >= 1 && functionIndex <= 12) {
      return static_cast<std::uint16_t>(VK_F1 + functionIndex - 1);
    }
  }

  return std::nullopt;
}

bool isModifierToken(const juce::String& token) {
  return token.equalsIgnoreCase("Mod") || token.equalsIgnoreCase("Control") || token.equalsIgnoreCase("Ctrl") ||
         token.equalsIgnoreCase("Shift") || token.equalsIgnoreCase("Alt") || token.equalsIgnoreCase("Option") ||
         token.equalsIgnoreCase("Meta") || token.equalsIgnoreCase("Command") || token.equalsIgnoreCase("Cmd") ||
         token.equalsIgnoreCase("Win");
}

bool appendShortcutActions(const std::string& shortcut, std::vector<padpilot::ScriptAction>& actions) {
  juce::StringArray tokens;
  tokens.addTokens(shortcut, "+", "");
  tokens.trim();
  tokens.removeEmptyStrings();
  if (tokens.isEmpty() || tokens.size() > 8) {
    return false;
  }

  std::vector<std::uint16_t> modifiers;
  std::optional<std::uint16_t> primaryKey;
  for (const auto& token : tokens) {
    const auto keyCode = parseVirtualKey(token);
    if (!keyCode.has_value()) {
      return false;
    }

    if (isModifierToken(token)) {
      modifiers.push_back(*keyCode);
    } else {
      primaryKey = *keyCode;
    }
  }

  for (const auto modifier : modifiers) {
    padpilot::ScriptAction action{};
    action.type = padpilot::ScriptActionType::keystroke;
    action.keyCode = modifier;
    action.isKeyDown = true;
    actions.push_back(action);
  }

  if (primaryKey.has_value()) {
    padpilot::ScriptAction down{};
    down.type = padpilot::ScriptActionType::keystroke;
    down.keyCode = *primaryKey;
    down.isKeyDown = true;
    actions.push_back(down);

    padpilot::ScriptAction up = down;
    up.isKeyDown = false;
    actions.push_back(up);
  }

  for (auto it = modifiers.rbegin(); it != modifiers.rend(); ++it) {
    padpilot::ScriptAction action{};
    action.type = padpilot::ScriptActionType::keystroke;
    action.keyCode = *it;
    action.isKeyDown = false;
    actions.push_back(action);
  }

  return true;
}
}  // namespace

juce::AudioProcessorValueTreeState::ParameterLayout PadPilotAudioProcessor::createParameterLayout() {
  juce::AudioProcessorValueTreeState::ParameterLayout layout;
  layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID(kMasterInputParameterId, 1), "Master Input",
                                                         juce::NormalisableRange<float>(-18.0f, 18.0f), 0.0f));
  layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID(kMasterWetDryParameterId, 1),
                                                         "Master Wet/Dry", juce::NormalisableRange<float>(0.0f, 1.0f),
                                                         1.0f));
  layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID(kMasterOutputParameterId, 1),
                                                         "Master Output", juce::NormalisableRange<float>(-18.0f, 18.0f),
                                                         0.0f));

  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID(getMacroParameterId(slotIndex), 1),
                                                           juce::String::formatted("Macro %02d", slotIndex),
                                                           juce::NormalisableRange<float>(0.0f, 1.0f), 0.0f));
  }

  return layout;
}

juce::String PadPilotAudioProcessor::getMacroParameterId(int slotIndex) {
  return juce::String::formatted("pp.macro.%02d", juce::jlimit(1, kMacroSlotCount, slotIndex));
}

juce::String PadPilotAudioProcessor::getDirectParameterId(AutomationTargetKind targetKind) {
  switch (targetKind) {
    case AutomationTargetKind::masterInputGain:
      return kMasterInputParameterId;
    case AutomationTargetKind::masterWetDry:
      return kMasterWetDryParameterId;
    case AutomationTargetKind::masterOutputGain:
      return kMasterOutputParameterId;
    case AutomationTargetKind::none:
    case AutomationTargetKind::fxChainMix:
    case AutomationTargetKind::fxNodeMix:
    case AutomationTargetKind::fxNodeParamFloat:
    default:
      return {};
  }
}

float PadPilotAudioProcessor::normalizeAutomationValue(float value, float minValue, float maxValue) {
  if (!padpilot::hasFiniteFxValues({value, minValue, maxValue}) || maxValue <= minValue) {
    return 0.0f;
  }
  const auto range = std::max(0.0001f, maxValue - minValue);
  return juce::jlimit(0.0f, 1.0f, (value - minValue) / range);
}

float PadPilotAudioProcessor::denormalizeAutomationValue(float normalizedValue, float minValue, float maxValue) {
  if (!padpilot::hasFiniteFxValues({normalizedValue, minValue, maxValue}) || maxValue <= minValue) {
    return std::isfinite(minValue) ? minValue : 0.0f;
  }
  const auto clamped = juce::jlimit(0.0f, 1.0f, normalizedValue);
  return minValue + (maxValue - minValue) * clamped;
}

bool PadPilotAudioProcessor::isValidFxState(const padpilot::fx::FxChainState& state) {
  constexpr std::uint32_t kMaxEncodedId = 0xffU;
  constexpr std::uint32_t kMaxRealtimeParameterId = 31U;
  if (state.schema_version() == 0 || state.chains_size() > padpilot::ConvolverModuleGraph::kMaxChains) {
    return false;
  }
  if (!state.has_master() ||
      !padpilot::hasFiniteFxValues({state.master().input_gain_db(), state.master().output_gain_db(),
                                    state.master().wet_dry(), state.master().gain_reduction_db()})) {
    return false;
  }

  for (int chainIndex = 0; chainIndex < state.chains_size(); ++chainIndex) {
    const auto& chain = state.chains(chainIndex);
    if (chain.id() > kMaxEncodedId || chain.nodes_size() > padpilot::ConvolverModuleGraph::kMaxNodesPerChain ||
        !std::isfinite(chain.mix())) {
      return false;
    }
    for (int previousChainIndex = 0; previousChainIndex < chainIndex; ++previousChainIndex) {
      if (state.chains(previousChainIndex).id() == chain.id()) {
        return false;
      }
    }

    for (int nodeIndex = 0; nodeIndex < chain.nodes_size(); ++nodeIndex) {
      const auto& node = chain.nodes(nodeIndex);
      if (node.id() > kMaxEncodedId || node.legacy_params_size() > 32 || !std::isfinite(node.mix()) ||
          !padpilot::isValidFxNodeConfig(node, true)) {
        return false;
      }
      for (int previousNodeIndex = 0; previousNodeIndex < nodeIndex; ++previousNodeIndex) {
        if (chain.nodes(previousNodeIndex).id() == node.id()) {
          return false;
        }
      }
      for (int parameterIndex = 0; parameterIndex < node.legacy_params_size(); ++parameterIndex) {
        const auto& parameter = node.legacy_params(parameterIndex);
        if (parameter.parameter_id() > kMaxRealtimeParameterId ||
            !padpilot::hasFiniteFxValues(
                {parameter.value(), parameter.min_value(), parameter.max_value(), parameter.default_value()}) ||
            parameter.min_value() > parameter.max_value() || parameter.value() < parameter.min_value() ||
            parameter.value() > parameter.max_value() || parameter.default_value() < parameter.min_value() ||
            parameter.default_value() > parameter.max_value()) {
          return false;
        }
        for (int previousParameterIndex = 0; previousParameterIndex < parameterIndex; ++previousParameterIndex) {
          if (node.legacy_params(previousParameterIndex).parameter_id() == parameter.parameter_id()) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

bool PadPilotAudioProcessor::isValidManagedFxState(const padpilot::fx::FxChainState& state) const {
  for (const auto& chain : state.chains()) {
    for (const auto& node : chain.nodes()) {
      if (node.type() != padpilot::fx::FX_NODE_TYPE_CONVOLVER || !node.has_convolver_config()) {
        continue;
      }
      const auto& config = node.convolver_config();
      const bool emptyReference =
          config.ir_id().empty() && config.ir_source_path().empty() && config.ir_source_name().empty();
      if (!emptyReference && !managedFileStore_.isManagedImpulseResponse(config.ir_source_path(), config.ir_id(),
                                                                         config.ir_source_name())) {
        return false;
      }
    }
  }
  return true;
}

bool PadPilotAudioProcessor::isValidAutomationBinding(const AutomationBinding& binding) {
  constexpr std::uint32_t kMaxEncodedId = 0xffU;
  constexpr std::uint32_t kMaxRealtimeParameterId = 31U;
  if (!std::isfinite(binding.minValue) || !std::isfinite(binding.maxValue) || binding.minValue >= binding.maxValue) {
    return false;
  }

  switch (binding.targetKind) {
    case AutomationTargetKind::masterInputGain:
    case AutomationTargetKind::masterWetDry:
    case AutomationTargetKind::masterOutputGain:
      return true;
    case AutomationTargetKind::fxChainMix:
      return binding.chainId <= kMaxEncodedId;
    case AutomationTargetKind::fxNodeMix:
      return binding.chainId <= kMaxEncodedId && binding.nodeId <= kMaxEncodedId;
    case AutomationTargetKind::fxNodeParamFloat:
      return binding.chainId <= kMaxEncodedId && binding.nodeId <= kMaxEncodedId &&
             binding.parameterId <= kMaxRealtimeParameterId;
    case AutomationTargetKind::none:
    default:
      return false;
  }
}

void PadPilotAudioProcessor::markFxRuntimeStateDirty() {
  if (fxGraphProcessingActive_.load(std::memory_order_acquire)) {
    fxRuntimeStateDirty_.store(true, std::memory_order_release);
  }
}

void PadPilotAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
  if (callbackSuppressionOwner == this || !std::isfinite(newValue) ||
      !fxGraphProcessingActive_.load(std::memory_order_acquire)) {
    return;
  }

  padpilot::AudioCommand command{};
  if (parameterID == kMasterInputParameterId) {
    markFxRuntimeStateDirty();
    command.type = padpilot::AudioCommandType::setMasterInputGainDb;
    command.value = newValue;
    queueAudioCommand(command);
    return;
  }
  if (parameterID == kMasterWetDryParameterId) {
    markFxRuntimeStateDirty();
    command.type = padpilot::AudioCommandType::setMasterWetDry;
    command.value = newValue;
    queueAudioCommand(command);
    return;
  }
  if (parameterID == kMasterOutputParameterId) {
    markFxRuntimeStateDirty();
    command.type = padpilot::AudioCommandType::setOutputGainDb;
    command.value = newValue;
    queueAudioCommand(command);
    return;
  }

  constexpr char macroPrefix[] = "pp.macro.";
  constexpr int macroPrefixLength = static_cast<int>(sizeof(macroPrefix) - 1);
  if (parameterID.length() <= macroPrefixLength) {
    return;
  }

  for (int prefixIndex = 0; prefixIndex < macroPrefixLength; ++prefixIndex) {
    if (static_cast<std::uint32_t>(parameterID[prefixIndex]) !=
        static_cast<std::uint32_t>(static_cast<unsigned char>(macroPrefix[prefixIndex]))) {
      return;
    }
  }

  int slotIndex = 0;
  for (int digitIndex = macroPrefixLength; digitIndex < parameterID.length(); ++digitIndex) {
    const auto character = static_cast<std::uint32_t>(parameterID[digitIndex]);
    if (character < static_cast<std::uint32_t>('0') || character > static_cast<std::uint32_t>('9')) {
      return;
    }
    slotIndex = slotIndex * 10 + static_cast<int>(character - static_cast<std::uint32_t>('0'));
  }
  if (slotIndex < 1 || slotIndex > kMacroSlotCount) {
    return;
  }

  markFxRuntimeStateDirty();
  queueAutomationCommand(realtimeAutomationBindings_[static_cast<std::size_t>(slotIndex - 1)], newValue);
}

void PadPilotAudioProcessor::queueAutomationCommand(const AutomationBinding& binding, float normalizedValue) {
  if (!binding.isActive()) {
    return;
  }

  RealtimeAutomationBinding realtime{};
  realtime.targetKind.store(static_cast<int>(binding.targetKind), std::memory_order_relaxed);
  realtime.valueKind.store(static_cast<int>(binding.valueKind), std::memory_order_relaxed);
  realtime.chainId.store(binding.chainId, std::memory_order_relaxed);
  realtime.nodeId.store(binding.nodeId, std::memory_order_relaxed);
  realtime.parameterId.store(binding.parameterId, std::memory_order_relaxed);
  realtime.minValue.store(binding.minValue, std::memory_order_relaxed);
  realtime.maxValue.store(binding.maxValue, std::memory_order_relaxed);
  queueAutomationCommand(realtime, normalizedValue);
}

void PadPilotAudioProcessor::queueAutomationCommand(const RealtimeAutomationBinding& binding, float normalizedValue) {
  const auto generationBefore = binding.generation.load(std::memory_order_acquire);
  if ((generationBefore & 1U) != 0U) {
    return;
  }

  const auto targetKind = static_cast<AutomationTargetKind>(binding.targetKind.load(std::memory_order_relaxed));
  if (targetKind == AutomationTargetKind::none) {
    return;
  }

  padpilot::AudioCommand command{};
  const auto minValue = binding.minValue.load(std::memory_order_relaxed);
  const auto maxValue = binding.maxValue.load(std::memory_order_relaxed);
  const auto chainId = binding.chainId.load(std::memory_order_relaxed);
  const auto nodeId = binding.nodeId.load(std::memory_order_relaxed);
  const auto parameterId = binding.parameterId.load(std::memory_order_relaxed);
  if (binding.generation.load(std::memory_order_acquire) != generationBefore) {
    return;
  }
  const auto denormalized = denormalizeAutomationValue(normalizedValue, minValue, maxValue);
  switch (targetKind) {
    case AutomationTargetKind::masterInputGain:
      command.type = padpilot::AudioCommandType::setMasterInputGainDb;
      command.value = denormalized;
      break;
    case AutomationTargetKind::masterWetDry:
      command.type = padpilot::AudioCommandType::setMasterWetDry;
      command.value = denormalized;
      break;
    case AutomationTargetKind::masterOutputGain:
      command.type = padpilot::AudioCommandType::setOutputGainDb;
      command.value = denormalized;
      break;
    case AutomationTargetKind::fxChainMix:
      command.type = padpilot::AudioCommandType::setFxChainMix;
      command.parameterId = chainId;
      command.value = denormalized;
      break;
    case AutomationTargetKind::fxNodeMix:
      command.type = padpilot::AudioCommandType::setFxNodeMix;
      command.parameterId = encodeNodeTargetId(chainId, nodeId);
      command.value = denormalized;
      break;
    case AutomationTargetKind::fxNodeParamFloat:
      command.type = padpilot::AudioCommandType::setFxNodeParamFloat;
      command.parameterId = encodeNodeTargetId(chainId, nodeId, parameterId);
      command.value = denormalized;
      break;
    case AutomationTargetKind::none:
    default:
      return;
  }

  queueAudioCommand(command);
}

void PadPilotAudioProcessor::syncRealtimeAutomationBinding(int slotIndex, const AutomationBinding& binding) {
  if (slotIndex < 1 || slotIndex > kMacroSlotCount) {
    return;
  }

  std::lock_guard<std::mutex> writerGuard(realtimeAutomationBindingWriteMutex_);
  auto& realtime = realtimeAutomationBindings_[static_cast<std::size_t>(slotIndex - 1)];
  realtime.generation.fetch_add(1, std::memory_order_acq_rel);
  realtime.targetKind.store(static_cast<int>(binding.targetKind), std::memory_order_relaxed);
  realtime.valueKind.store(static_cast<int>(binding.valueKind), std::memory_order_relaxed);
  realtime.chainId.store(binding.chainId, std::memory_order_relaxed);
  realtime.nodeId.store(binding.nodeId, std::memory_order_relaxed);
  realtime.parameterId.store(binding.parameterId, std::memory_order_relaxed);
  realtime.minValue.store(binding.minValue, std::memory_order_relaxed);
  realtime.maxValue.store(binding.maxValue, std::memory_order_relaxed);
  realtime.generation.fetch_add(1, std::memory_order_release);
}

const PadPilotAudioProcessor::AutomationBinding& PadPilotAudioProcessor::getAutomationBinding(int slotIndex) const {
  static const AutomationBinding emptyBinding{};
  if (slotIndex < 1 || slotIndex > kMacroSlotCount) {
    return emptyBinding;
  }
  return automationBindings_[static_cast<std::size_t>(slotIndex - 1)];
}

void PadPilotAudioProcessor::setEditorTelemetryVisible(bool visible) {
  editorTelemetryVisible_.store(visible, std::memory_order_release);
  refreshTelemetryMode();
}

void PadPilotAudioProcessor::setDiagnosticsTelemetryVisible(bool visible) {
  diagnosticsTelemetryVisible_.store(visible, std::memory_order_release);
  refreshTelemetryMode();
}

void PadPilotAudioProcessor::refreshTelemetryMode() {
  auto mode = padpilot::ConvolverModuleGraph::TelemetryMode::off;
  if (editorTelemetryVisible_.load(std::memory_order_acquire)) {
    mode = diagnosticsTelemetryVisible_.load(std::memory_order_acquire)
               ? padpilot::ConvolverModuleGraph::TelemetryMode::diagnostics
               : padpilot::ConvolverModuleGraph::TelemetryMode::visible;
  }
  convolverGraph_.setTelemetryMode(mode);
}

bool PadPilotAudioProcessor::focusAutomationTarget(const AutomationBinding& binding) {
  if (binding.slotIndex < 1 || binding.slotIndex > kMacroSlotCount) {
    return false;
  }
  auto sanitized = binding;
  sanitized.moduleId = canonicalizeModuleId(binding.moduleId);
  if (!isValidAutomationBinding(sanitized)) {
    return false;
  }
  endAllAutomationTouches();
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (sanitized.moduleId != getSelectedFxGraphOwnerLocked()) {
      return false;
    }
    automationBindings_[static_cast<std::size_t>(sanitized.slotIndex - 1)] = sanitized;
  }
  syncRealtimeAutomationBinding(sanitized.slotIndex, sanitized);
  markFxRuntimeStateDirty();
  return true;
}

bool PadPilotAudioProcessor::beginAutomationTouch(const std::string& parameterId) {
  const auto parameterText = juce::String(parameterId);
  auto* parameter = parameters_.getParameter(parameterText);
  const auto touchIndex = getAutomationTouchIndex(parameterText);
  if (parameter == nullptr || !touchIndex.has_value()) {
    return false;
  }

  std::lock_guard<std::mutex> guard(automationTouchMutex_);
  if (activeAutomationTouches_[*touchIndex]) {
    return true;
  }
  parameter->beginChangeGesture();
  activeAutomationTouches_[*touchIndex] = true;
  return true;
}

bool PadPilotAudioProcessor::updateAutomationTouch(const std::string& parameterId, float normalizedValue) {
  if (!std::isfinite(normalizedValue)) {
    return false;
  }
  if (auto* parameter = parameters_.getParameter(parameterId); parameter != nullptr) {
    parameter->setValueNotifyingHost(juce::jlimit(0.0f, 1.0f, normalizedValue));
    return true;
  }
  return false;
}

bool PadPilotAudioProcessor::endAutomationTouch(const std::string& parameterId) {
  const auto parameterText = juce::String(parameterId);
  auto* parameter = parameters_.getParameter(parameterText);
  const auto touchIndex = getAutomationTouchIndex(parameterText);
  if (parameter == nullptr || !touchIndex.has_value()) {
    return false;
  }

  std::lock_guard<std::mutex> guard(automationTouchMutex_);
  if (!activeAutomationTouches_[*touchIndex]) {
    return true;
  }
  parameter->endChangeGesture();
  activeAutomationTouches_[*touchIndex] = false;
  return true;
}

void PadPilotAudioProcessor::endAllAutomationTouches() {
  std::lock_guard<std::mutex> guard(automationTouchMutex_);
  for (std::size_t touchIndex = 0; touchIndex < activeAutomationTouches_.size(); ++touchIndex) {
    if (!activeAutomationTouches_[touchIndex]) {
      continue;
    }
    juce::String parameterId;
    if (touchIndex == 0U) {
      parameterId = kMasterInputParameterId;
    } else if (touchIndex == 1U) {
      parameterId = kMasterWetDryParameterId;
    } else if (touchIndex == 2U) {
      parameterId = kMasterOutputParameterId;
    } else {
      parameterId = getMacroParameterId(static_cast<int>(touchIndex - 2U));
    }
    if (auto* parameter = parameters_.getParameter(parameterId); parameter != nullptr) {
      parameter->endChangeGesture();
    }
    activeAutomationTouches_[touchIndex] = false;
  }
}

std::optional<std::size_t> PadPilotAudioProcessor::getAutomationTouchIndex(const juce::String& parameterId) const {
  if (parameterId == kMasterInputParameterId) {
    return 0U;
  }
  if (parameterId == kMasterWetDryParameterId) {
    return 1U;
  }
  if (parameterId == kMasterOutputParameterId) {
    return 2U;
  }
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    if (parameterId == getMacroParameterId(slotIndex)) {
      return static_cast<std::size_t>(slotIndex + 2);
    }
  }
  return std::nullopt;
}

bool PadPilotAudioProcessor::executeHotkeyMacro(const std::string& moduleId,
                                                const std::vector<std::string>& shortcuts) {
  constexpr std::size_t kMaxHotkeyActions = 64;
  if (shortcuts.empty() || shortcuts.size() > 8) {
    return false;
  }

  std::vector<padpilot::ScriptAction> actions;
  actions.reserve(shortcuts.size() * 8);
  for (const auto& shortcut : shortcuts) {
    if (!appendShortcutActions(shortcut, actions)) {
      return false;
    }
    if (actions.size() > kMaxHotkeyActions) {
      return false;
    }
  }

  if (actions.empty()) {
    return false;
  }

  return scriptHost_.enqueueActions(canonicalizeModuleId(moduleId), actions);
}

void PadPilotAudioProcessor::setParameterNormalizedSilently(const juce::String& parameterId, float normalizedValue) {
  if (!std::isfinite(normalizedValue)) {
    return;
  }
  if (auto* parameter = parameters_.getParameter(parameterId); parameter != nullptr) {
    const ScopedParameterCallbackSuppression suppression(this);
    parameter->setValue(juce::jlimit(0.0f, 1.0f, normalizedValue));
  }
}

float PadPilotAudioProcessor::readParameterNormalized(const juce::String& parameterId) const {
  if (const auto* parameter = parameters_.getParameter(parameterId); parameter != nullptr) {
    const auto value = parameter->getValue();
    const auto fallback = parameter->getDefaultValue();
    return std::isfinite(value) ? juce::jlimit(0.0f, 1.0f, value)
                                : (std::isfinite(fallback) ? juce::jlimit(0.0f, 1.0f, fallback) : 0.0f);
  }
  return 0.0f;
}

float PadPilotAudioProcessor::readParameterDenormalized(const juce::String& parameterId) const {
  if (const auto* parameter = dynamic_cast<const juce::RangedAudioParameter*>(parameters_.getParameter(parameterId));
      parameter != nullptr) {
    const auto denormalized = parameter->convertFrom0to1(readParameterNormalized(parameterId));
    return std::isfinite(denormalized) ? denormalized : 0.0f;
  }
  return 0.0f;
}

void PadPilotAudioProcessor::syncDirectParametersFromFxState(const padpilot::fx::FxChainState& state) {
  if (!state.has_master()) {
    return;
  }

  setParameterNormalizedSilently(kMasterInputParameterId,
                                 normalizeAutomationValue(state.master().input_gain_db(), -18.0f, 18.0f));
  setParameterNormalizedSilently(kMasterWetDryParameterId,
                                 normalizeAutomationValue(state.master().wet_dry(), 0.0f, 1.0f));
  setParameterNormalizedSilently(kMasterOutputParameterId,
                                 normalizeAutomationValue(state.master().output_gain_db(), -18.0f, 18.0f));
}

void PadPilotAudioProcessor::updateLastAppliedFxState(const padpilot::fx::FxChainState& state) {
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto fxGraphOwner = getSelectedFxGraphOwnerLocked();
  if (fxGraphOwner.empty()) {
    return;
  }
  lastAppliedFxState_ = state;
  moduleStatePayloadById_[fxGraphOwner] = padpilot::proto::bytesToBase64(padpilot::proto::serializeFxChainState(state));
  acceptedRevisionByModuleId_[fxGraphOwner] = state.revision();
  if (!state.selected_preset_id().empty()) {
    selectedPresetId_ = state.selected_preset_id();
  }
}

bool PadPilotAudioProcessor::hasFxTopologyChanges(const padpilot::fx::FxChainState& previous,
                                                  const padpilot::fx::FxChainState& next) const {
  if (previous.chains_size() != next.chains_size()) {
    return true;
  }

  for (int chainIndex = 0; chainIndex < previous.chains_size(); ++chainIndex) {
    const auto& previousChain = previous.chains(chainIndex);
    const auto& nextChain = next.chains(chainIndex);
    if (previousChain.id() != nextChain.id() || previousChain.order() != nextChain.order()) {
      return true;
    }
    if (previousChain.nodes_size() != nextChain.nodes_size()) {
      return true;
    }
    for (int nodeIndex = 0; nodeIndex < previousChain.nodes_size(); ++nodeIndex) {
      const auto& previousNode = previousChain.nodes(nodeIndex);
      const auto& nextNode = nextChain.nodes(nodeIndex);
      if (previousNode.id() != nextNode.id() || previousNode.order() != nextNode.order() ||
          previousNode.type() != nextNode.type()) {
        return true;
      }
      if (previousNode.type() == padpilot::fx::FX_NODE_TYPE_CONVOLVER && previousNode.has_convolver_config() &&
          nextNode.has_convolver_config() &&
          previousNode.convolver_config().ir_id() != nextNode.convolver_config().ir_id()) {
        return true;
      }
    }
  }
  return false;
}

bool PadPilotAudioProcessor::hasUnsupportedFxRuntimeDiffs(const padpilot::fx::FxChainState& previous,
                                                          const padpilot::fx::FxChainState& next) const {
  for (int chainIndex = 0; chainIndex < previous.chains_size(); ++chainIndex) {
    const auto& previousChain = previous.chains(chainIndex);
    const auto& nextChain = next.chains(chainIndex);
    for (int nodeIndex = 0; nodeIndex < previousChain.nodes_size(); ++nodeIndex) {
      const auto& previousNode = previousChain.nodes(nodeIndex);
      const auto& nextNode = nextChain.nodes(nodeIndex);
      const bool unsupportedNodeChange = stripSupportedRuntimeFields(previousNode).SerializeAsString() !=
                                         stripSupportedRuntimeFields(nextNode).SerializeAsString();
      if (unsupportedNodeChange) {
        return true;
      }
    }
  }
  return false;
}

bool PadPilotAudioProcessor::queueSupportedFxDiffCommands(const padpilot::fx::FxChainState& previous,
                                                          const padpilot::fx::FxChainState& next) {
  bool queuedAll = true;
  const auto queue = [this, &queuedAll](const padpilot::AudioCommand& command) {
    queuedAll = queueAudioCommand(command) && queuedAll;
  };
  if (previous.has_master() || next.has_master()) {
    const auto& previousMaster = previous.has_master() ? previous.master() : padpilot::fx::MasterState{};
    const auto& nextMaster = next.has_master() ? next.master() : padpilot::fx::MasterState{};
    if (std::abs(previousMaster.input_gain_db() - nextMaster.input_gain_db()) > 0.0001f) {
      queue({padpilot::AudioCommandType::setMasterInputGainDb, 0, nextMaster.input_gain_db()});
    }
    if (std::abs(previousMaster.wet_dry() - nextMaster.wet_dry()) > 0.0001f) {
      queue({padpilot::AudioCommandType::setMasterWetDry, 0, nextMaster.wet_dry()});
    }
    if (std::abs(previousMaster.output_gain_db() - nextMaster.output_gain_db()) > 0.0001f) {
      queue({padpilot::AudioCommandType::setOutputGainDb, 0, nextMaster.output_gain_db()});
    }
  }

  for (int chainIndex = 0; chainIndex < previous.chains_size(); ++chainIndex) {
    const auto& previousChain = previous.chains(chainIndex);
    const auto& nextChain = next.chains(chainIndex);
    if (std::abs(previousChain.mix() - nextChain.mix()) > 0.0001f) {
      queue({padpilot::AudioCommandType::setFxChainMix, nextChain.id(), nextChain.mix()});
    }
    if (previousChain.muted() != nextChain.muted()) {
      padpilot::AudioCommand command{};
      command.type = padpilot::AudioCommandType::setFxChainMuted;
      command.parameterId = nextChain.id();
      command.boolValue = nextChain.muted();
      queue(command);
    }
    if (previousChain.solo() != nextChain.solo()) {
      padpilot::AudioCommand command{};
      command.type = padpilot::AudioCommandType::setFxChainSolo;
      command.parameterId = nextChain.id();
      command.boolValue = nextChain.solo();
      queue(command);
    }

    for (int nodeIndex = 0; nodeIndex < previousChain.nodes_size(); ++nodeIndex) {
      const auto& previousNode = previousChain.nodes(nodeIndex);
      const auto& nextNode = nextChain.nodes(nodeIndex);
      if (previousNode.bypassed() != nextNode.bypassed()) {
        padpilot::AudioCommand command{};
        command.type = padpilot::AudioCommandType::setFxNodeBypassed;
        command.parameterId = encodeNodeTargetId(nextChain.id(), nextNode.id());
        command.boolValue = nextNode.bypassed();
        queue(command);
      }
      if (previousNode.muted() != nextNode.muted()) {
        padpilot::AudioCommand command{};
        command.type = padpilot::AudioCommandType::setFxNodeMuted;
        command.parameterId = encodeNodeTargetId(nextChain.id(), nextNode.id());
        command.boolValue = nextNode.muted();
        queue(command);
      }
      if (previousNode.solo() != nextNode.solo()) {
        padpilot::AudioCommand command{};
        command.type = padpilot::AudioCommandType::setFxNodeSolo;
        command.parameterId = encodeNodeTargetId(nextChain.id(), nextNode.id());
        command.boolValue = nextNode.solo();
        queue(command);
      }
      if (std::abs(previousNode.mix() - nextNode.mix()) > 0.0001f) {
        padpilot::AudioCommand command{};
        command.type = padpilot::AudioCommandType::setFxNodeMix;
        command.parameterId = encodeNodeTargetId(nextChain.id(), nextNode.id());
        command.value = nextNode.mix();
        queue(command);
      }
      const auto paramCount = std::min(previousNode.legacy_params_size(), nextNode.legacy_params_size());
      for (int paramIndex = 0; paramIndex < paramCount; ++paramIndex) {
        const auto& previousParam = previousNode.legacy_params(paramIndex);
        const auto& nextParam = nextNode.legacy_params(paramIndex);
        if (previousParam.parameter_id() != nextParam.parameter_id()) {
          continue;
        }
        if (std::abs(previousParam.value() - nextParam.value()) <= 0.0001f) {
          continue;
        }
        padpilot::AudioCommand command{};
        command.type = padpilot::AudioCommandType::setFxNodeParamFloat;
        command.parameterId = encodeNodeTargetId(nextChain.id(), nextNode.id(), nextParam.parameter_id());
        command.value = nextParam.value();
        queue(command);
      }
    }
  }
  return queuedAll;
}

void PadPilotAudioProcessor::applyFxStateDiff(const padpilot::fx::FxChainState& state) {
  fxRuntimeStateDirty_.store(false, std::memory_order_release);
  std::optional<padpilot::fx::FxChainState> previous;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    previous = lastAppliedFxState_;
  }

  if (!previous.has_value()) {
    applyFxChainState(state, true);
    return;
  }

  if (hasFxTopologyChanges(*previous, state) || hasUnsupportedFxRuntimeDiffs(*previous, state)) {
    applyFxChainState(state, true);
    return;
  }

  updateLastAppliedFxState(state);
  syncDirectParametersFromFxState(state);
  if (!queueSupportedFxDiffCommands(*previous, state)) {
    fxRuntimeResyncRequested_.store(false, std::memory_order_release);
    applyFxChainState(state, true);
  }
}

void PadPilotAudioProcessor::reconcileFxStateFromParameters() {
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  const auto stateDirty = fxRuntimeStateDirty_.exchange(false, std::memory_order_acq_rel);
  const auto resyncRequested = fxRuntimeResyncRequested_.exchange(false, std::memory_order_acq_rel);
  std::optional<padpilot::fx::FxChainState> resyncState;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto fxGraphOwner = getSelectedFxGraphOwnerLocked();
    if (fxGraphOwner.empty() || !lastAppliedFxState_.has_value()) {
      return;
    }

    auto state = *lastAppliedFxState_;
    state.mutable_master()->set_input_gain_db(readParameterDenormalized(kMasterInputParameterId));
    state.mutable_master()->set_wet_dry(readParameterDenormalized(kMasterWetDryParameterId));
    state.mutable_master()->set_output_gain_db(readParameterDenormalized(kMasterOutputParameterId));

    for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
      const auto& binding = automationBindings_[static_cast<std::size_t>(slotIndex - 1)];
      if (!binding.isActive() || canonicalizeModuleId(binding.moduleId) != fxGraphOwner) {
        continue;
      }

      const auto normalizedValue = readParameterNormalized(getMacroParameterId(slotIndex));
      const auto value = denormalizeAutomationValue(normalizedValue, binding.minValue, binding.maxValue);
      switch (binding.targetKind) {
        case AutomationTargetKind::fxChainMix:
          if (auto* chain = findChainById(state, binding.chainId); chain != nullptr) {
            chain->set_mix(value);
          }
          break;
        case AutomationTargetKind::fxNodeMix:
          if (auto* chain = findChainById(state, binding.chainId); chain != nullptr) {
            if (auto* node = findNodeById(chain, binding.nodeId); node != nullptr) {
              node->set_mix(value);
            }
          }
          break;
        case AutomationTargetKind::fxNodeParamFloat:
          if (auto* chain = findChainById(state, binding.chainId); chain != nullptr) {
            if (auto* node = findNodeById(chain, binding.nodeId); node != nullptr) {
              if (auto* param = findLegacyParam(node, binding.parameterId); param != nullptr) {
                param->set_value(value);
                padpilot::proto::syncNodeConfigFromLegacyParams(node);
              }
            }
          }
          break;
        case AutomationTargetKind::masterInputGain:
        case AutomationTargetKind::masterWetDry:
        case AutomationTargetKind::masterOutputGain:
        case AutomationTargetKind::none:
        default:
          break;
      }
    }

    if (stateDirty) {
      const auto accepted = acceptedRevisionByModuleId_.find(fxGraphOwner);
      const auto currentRevision = accepted == acceptedRevisionByModuleId_.end()
                                       ? state.revision()
                                       : std::max(state.revision(), accepted->second);
      if (currentRevision < std::numeric_limits<std::uint64_t>::max()) {
        state.set_revision(currentRevision + 1);
      }
    }

    lastAppliedFxState_ = state;
    moduleStatePayloadById_[fxGraphOwner] =
        padpilot::proto::bytesToBase64(padpilot::proto::serializeFxChainState(state));
    acceptedRevisionByModuleId_[fxGraphOwner] = state.revision();
    if (resyncRequested) {
      resyncState = std::move(state);
    }
  }

  if (resyncState.has_value()) {
    applyFxChainState(*resyncState, true);
  }
}

void PadPilotAudioProcessor::reconcileFxStateFromParametersIfDirty() {
  if (!fxRuntimeStateDirty_.load(std::memory_order_acquire) &&
      !fxRuntimeResyncRequested_.load(std::memory_order_acquire)) {
    return;
  }
  reconcileFxStateFromParameters();
}
