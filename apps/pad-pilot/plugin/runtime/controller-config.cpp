#include "runtime/controller-config.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <unordered_set>

#include <juce_core/juce_core.h>

namespace {

constexpr float kMinimumAxisDeadzone = 0.055f;
constexpr float kMaximumAxisDeadzone = 0.18f;
constexpr float kAxisRestLearningMargin = 0.025f;
constexpr float kAxisCenterLearningRate = 0.01f;
constexpr float kAxisNoiseLearningRate = 0.02f;
constexpr float kMaximumLearnedAxisCenter = 0.12f;
constexpr float kAxisPublishDelta = 1.0f / 512.0f;

std::uint64_t fnv1a64(std::string_view value, std::uint64_t hash = 14695981039346656037ULL) {
  for (const auto character : value) {
    hash ^= static_cast<unsigned char>(character);
    hash *= 1099511628211ULL;
  }
  return hash;
}

void hashUint16(std::uint64_t& hash, const std::uint16_t value) {
  const std::array bytes {
      static_cast<char>(value & 0xffU),
      static_cast<char>((value >> 8U) & 0xffU),
  };
  hash = fnv1a64(std::string_view(bytes.data(), bytes.size()), hash);
}

std::string lowerCopy(std::string_view value) {
  std::string lowered;
  lowered.reserve(value.size());
  for (const auto character : value) {
    lowered.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(character))));
  }
  return lowered;
}

std::string boundedText(std::string_view value, const std::size_t maxBytes) {
  return std::string(value.substr(0, maxBytes));
}

std::string uniqueStableId(std::string value, std::unordered_set<std::string>& usedIds) {
  value = boundedText(value, padpilot::kMaximumControllerConfigIdBytes);
  if (!value.empty() && usedIds.insert(value).second) {
    return value;
  }
  do {
    value = juce::Uuid().toString().toStdString();
  } while (!usedIds.insert(value).second);
  return value;
}

}  // namespace

namespace padpilot {

std::string makeControllerStableId() {
  return juce::Uuid().toString().toStdString();
}

std::string makeControllerHardwareId(const std::uint16_t vendorId,
                                     const std::uint16_t productId,
                                     const std::string_view serial,
                                     const std::string_view devicePath,
                                     const std::string_view guid) {
  const auto identityKind = !serial.empty() ? 's' : (!devicePath.empty() ? 'p' : 'g');
  const auto identity = !serial.empty() ? serial : (!devicePath.empty() ? devicePath : guid);
  auto hash = std::uint64_t {14695981039346656037ULL};
  hashUint16(hash, vendorId);
  hashUint16(hash, productId);
  hash = fnv1a64(std::string_view(&identityKind, 1), hash);
  hash = fnv1a64(identity, hash);

  std::ostringstream result;
  result << "controller-v1:" << std::hex << std::setfill('0')
         << std::setw(4) << vendorId << ':'
         << std::setw(4) << productId << ':'
         << identityKind << ':'
         << std::setw(16) << hash;
  return result.str();
}

ControllerConfigState createDefaultControllerConfig() {
  ControllerConfigState state;
  ensureControllerConfigHasRow(&state);
  ensureControllerConfigPrimaryRow(&state);
  return state;
}

void ensureControllerConfigHasRow(ControllerConfigState* state) {
  if (state == nullptr) {
    return;
  }
  if (!state->rows.empty()) {
    return;
  }

  ControllerConfigRow row;
  row.stableId = makeControllerStableId();
  row.isPrimary = true;
  state->rows.push_back(row);
}

void ensureControllerConfigPrimaryRow(ControllerConfigState* state) {
  if (state == nullptr) {
    return;
  }
  ensureControllerConfigHasRow(state);
  bool foundPrimary = false;
  for (auto& row : state->rows) {
    if (!foundPrimary && row.isPrimary) {
      foundPrimary = true;
      continue;
    }
    row.isPrimary = false;
  }
  if (!foundPrimary && !state->rows.empty()) {
    state->rows.front().isPrimary = true;
  }
}

bool syncControllerConfigRows(ControllerConfigState* state,
                              const std::vector<std::string>& connectedHardwareIds) {
  if (state == nullptr) {
    return false;
  }

  if (state->rows.size() > kMaxControllerConfigRows) {
    state->rows.resize(kMaxControllerConfigRows);
  }
  ensureControllerConfigHasRow(state);
  ensureControllerConfigPrimaryRow(state);

  std::vector<std::string> boundedHardwareIds;
  boundedHardwareIds.reserve(connectedHardwareIds.size());
  std::unordered_set<std::string> connectedSet;
  for (const auto& hardwareId : connectedHardwareIds) {
    if (hardwareId.empty() || hardwareId.size() > kMaximumControllerHardwareIdBytes ||
        !connectedSet.insert(hardwareId).second) {
      continue;
    }
    boundedHardwareIds.push_back(hardwareId);
  }

  bool changed = false;
  for (const auto& hardwareId : boundedHardwareIds) {
    if (findControllerConfigRow(*state, hardwareId) != nullptr) {
      continue;
    }

    auto destination = std::find_if(state->rows.begin(), state->rows.end(), [](const auto& row) {
      return row.hardwareId.empty();
    });
    if (destination == state->rows.end() && state->rows.size() < kMaxControllerConfigRows) {
      ControllerConfigRow row;
      row.stableId = makeControllerStableId();
      state->rows.push_back(std::move(row));
      destination = std::prev(state->rows.end());
    }
    if (destination == state->rows.end()) {
      destination = std::find_if(state->rows.begin(), state->rows.end(), [&](const auto& row) {
        return !row.isPrimary && !row.hardwareId.empty() && !connectedSet.contains(row.hardwareId);
      });
    }
    if (destination == state->rows.end()) {
      continue;
    }

    destination->hardwareId = hardwareId;
    destination->layoutKind = ControllerLayoutKind::autoDetect;
    destination->customLayoutId.clear();
    changed = true;
  }

  ensureControllerConfigPrimaryRow(state);
  return changed;
}

ControllerLayoutKind detectControllerLayout(std::string_view displayName,
                                            std::string_view hardwareId) {
  const auto haystack = lowerCopy(std::string(displayName) + " " + std::string(hardwareId));
  if (haystack.find("xbox") != std::string::npos ||
      haystack.find("xinput") != std::string::npos ||
      haystack.find("microsoft") != std::string::npos) {
    return ControllerLayoutKind::xbox;
  }
  if (haystack.find("dualshock") != std::string::npos ||
      haystack.find("dualsense") != std::string::npos ||
      haystack.find("playstation") != std::string::npos ||
      haystack.find("sony") != std::string::npos ||
      haystack.find("wireless controller") != std::string::npos) {
    return ControllerLayoutKind::playstation;
  }
  if (haystack.find("switch") != std::string::npos ||
      haystack.find("joy-con") != std::string::npos ||
      haystack.find("pro controller") != std::string::npos ||
      haystack.find("nintendo") != std::string::npos) {
    return ControllerLayoutKind::switchPro;
  }
  return ControllerLayoutKind::generic;
}

const ControllerConfigRow* findControllerConfigRow(const ControllerConfigState& state,
                                                   std::string_view hardwareId) {
  if (hardwareId.empty()) {
    return nullptr;
  }
  const auto it = std::find_if(state.rows.begin(), state.rows.end(), [hardwareId](const auto& row) {
    return row.hardwareId == hardwareId;
  });
  return it == state.rows.end() ? nullptr : &(*it);
}

const CustomControllerLayout* findCustomControllerLayout(const ControllerConfigState& state,
                                                         std::string_view customLayoutId) {
  if (customLayoutId.empty()) {
    return nullptr;
  }
  const auto it = std::find_if(state.customLayouts.begin(), state.customLayouts.end(), [customLayoutId](const auto& layout) {
    return layout.id == customLayoutId;
  });
  return it == state.customLayouts.end() ? nullptr : &(*it);
}

float resolveControllerButtonValue(const ControllerButtonBinding& binding,
                                   std::span<const float> rawAxes,
                                   std::span<const float> rawButtons) {
  float value = 0.0f;
  switch (binding.bindingKind) {
    case ControllerBindingKind::button:
      if (binding.sourceIndex < rawButtons.size()) {
        value = rawButtons[binding.sourceIndex];
      }
      break;
    case ControllerBindingKind::axisPositive:
      if (binding.sourceIndex < rawAxes.size()) {
        value = rawAxes[binding.sourceIndex];
      }
      break;
    case ControllerBindingKind::axisNegative:
      if (binding.sourceIndex < rawAxes.size()) {
        value = -rawAxes[binding.sourceIndex];
      }
      break;
    case ControllerBindingKind::none:
    default:
      return 0.0f;
  }

  if (!std::isfinite(value) || !std::isfinite(binding.threshold)) {
    return 0.0f;
  }
  value = std::clamp(value, 0.0f, 1.0f);
  const auto threshold = std::clamp(binding.threshold, 0.0f, 1.0f);
  return value >= threshold ? value : 0.0f;
}

float calibrateControllerAxis(ControllerAxisCalibration& calibration, const float rawValue) {
  if (!std::isfinite(rawValue)) {
    return 0.0f;
  }

  const auto boundedRaw = std::clamp(rawValue, -1.0f, 1.0f);
  const auto currentDeadzone = std::clamp(
      kMinimumAxisDeadzone + (calibration.noiseFloor * 2.5f),
      kMinimumAxisDeadzone,
      kMaximumAxisDeadzone);
  const auto deviation = boundedRaw - calibration.center;
  if (std::abs(deviation) <= currentDeadzone + kAxisRestLearningMargin) {
    calibration.center = std::clamp(
        calibration.center + (deviation * kAxisCenterLearningRate),
        -kMaximumLearnedAxisCenter,
        kMaximumLearnedAxisCenter);
    const auto centeredMagnitude = std::abs(boundedRaw - calibration.center);
    calibration.noiseFloor +=
        (centeredMagnitude - calibration.noiseFloor) * kAxisNoiseLearningRate;
  }

  const auto deadzone = std::clamp(
      kMinimumAxisDeadzone + (calibration.noiseFloor * 2.5f),
      kMinimumAxisDeadzone,
      kMaximumAxisDeadzone);
  const auto centered = boundedRaw - calibration.center;
  const auto magnitude = std::abs(centered);
  if (magnitude <= deadzone) {
    return 0.0f;
  }

  const auto scaled = (magnitude - deadzone) / (1.0f - deadzone);
  return std::copysign(std::clamp(scaled, 0.0f, 1.0f), centered);
}

bool shouldPublishControllerAxis(ControllerAxisCalibration& calibration, const float value) {
  if (!std::isfinite(value)) {
    return false;
  }
  const auto boundedValue = std::clamp(value, -1.0f, 1.0f);
  const auto returnedToCenter = boundedValue == 0.0f && calibration.lastPublishedValue != 0.0f;
  if (!returnedToCenter &&
      std::abs(boundedValue - calibration.lastPublishedValue) < kAxisPublishDelta) {
    return false;
  }
  calibration.lastPublishedValue = boundedValue;
  return true;
}

std::optional<std::size_t> findPrimaryControllerDeviceSlot(
    const ControllerConfigState& state,
    const InputDeviceStates& inputDevices) {
  const auto primary = std::find_if(state.rows.begin(), state.rows.end(), [](const auto& row) {
    return row.isPrimary && !row.hardwareId.empty();
  });
  if (primary != state.rows.end()) {
    for (std::size_t slot = 0; slot < inputDevices.size(); ++slot) {
      const auto& device = inputDevices[slot];
      if (device.connected && device.kind == InputDeviceKind::gamepad &&
          cStringView(device.hardwareId) == primary->hardwareId) {
        return slot;
      }
    }
  }
  for (std::size_t slot = 0; slot < inputDevices.size(); ++slot) {
    const auto& device = inputDevices[slot];
    if (device.connected && device.kind == InputDeviceKind::gamepad) {
      return slot;
    }
  }
  return std::nullopt;
}

padpilot::bridge::ControllerLayoutKind toProtoControllerLayoutKind(ControllerLayoutKind value) {
  switch (value) {
    case ControllerLayoutKind::xbox:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_XBOX;
    case ControllerLayoutKind::playstation:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_PLAYSTATION;
    case ControllerLayoutKind::switchPro:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_SWITCH;
    case ControllerLayoutKind::generic:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_GENERIC;
    case ControllerLayoutKind::customLayout:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_CUSTOM;
    case ControllerLayoutKind::autoDetect:
    default:
      return padpilot::bridge::CONTROLLER_LAYOUT_KIND_AUTO;
  }
}

ControllerLayoutKind fromProtoControllerLayoutKind(padpilot::bridge::ControllerLayoutKind value) {
  switch (value) {
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_XBOX:
      return ControllerLayoutKind::xbox;
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_PLAYSTATION:
      return ControllerLayoutKind::playstation;
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_SWITCH:
      return ControllerLayoutKind::switchPro;
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_GENERIC:
      return ControllerLayoutKind::generic;
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_CUSTOM:
      return ControllerLayoutKind::customLayout;
    case padpilot::bridge::CONTROLLER_LAYOUT_KIND_AUTO:
    default:
      return ControllerLayoutKind::autoDetect;
  }
}

padpilot::bridge::ControllerBindingKind toProtoControllerBindingKind(ControllerBindingKind value) {
  switch (value) {
    case ControllerBindingKind::button:
      return padpilot::bridge::CONTROLLER_BINDING_KIND_BUTTON;
    case ControllerBindingKind::axisPositive:
      return padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_POSITIVE;
    case ControllerBindingKind::axisNegative:
      return padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_NEGATIVE;
    case ControllerBindingKind::none:
    default:
      return padpilot::bridge::CONTROLLER_BINDING_KIND_NONE;
  }
}

ControllerBindingKind fromProtoControllerBindingKind(padpilot::bridge::ControllerBindingKind value) {
  switch (value) {
    case padpilot::bridge::CONTROLLER_BINDING_KIND_BUTTON:
      return ControllerBindingKind::button;
    case padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_POSITIVE:
      return ControllerBindingKind::axisPositive;
    case padpilot::bridge::CONTROLLER_BINDING_KIND_AXIS_NEGATIVE:
      return ControllerBindingKind::axisNegative;
    case padpilot::bridge::CONTROLLER_BINDING_KIND_NONE:
    default:
      return ControllerBindingKind::none;
  }
}

void populateProtoControllerConfig(const ControllerConfigState& source,
                                   padpilot::bridge::ControllerConfigState* destination) {
  if (destination == nullptr) {
    return;
  }
  destination->Clear();
  for (const auto& row : source.rows) {
    auto* entry = destination->add_rows();
    entry->set_stable_id(row.stableId);
    entry->set_hardware_id(row.hardwareId);
    entry->set_layout_kind(toProtoControllerLayoutKind(row.layoutKind));
    entry->set_custom_layout_id(row.customLayoutId);
    entry->set_is_primary(row.isPrimary);
  }
  for (const auto& layout : source.customLayouts) {
    auto* entry = destination->add_custom_layouts();
    entry->set_id(layout.id);
    entry->set_name(layout.name);
    for (const auto& binding : layout.buttonBindings) {
      auto* button = entry->add_button_bindings();
      button->set_binding_kind(toProtoControllerBindingKind(binding.bindingKind));
      button->set_source_index(binding.sourceIndex);
      button->set_threshold(binding.threshold);
    }
    for (const auto& axis : layout.axisBindings) {
      auto* axisEntry = entry->add_axis_bindings();
      axisEntry->set_source_index(axis.sourceIndex);
      axisEntry->set_inverted(axis.inverted);
    }
  }
}

ControllerConfigState controllerConfigFromProto(const padpilot::bridge::ControllerConfigState& source) {
  ControllerConfigState state;
  std::unordered_set<std::string> layoutIds;
  const auto layoutCount = std::min(
      source.custom_layouts_size(), static_cast<int>(kMaxCustomControllerLayouts));
  state.customLayouts.reserve(static_cast<std::size_t>(layoutCount));
  for (int layoutIndex = 0; layoutIndex < layoutCount; ++layoutIndex) {
    const auto& layout = source.custom_layouts(layoutIndex);
    CustomControllerLayout nextLayout;
    nextLayout.id = uniqueStableId(layout.id(), layoutIds);
    nextLayout.name = boundedText(layout.name(), kMaximumControllerLayoutNameBytes);
    if (nextLayout.name.empty()) {
      nextLayout.name = "Custom layout";
    }
    for (int index = 0; index < layout.button_bindings_size() &&
                        index < static_cast<int>(nextLayout.buttonBindings.size()); ++index) {
      const auto& binding = layout.button_bindings(index);
      const auto bindingKind = fromProtoControllerBindingKind(binding.binding_kind());
      const auto sourceLimit = bindingKind == ControllerBindingKind::button
                                   ? kMaxControllerButtons
                                   : kMaxControllerAxes;
      if (bindingKind == ControllerBindingKind::none ||
          binding.source_index() >= sourceLimit ||
          !std::isfinite(binding.threshold()) ||
          binding.threshold() < 0.0f || binding.threshold() > 1.0f) {
        continue;
      }
      nextLayout.buttonBindings[static_cast<std::size_t>(index)] = {
          bindingKind,
          static_cast<std::uint8_t>(binding.source_index()),
          binding.threshold(),
      };
    }
    for (int index = 0; index < layout.axis_bindings_size() &&
                        index < static_cast<int>(nextLayout.axisBindings.size()); ++index) {
      const auto& axis = layout.axis_bindings(index);
      if (axis.source_index() >= kMaxControllerAxes) {
        continue;
      }
      nextLayout.axisBindings[static_cast<std::size_t>(index)] = {
          static_cast<std::uint8_t>(axis.source_index()),
          axis.inverted(),
      };
    }
    state.customLayouts.push_back(std::move(nextLayout));
  }

  std::unordered_set<std::string> rowIds;
  const auto rowCount = std::min(
      source.rows_size(), static_cast<int>(kMaxControllerConfigRows));
  state.rows.reserve(static_cast<std::size_t>(rowCount));
  for (int rowIndex = 0; rowIndex < rowCount; ++rowIndex) {
    const auto& row = source.rows(rowIndex);
    ControllerConfigRow nextRow;
    nextRow.stableId = uniqueStableId(row.stable_id(), rowIds);
    nextRow.hardwareId = boundedText(row.hardware_id(), kMaximumControllerHardwareIdBytes);
    nextRow.layoutKind = fromProtoControllerLayoutKind(row.layout_kind());
    nextRow.customLayoutId = boundedText(row.custom_layout_id(), kMaximumControllerConfigIdBytes);
    nextRow.isPrimary = row.is_primary();
    if (nextRow.layoutKind == ControllerLayoutKind::customLayout &&
        !layoutIds.contains(nextRow.customLayoutId)) {
      nextRow.layoutKind = ControllerLayoutKind::autoDetect;
      nextRow.customLayoutId.clear();
    } else if (nextRow.layoutKind != ControllerLayoutKind::customLayout) {
      nextRow.customLayoutId.clear();
    }
    state.rows.push_back(std::move(nextRow));
  }
  ensureControllerConfigHasRow(&state);
  ensureControllerConfigPrimaryRow(&state);
  return state;
}

}  // namespace padpilot
