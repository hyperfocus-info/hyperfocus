#include "core/pad-pilot-processor-internal.h"

#include "generated/factory-module-catalog.h"

namespace padpilot::processor_detail {
std::string readEnvironmentValue(const char* name) {
#if JUCE_WINDOWS
  char* value = nullptr;
  std::size_t size = 0;
  if (_dupenv_s(&value, &size, name) != 0 || value == nullptr) {
    return {};
  }

  std::string result(value);
  std::free(value);
  return result;
#else
  if (const char* value = std::getenv(name); value != nullptr) {
    return std::string(value);
  }
  return {};
#endif
}

std::string resolveModulePath() {
  const auto modulePathEnv = readEnvironmentValue("PADPILOT_MODULE_PATH");
  if (!modulePathEnv.empty()) {
    return modulePathEnv;
  }

  const auto defaultPath = std::filesystem::path("modules") / "dist" / "module.js";
  return defaultPath.string();
}

bool isCpuProfilingEnabled() {
  return readEnvironmentValue("PADPILOT_CPU_PROFILE") == "1";
}

bool isLegacyRemovedBuiltInModuleId(const std::string& moduleId) {
  return moduleId == kLegacyRemovedCompressorModuleId;
}

bool isSafePersistedKey(const std::string& value, std::size_t maxBytes) {
  if (value.empty() || value.size() > maxBytes) {
    return false;
  }
  return std::all_of(value.begin(), value.end(), [](const unsigned char character) {
    return character >= 0x20U && character != 0x7fU;
  });
}

bool isKnownControllerLayoutKind(const padpilot::bridge::ControllerLayoutKind value) {
  switch (value) {
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_AUTO:
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_XBOX:
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_PLAYSTATION:
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_SWITCH:
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_GENERIC:
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_CUSTOM:
      return true;
    default:
      return false;
  }
}

bool isKnownControllerBindingKind(const padpilot::bridge::ControllerBindingKind value) {
  switch (value) {
    case padpilot::bridge::CONTROLLER_BINDING_KIND_NONE:
    case padpilot::bridge::CONTROLLER_BINDING_KIND_BUTTON:
    case padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_POSITIVE:
    case padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_NEGATIVE:
      return true;
    default:
      return false;
  }
}

bool isValidControllerConfigProto(const padpilot::bridge::ControllerConfigState& config) {
  if (config.rows_size() > static_cast<int>(padpilot::kMaxControllerConfigRows) ||
      config.custom_layouts_size() > static_cast<int>(padpilot::kMaxCustomControllerLayouts)) {
    return false;
  }
  for (const auto& row : config.rows()) {
    if (row.stable_id().size() > padpilot::kMaximumControllerConfigIdBytes ||
        row.hardware_id().size() > padpilot::kMaximumControllerHardwareIdBytes ||
        row.custom_layout_id().size() > padpilot::kMaximumControllerConfigIdBytes ||
        !isKnownControllerLayoutKind(row.layout_kind())) {
      return false;
    }
  }
  for (const auto& layout : config.custom_layouts()) {
    if (layout.id().size() > padpilot::kMaximumControllerConfigIdBytes ||
        layout.name().size() > padpilot::kMaximumControllerLayoutNameBytes ||
        layout.button_bindings_size() > static_cast<int>(padpilot::kCanonicalGamepadButtons) ||
        layout.axis_bindings_size() > static_cast<int>(padpilot::kCanonicalGamepadAxes)) {
      return false;
    }
    for (const auto& binding : layout.button_bindings()) {
      if (!isKnownControllerBindingKind(binding.binding_kind()) || binding.source_index() > 0xffU ||
          !std::isfinite(binding.threshold()) || binding.threshold() < 0.0f || binding.threshold() > 1.0f) {
        return false;
      }
    }
    for (const auto& axis : layout.axis_bindings()) {
      if (axis.source_index() > 0xffU) {
        return false;
      }
    }
  }
  return true;
}

bool hasReadyModule(const std::vector<padpilot::ModuleRecord>& modules,
                    const std::string& selectedModuleId,
                    const std::string& moduleId) {
  if (moduleId.empty() || moduleId != selectedModuleId) {
    return false;
  }
  const auto module = std::find_if(modules.begin(), modules.end(), [&moduleId](const auto& record) {
    return record.id == moduleId;
  });
  return module != modules.end() && module->loadStatus == "ready";
}

bool isGlobalEditorViewScope(std::string_view scopeId) {
  return std::find(kGlobalEditorViewScopes.begin(), kGlobalEditorViewScopes.end(), scopeId) !=
         kGlobalEditorViewScopes.end();
}

bool canReplaceBoundedPayload(const std::unordered_map<std::string, std::string>& payloads,
                              const std::string& key,
                              std::size_t nextSize,
                              std::size_t maxAggregateBytes) {
  std::size_t existingBytes = 0;
  for (const auto& [payloadKey, payload] : payloads) {
    if (payloadKey != key) {
      if (payload.size() > maxAggregateBytes - std::min(existingBytes, maxAggregateBytes)) {
        return false;
      }
      existingBytes += payload.size();
    }
  }
  return existingBytes <= maxAggregateBytes && nextSize <= maxAggregateBytes - existingBytes;
}

std::vector<padpilot::PresetRecord> boundPersistedPresets(std::vector<padpilot::PresetRecord> presets) {
  std::vector<padpilot::PresetRecord> bounded;
  bounded.reserve(std::min<std::size_t>(presets.size(), static_cast<std::size_t>(kMaxPersistedPresets)));
  std::size_t aggregateBytes = 0;
  for (auto& preset : presets) {
    if (bounded.size() >= static_cast<std::size_t>(kMaxPersistedPresets) || preset.payloadJson.empty() ||
        preset.payloadJson.size() > kMaxModuleStateBase64Chars ||
        preset.payloadJson.size() > kMaxAggregatePresetStateBytes - aggregateBytes) {
      continue;
    }
    aggregateBytes += preset.payloadJson.size();
    bounded.push_back(std::move(preset));
  }
  return bounded;
}

std::vector<padpilot::ModuleRecord> boundInstalledModules(std::vector<padpilot::ModuleRecord> modules) {
  if (modules.size() <= static_cast<std::size_t>(kMaxPersistedModules)) {
    return modules;
  }
  static_assert(factory_catalog::kModules.size() <= static_cast<std::size_t>(kMaxPersistedModules));
  const auto isFactory = [](const std::string& moduleId) {
    return std::any_of(factory_catalog::kModules.begin(),
                       factory_catalog::kModules.end(),
                       [&moduleId](const auto& definition) { return definition.id == moduleId; });
  };
  std::vector<padpilot::ModuleRecord> bounded;
  bounded.reserve(static_cast<std::size_t>(kMaxPersistedModules));
  for (const auto& factory : factory_catalog::kModules) {
    const auto module = std::find_if(modules.begin(), modules.end(), [&factory](const auto& record) {
      return record.id == factory.id;
    });
    if (module != modules.end()) {
      bounded.push_back(*module);
    }
  }
  for (auto& module : modules) {
    if (bounded.size() >= static_cast<std::size_t>(kMaxPersistedModules)) {
      break;
    }
    if (!isFactory(module.id)) {
      bounded.push_back(std::move(module));
    }
  }
  return bounded;
}

std::vector<padpilot::ModuleRecord> mergeInstalledModuleInventory(
    std::vector<padpilot::ModuleRecord> restoredModules,
    const std::vector<padpilot::ModuleRecord>& installedModules) {
  std::unordered_set<std::string> moduleIds;
  moduleIds.reserve(restoredModules.size() + installedModules.size());
  for (const auto& module : restoredModules) {
    moduleIds.insert(module.id);
  }
  for (const auto& installed : installedModules) {
    if (moduleIds.insert(installed.id).second) {
      restoredModules.push_back(installed);
    }
  }
  return boundInstalledModules(std::move(restoredModules));
}

bool isValidRecutState(const padpilot::recut::RecutModuleState& state) {
  constexpr int kMaxPersistedSlices = 16;
  const auto finite = [](float value) { return std::isfinite(value); };
  if (state.schema_version() == 0 || state.slice_markers_size() > kMaxPersistedSlices ||
      state.pad_assignments_size() > kMaxPersistedSlices ||
      state.choke_groups_size() > kMaxPersistedSlices ||
      !finite(state.pitch_semitones()) || state.pitch_semitones() < -48.0f || state.pitch_semitones() > 48.0f ||
      !finite(state.gain_db()) || state.gain_db() < -96.0f || state.gain_db() > 24.0f ||
      !finite(state.grain_size_ms()) || state.grain_size_ms() < 1.0f || state.grain_size_ms() > 1000.0f ||
      !finite(state.grain_density()) || state.grain_density() < 0.0f || state.grain_density() > 1.0f ||
      !finite(state.bpm_value()) || !finite(state.bpm_confidence()) ||
      !finite(state.bpm_suggested_value()) || !finite(state.bpm_suggested_confidence()) ||
      !finite(state.density()) || !finite(state.project_bpm_snapshot())) {
    return false;
  }

  switch (state.analysis_mode()) {
    case padpilot::recut::RECUT_ANALYSIS_MODE_AUTO:
    case padpilot::recut::RECUT_ANALYSIS_MODE_BPM:
    case padpilot::recut::RECUT_ANALYSIS_MODE_CUSTOM:
      break;
    default:
      return false;
  }
  switch (state.bpm_source()) {
    case padpilot::recut::RECUT_BPM_SOURCE_NONE:
    case padpilot::recut::RECUT_BPM_SOURCE_METADATA:
    case padpilot::recut::RECUT_BPM_SOURCE_ANALYZED:
    case padpilot::recut::RECUT_BPM_SOURCE_PROJECT:
    case padpilot::recut::RECUT_BPM_SOURCE_USER:
      break;
    default:
      return false;
  }

  for (const auto& marker : state.slice_markers()) {
    if (marker.start_frame() > marker.end_frame() || marker.transient_frame() < marker.start_frame() ||
        marker.transient_frame() > marker.end_frame() || marker.pad_index() >= kMaxPersistedSlices ||
        !finite(marker.confidence()) || !finite(marker.fade_ms())) {
      return false;
    }
  }
  for (const auto& assignment : state.pad_assignments()) {
    if (assignment.pad_index() >= kMaxPersistedSlices ||
        (!assignment.is_empty() && assignment.slice_index() >= kMaxPersistedSlices)) {
      return false;
    }
  }
  return true;
}

bool isValidAnalyzerState(const padpilot::analyzer::AnalyzerModuleState& state) {
  if (state.schema_version() == 0 ||
      state.note_events_size() > static_cast<int>(padpilot::AnalyzerRuntime::kMaxPersistedNoteEvents) ||
      !std::isfinite(state.tuning_hz()) || state.tuning_hz() < 415.0f || state.tuning_hz() > 465.0f ||
      !std::isfinite(state.detection_sensitivity()) || state.detection_sensitivity() < 0.0f ||
      state.detection_sensitivity() > 1.0f) {
    return false;
  }
  if (state.has_take_summary() &&
      (!std::isfinite(state.take_summary().duration_seconds()) ||
       !std::isfinite(state.take_summary().captured_bpm()))) {
    return false;
  }
  std::unordered_set<std::uint64_t> eventIds;
  for (const auto& event : state.note_events()) {
    if (event.midi_note() > 127U || event.velocity() > 127U || event.start_frame() > event.end_frame() ||
        !std::isfinite(event.intensity()) || !std::isfinite(event.mean_frequency_hz()) ||
        (state.schema_version() >= 3U &&
         (event.event_id() == 0U || event.detected_midi_note() > 127U ||
          !std::isfinite(event.confidence()) || event.confidence() < 0.0f ||
          event.confidence() > 1.0f || !eventIds.insert(event.event_id()).second))) {
      return false;
    }
  }
  if (state.has_take_summary()) {
    for (const auto& match : state.take_summary().top_matches()) {
      if (match.root_pitch_class() >= 12U || !std::isfinite(match.confidence())) {
        return false;
      }
    }
  }
  return true;
}

std::optional<BoundedRecutStateSnapshot> readBoundedRecutStateSnapshot(
    const padpilot::RecutRuntime& runtime) {
  auto payloadBytes = runtime.serializeStateBytes();
  padpilot::recut::RecutModuleState state;
  if (payloadBytes.empty() || payloadBytes.size() > kMaxModuleStateBytes ||
      !padpilot::proto::parseRecutModuleState(payloadBytes, &state) ||
      !isValidRecutState(state)) {
    return std::nullopt;
  }
  return BoundedRecutStateSnapshot {
      std::move(payloadBytes),
      state.revision(),
  };
}

std::optional<BoundedAnalyzerStateSnapshot> readBoundedAnalyzerStateSnapshot(
    const padpilot::AnalyzerRuntime& runtime) {
  std::optional<BoundedAnalyzerStateSnapshot> lastCoherentPayload;
  for (int attempt = 0; attempt < 2; ++attempt) {
    const auto payloadBase64 = runtime.getStateBase64();
    const auto runtimeRevision = runtime.getRevision();
    if (payloadBase64.empty() || payloadBase64.size() > kMaxModuleStateBase64Chars) {
      return std::nullopt;
    }

    std::string payloadBytes;
    padpilot::analyzer::AnalyzerModuleState state;
    if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes) ||
        payloadBytes.empty() || payloadBytes.size() > kMaxModuleStateBytes ||
        !padpilot::proto::parseAnalyzerModuleState(payloadBytes, &state) ||
        !isValidAnalyzerState(state)) {
      return std::nullopt;
    }

    lastCoherentPayload = BoundedAnalyzerStateSnapshot {
        std::move(payloadBytes),
        state.revision(),
    };
    if (state.revision() == runtimeRevision) {
      break;
    }
  }
  return lastCoherentPayload;
}

std::optional<float> parseFiniteFloat(const std::string& text) {
  try {
    std::size_t parsedCharacters = 0;
    const auto value = std::stof(text, &parsedCharacters);
    if (parsedCharacters != text.size() || !std::isfinite(value)) {
      return std::nullopt;
    }
    return value;
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<AnalyzerNoteCorrectionPayload> parseAnalyzerNoteCorrection(const std::string& text) {
  if (text.empty() || text.size() > 24U) {
    return std::nullopt;
  }
  const auto separator = text.find(':');
  if (separator == std::string::npos || separator == 0U || separator + 1U >= text.size()) {
    return std::nullopt;
  }
  std::uint64_t eventId = 0;
  std::uint32_t midiNote = 0;
  const auto eventResult = std::from_chars(text.data(), text.data() + separator, eventId);
  const auto noteResult = std::from_chars(text.data() + separator + 1U,
                                          text.data() + text.size(),
                                          midiNote);
  if (eventResult.ec != std::errc {} || eventResult.ptr != text.data() + separator ||
      noteResult.ec != std::errc {} || noteResult.ptr != text.data() + text.size() ||
      eventId == 0 || midiNote > 127U) {
    return std::nullopt;
  }
  return AnalyzerNoteCorrectionPayload {eventId, static_cast<std::uint8_t>(midiNote)};
}

std::optional<std::uint64_t> parseAnalyzerEventId(const std::string& text) {
  if (text.empty() || text.size() > 20U) {
    return std::nullopt;
  }
  std::uint64_t eventId = 0;
  const auto result = std::from_chars(text.data(), text.data() + text.size(), eventId);
  if (result.ec != std::errc {} || result.ptr != text.data() + text.size() || eventId == 0) {
    return std::nullopt;
  }
  return eventId;
}

bool looksLikeJsonObject(const void* data, std::size_t size) {
  const auto* bytes = static_cast<const unsigned char*>(data);
  std::size_t index = 0;
  if (size >= 3U && bytes[0] == 0xefU && bytes[1] == 0xbbU && bytes[2] == 0xbfU) {
    index = 3U;
  }
  while (index < size &&
         (bytes[index] == ' ' || bytes[index] == '\t' || bytes[index] == '\r' || bytes[index] == '\n')) {
    ++index;
  }
  return index < size && bytes[index] == '{';
}
}  // namespace padpilot::processor_detail
