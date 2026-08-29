#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "generated/proto/bridge.pb.h"
#include "runtime/runtime-types.h"

namespace padpilot {

inline constexpr std::size_t kCanonicalGamepadAxes = 4;
inline constexpr std::size_t kCanonicalGamepadButtons = 16;
inline constexpr std::size_t kMaxControllerConfigRows = 64;
inline constexpr std::size_t kMaxCustomControllerLayouts = 64;
inline constexpr std::size_t kMaximumControllerConfigIdBytes = 128U;
inline constexpr std::size_t kMaximumControllerHardwareIdBytes = kMaxDeviceIdChars - 1U;
inline constexpr std::size_t kMaximumControllerLayoutNameBytes = 128U;

struct ControllerButtonBinding {
  ControllerBindingKind bindingKind {ControllerBindingKind::none};
  std::uint8_t sourceIndex {0};
  float threshold {0.5f};
};

struct ControllerAxisBinding {
  std::uint8_t sourceIndex {0};
  bool inverted {false};
};

struct CustomControllerLayout {
  std::string id;
  std::string name;
  std::array<ControllerButtonBinding, kCanonicalGamepadButtons> buttonBindings {};
  std::array<ControllerAxisBinding, kCanonicalGamepadAxes> axisBindings {};
};

struct ControllerConfigRow {
  std::string stableId;
  std::string hardwareId;
  ControllerLayoutKind layoutKind {ControllerLayoutKind::autoDetect};
  std::string customLayoutId;
  bool isPrimary {false};
};

struct ControllerConfigState {
  std::vector<ControllerConfigRow> rows;
  std::vector<CustomControllerLayout> customLayouts;
};

struct ControllerAxisCalibration {
  float center {0.0f};
  float noiseFloor {0.0f};
  float lastPublishedValue {0.0f};
};

std::string makeControllerStableId();
std::string makeControllerHardwareId(std::uint16_t vendorId,
                                     std::uint16_t productId,
                                     std::string_view serial,
                                     std::string_view devicePath,
                                     std::string_view guid);
ControllerConfigState createDefaultControllerConfig();
void ensureControllerConfigHasRow(ControllerConfigState* state);
void ensureControllerConfigPrimaryRow(ControllerConfigState* state);
bool syncControllerConfigRows(ControllerConfigState* state,
                              const std::vector<std::string>& connectedHardwareIds);
ControllerLayoutKind detectControllerLayout(std::string_view displayName,
                                            std::string_view hardwareId);
const ControllerConfigRow* findControllerConfigRow(const ControllerConfigState& state,
                                                   std::string_view hardwareId);
const CustomControllerLayout* findCustomControllerLayout(const ControllerConfigState& state,
                                                         std::string_view customLayoutId);
float resolveControllerButtonValue(const ControllerButtonBinding& binding,
                                   std::span<const float> rawAxes,
                                   std::span<const float> rawButtons);
float calibrateControllerAxis(ControllerAxisCalibration& calibration, float rawValue);
bool shouldPublishControllerAxis(ControllerAxisCalibration& calibration, float value);
std::optional<std::size_t> findPrimaryControllerDeviceSlot(
    const ControllerConfigState& state,
    const InputDeviceStates& inputDevices);

padpilot::bridge::ControllerLayoutKind toProtoControllerLayoutKind(ControllerLayoutKind value);
ControllerLayoutKind fromProtoControllerLayoutKind(padpilot::bridge::ControllerLayoutKind value);
padpilot::bridge::ControllerBindingKind toProtoControllerBindingKind(ControllerBindingKind value);
ControllerBindingKind fromProtoControllerBindingKind(padpilot::bridge::ControllerBindingKind value);

void populateProtoControllerConfig(const ControllerConfigState& source,
                                   padpilot::bridge::ControllerConfigState* destination);
ControllerConfigState controllerConfigFromProto(const padpilot::bridge::ControllerConfigState& source);

}  // namespace padpilot
