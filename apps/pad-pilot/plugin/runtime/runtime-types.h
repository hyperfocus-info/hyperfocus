#pragma once

#include <atomic>
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <string_view>

namespace padpilot {

inline constexpr std::size_t kMaxPathChars = 260;
inline constexpr std::size_t kMaxControllerAxes = 8;
inline constexpr std::size_t kMaxControllerButtons = 32;
inline constexpr std::size_t kMaxDeviceNameChars = 128;
inline constexpr std::size_t kMaxDeviceIdChars = 128;
inline constexpr std::size_t kMaxInputDevices = 8;
inline constexpr std::size_t kMaxFxChains = 8;
inline constexpr std::uint32_t kButtonParameterOffset = 1024;
inline constexpr std::uint32_t kPrimaryHapticDeviceSlot =
    std::numeric_limits<std::uint32_t>::max();

inline std::uint64_t advanceGraphEpoch(std::atomic<std::uint64_t>& graphEpoch) noexcept {
  auto current = graphEpoch.load(std::memory_order_acquire);
  for (;;) {
    const auto next = current == std::numeric_limits<std::uint64_t>::max()
                          ? std::uint64_t {1}
                          : current + 1;
    if (graphEpoch.compare_exchange_weak(
            current, next, std::memory_order_acq_rel, std::memory_order_acquire)) {
      return next;
    }
  }
}

enum class InputDeviceKind : std::uint8_t {
  unknown = 0,
  gamepad = 1,
};

enum class ControllerLayoutKind : std::uint8_t {
  autoDetect = 0,
  xbox = 1,
  playstation = 2,
  switchPro = 3,
  generic = 4,
  customLayout = 5,
};

enum class ControllerBindingKind : std::uint8_t {
  none = 0,
  button = 1,
  axisPositive = 2,
  axisNegative = 3,
};

enum class InputEventType : std::uint8_t {
  button,
  axis,
  controlStreamReset
};

struct InputEvent {
  InputDeviceKind deviceKind {InputDeviceKind::unknown};
  std::uint8_t deviceSlot {};
  InputEventType type {};
  std::uint16_t controlId {};
  InputEventType mappedType {InputEventType::axis};
  std::uint16_t mappedControlId {};
  bool mappedControlActive {false};
  float value {};
  std::uint32_t frameIndex {};
  std::uint64_t graphEpoch {};
};

enum class AudioCommandType : std::uint8_t {
  setParameter,
  setConvolverWetDry,
  setDelayWetDry,
  setDelayTimeBeats,
  setDelayTimeHz,
  setDelaySyncEnabled,
  setDelayFeedback,
  setDelayLowCutHz,
  setDelayHighCutHz,
  setDelayWidth,
  setReverbWetDry,
  setReverbPreDelayMs,
  setReverbDecaySeconds,
  setReverbSize,
  setReverbDampening,
  setReverbWidth,
  setModulationRateHz,
  setModulationDepth,
  setModulationFeedback,
  setModulationMix,
  setModulationStereoPhase,
  setModulationMode,
  setEqBandCount,
  setEqBandType,
  setEqBandFrequency,
  setEqBandGainDb,
  setEqBandQ,
  setEqBandEnabled,
  setFxChainEnabled,
  setFxChainType,
  setFxChainMix,
  setFxChainGainDb,
  setFxChainOrder,
  setFxChainMuted,
  setFxChainSolo,
  setFxNodeBypassed,
  setFxNodeMuted,
  setFxNodeSolo,
  setFxNodeMix,
  setFxNodeParamFloat,
  setMasterInputGainDb,
  setMasterWetDry,
  setOutputGainDb
};

// VST3 exposes no tail-change notification. Hosts may cache getTailSamples(), so
// the processor must advertise one stable upper bound from construction.
inline constexpr double kMaximumFxTailLengthSeconds = 3600.0;

struct AudioCommand {
  AudioCommandType type {AudioCommandType::setParameter};
  std::uint32_t parameterId {};
  float value {};
  float valueB {};
  bool boolValue {};
  char text[kMaxPathChars] {};
  std::uint64_t graphEpoch {};
};

enum class RecutCommandType : std::uint8_t {
  loadSource,
  reanalyze,
  triggerPad,
  nudgeMarker,
  setPadAssignment,
  setChokeGroup,
  setPitchSemitones,
  setGainDb,
  setStretchEnabled,
  setGranularEnabled,
  setGrainSizeMs,
  setGrainDensity,
};

struct RecutCommand {
  RecutCommandType type {RecutCommandType::reanalyze};
  std::uint32_t padIndex {};
  std::uint32_t bank {};
  std::uint32_t sliceIndex {};
  std::uint32_t chokeGroupId {};
  float value {};
  float valueB {};
  bool boolValue {false};
  char text[kMaxPathChars] {};
};

struct HapticCommand {
  std::uint32_t deviceSlot {0};
  float lowFrequency {0.0f};
  float highFrequency {0.0f};
  std::uint32_t durationMs {0};
};

enum class MidiOutputCommandType : std::uint8_t {
  noteOn,
  noteOff,
  controlChange,
};

struct MidiOutputCommand {
  MidiOutputCommandType type {MidiOutputCommandType::noteOff};
  std::uint8_t channel {1};
  std::uint8_t data1 {};
  std::uint8_t data2 {};
  std::uint32_t sampleOffset {};
};

struct InputDeviceState {
  bool connected {false};
  InputDeviceKind kind {InputDeviceKind::unknown};
  std::uint32_t frameIndex {0};
  std::int32_t runtimeInstanceId {-1};
  std::array<char, kMaxDeviceIdChars> deviceId {};
  std::array<char, kMaxDeviceIdChars> runtimeDeviceId {};
  std::array<char, kMaxDeviceIdChars> hardwareId {};
  std::array<char, kMaxDeviceNameChars> displayName {};
  std::array<float, kMaxControllerAxes> axes {};
  std::array<float, kMaxControllerButtons> buttons {};
  std::array<float, kMaxControllerAxes> rawAxes {};
  std::array<float, kMaxControllerButtons> rawButtons {};
  ControllerLayoutKind detectedLayoutKind {ControllerLayoutKind::autoDetect};
  ControllerLayoutKind activeLayoutKind {ControllerLayoutKind::autoDetect};
};

struct ControllerState {
  bool connected {false};
  std::uint32_t frameIndex {0};
  std::array<float, kMaxControllerAxes> axes {};
  std::array<float, kMaxControllerButtons> buttons {};
};

using InputDeviceStates = std::array<InputDeviceState, kMaxInputDevices>;

template <std::size_t N>
inline std::string_view cStringView(const std::array<char, N>& value) {
  return value.data();
}

struct RuntimeChainDiagnostics {
  std::uint32_t chainId {};
  bool active {};
  bool muted {};
  bool solo {};
  std::uint32_t activeNodeCount {};
  float avgChainUs {};
  float inputPeakDb {};
  float outputPeakDb {};
};

struct RuntimeDiagnostics {
  std::uint64_t inputWakeups {};
  std::uint64_t inputEventsPushed {};
  std::uint64_t inputEventsDropped {};
  std::uint64_t inputCommandsPushed {};
  std::uint64_t inputCommandsDropped {};
  std::uint64_t scriptWakeups {};
  std::uint64_t scriptEventsProcessed {};
  std::uint64_t scriptCommandsPushed {};
  std::uint64_t scriptCommandsDropped {};
  std::uint64_t uiAudioCommandsPushed {};
  std::uint64_t uiAudioCommandsDropped {};
  std::uint64_t audioCommandsRejected {};
  std::uint64_t analyzerAudioSlicesPushed {};
  std::uint64_t analyzerAudioSlicesDropped {};
  bool profilingEnabled {};
  std::uint64_t profiledBlocks {};
  float avgBlockUs {};
  float avgConvolverUs {};
  float avgDelayUs {};
  float avgReverbUs {};
  float avgReverbPreDelayUs {};
  float avgReverbCoreUs {};
  float avgReverbMixUs {};
  float avgModulationUs {};
  float avgEqUs {};
  float convolverPeakDb {};
  float delayPeakDb {};
  float reverbPeakDb {};
  float modulationPeakDb {};
  float eqPeakDb {};
  float outputPeakDb {};
  std::array<RuntimeChainDiagnostics, kMaxFxChains> chains {};
};

enum class ScriptActionType : std::uint8_t {
  none,
  keystroke,
  audioCommand
};

struct ScriptAction {
  ScriptActionType type {ScriptActionType::none};
  std::uint16_t keyCode {};
  bool isKeyDown {false};
  AudioCommand audioCommand {};
};

}  // namespace padpilot
