#pragma once

#include "core/pad-pilot-processor.h"

#include <algorithm>
#include <chrono>
#include <charconv>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_set>

#include <juce_core/juce_core.h>

#include "runtime/analyzer-proto.h"
#include "runtime/automation-identity.h"
#include "runtime/backend-log.h"
#include "runtime/bounded-json.h"
#include "runtime/capability-handle.h"
#include "runtime/fx-chain-proto.h"
#include "runtime/module-identity.h"
#include "runtime/module-manifest-limits.h"
#include "runtime/plugin-state-wire.h"
#include "runtime/preset-identity.h"
#include "runtime/recut-proto.h"
#include "runtime/state-wire-limits.h"
#include "runtime/storage-path-safety.h"

namespace padpilot::processor_detail {
class AudioGraphReadGuard {
 public:
  AudioGraphReadGuard(std::atomic<bool>& mutationRequested,
                      std::atomic<std::uint32_t>& readers) noexcept
      : readers_(readers) {
    if (mutationRequested.load(std::memory_order_acquire)) {
      return;
    }
    readers_.fetch_add(1, std::memory_order_acq_rel);
    if (mutationRequested.load(std::memory_order_acquire)) {
      readers_.fetch_sub(1, std::memory_order_release);
      return;
    }
    acquired_ = true;
  }

  ~AudioGraphReadGuard() {
    if (acquired_) {
      readers_.fetch_sub(1, std::memory_order_release);
    }
  }

  explicit operator bool() const noexcept {
    return acquired_;
  }

 private:
  std::atomic<std::uint32_t>& readers_;
  bool acquired_ {false};
};

class GraphMutationGuard {
 public:
  GraphMutationGuard(juce::AudioProcessor& processor,
                     std::atomic<bool>& mutationRequested,
                     std::atomic<std::uint32_t>& readers,
                     bool suspendProcessor = true) noexcept
      : processor_(processor), mutationRequested_(mutationRequested), suspendProcessor_(suspendProcessor) {
    mutationRequested_.store(true, std::memory_order_release);
    if (suspendProcessor_) {
      processor_.suspendProcessing(true);
    }
    while (readers.load(std::memory_order_acquire) != 0) {
      std::this_thread::yield();
    }
  }

  ~GraphMutationGuard() {
    mutationRequested_.store(false, std::memory_order_release);
    if (suspendProcessor_) {
      processor_.suspendProcessing(false);
    }
  }

 private:
  juce::AudioProcessor& processor_;
  std::atomic<bool>& mutationRequested_;
  bool suspendProcessor_ {true};
};

std::string readEnvironmentValue(const char* name);
std::string resolveModulePath();
bool isCpuProfilingEnabled();

constexpr const char* kFxModuleId = padpilot::kFxModuleId.data();
constexpr const char* kLegacyReverbModuleId = padpilot::kLegacyReverbModuleId.data();
constexpr const char* kAnalyzerModuleId = "analyzer";
constexpr const char* kRecutModuleId = "recut";
constexpr const char* kLegacyRemovedCompressorModuleId = "compressor";
constexpr std::uint32_t kPluginStateSchemaVersion = 8U;
constexpr int kLegacyJsonStateSchemaVersion = 2;
constexpr std::size_t kMaxModuleStateBytes = padpilot::state_wire_limits::kMaximumModuleStateBytes;
constexpr std::size_t kMaxModuleStateBase64Chars =
    padpilot::state_wire_limits::kMaximumModuleStateBase64Chars;
constexpr std::size_t kMaxCapabilityNameBytes = 64U;
constexpr std::size_t kMaxCapabilityHandleBytes = 512U;
constexpr std::size_t kMaxCapabilityActionBytes = 64U;
constexpr std::size_t kMaxAutomationJsonBytes = 16U * 1024U;
constexpr float kMaxAutomationValueMagnitude = 1.0e6f;
constexpr std::size_t kMaxKeyboardOutputPayloadBytes = 8U * 1024U;
constexpr std::size_t kMaxKeyboardOutputPayloadBase64Chars =
    ((kMaxKeyboardOutputPayloadBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxKeyboardOutputShortcuts = 8U;
constexpr std::size_t kMaxKeyboardOutputShortcutBytes = 128U;
constexpr std::size_t kMaxMidiOutputPayloadBytes = 256U;
constexpr std::size_t kMaxMidiOutputPayloadBase64Chars =
    ((kMaxMidiOutputPayloadBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxMidiExportBytes = 8U * 1024U * 1024U;
constexpr std::size_t kMaxMidiExportBase64Chars = ((kMaxMidiExportBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxMidiExportFilenameBytes = 256U;
constexpr std::size_t kMaxMidiDragJsonBytes =
    kMaxMidiExportBase64Chars + kMaxMidiExportFilenameBytes + 64U;
constexpr std::size_t kMaxMidiDragPayloadBase64Chars = ((kMaxMidiDragJsonBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxPluginStateBytes = padpilot::state_wire_limits::kMaximumPluginStateBytes;
constexpr std::size_t kMaxCapabilitySlotBytes = 128U;
constexpr std::size_t kMaxAutomationControlKeyBytes = 128U;
constexpr std::size_t kMaxDisplayNameBytes = 256U;
constexpr std::size_t kMaxModuleVersionBytes = padpilot::module_manifest_limits::kMaximumVersionBytes;
constexpr std::size_t kMaxEditorViewStateBytes =
    padpilot::state_wire_limits::kMaximumEditorViewStateBytes;
constexpr std::size_t kMaxEditorScopeBytes = 128U;
constexpr std::size_t kMaxControllerConfigBytes =
    padpilot::state_wire_limits::kMaximumControllerConfigBytes;
constexpr std::size_t kMaxControllerConfigBase64Chars = ((kMaxControllerConfigBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxAggregateModuleStateBytes =
    padpilot::state_wire_limits::kMaximumAggregateModuleStateBytes;
constexpr std::size_t kMaxAggregatePresetStateBytes =
    padpilot::state_wire_limits::kMaximumAggregatePresetStateBytes;
constexpr std::size_t kMaxAggregateEditorViewStateBytes =
    padpilot::state_wire_limits::kMaximumAggregateEditorViewStateBytes;
constexpr int kMaxPersistedModules = static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedModules);
constexpr int kMaxPersistedPresets = static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedPresets);
constexpr int kMaxStoredModuleStates = kMaxPersistedModules;
constexpr int kMaxPersistedModuleStates = kMaxStoredModuleStates + 2;
constexpr int kMaxPersistedEditorViewStates =
    static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedEditorViewStates);
constexpr int kMaxPersistedImportedMedia =
    static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedImportedMedia);
constexpr std::size_t kMaxAggregateImportedMediaBytes =
    padpilot::state_wire_limits::kMaximumAggregateImportedMediaBytes;
constexpr int kMaxPersistedAutomationBindings =
    static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedAutomationBindings);
constexpr std::uint32_t kMaxHapticDurationMs = 10'000U;
constexpr std::array<std::string_view, 1> kGlobalEditorViewScopes {"app-shell"};

constexpr std::uint32_t encodeNodeTargetId(std::uint32_t chainId, std::uint32_t nodeId, std::uint32_t parameterId = 0) {
  return ((chainId & 0xffU) << 16U) | ((nodeId & 0xffU) << 8U) | (parameterId & 0xffU);
}

bool isLegacyRemovedBuiltInModuleId(const std::string& moduleId);
bool isSafePersistedKey(const std::string& value, std::size_t maxBytes);
bool isKnownControllerLayoutKind(padpilot::bridge::ControllerLayoutKind value);
bool isKnownControllerBindingKind(padpilot::bridge::ControllerBindingKind value);
bool isValidControllerConfigProto(const padpilot::bridge::ControllerConfigState& config);
bool hasReadyModule(const std::vector<padpilot::ModuleRecord>& modules,
                    const std::string& selectedModuleId,
                    const std::string& moduleId);
bool isGlobalEditorViewScope(std::string_view scopeId);
bool canReplaceBoundedPayload(const std::unordered_map<std::string, std::string>& payloads,
                              const std::string& key,
                              std::size_t nextSize,
                              std::size_t maxAggregateBytes);
std::vector<padpilot::PresetRecord> boundPersistedPresets(std::vector<padpilot::PresetRecord> presets);
std::vector<padpilot::ModuleRecord> boundInstalledModules(std::vector<padpilot::ModuleRecord> modules);
std::vector<padpilot::ModuleRecord> mergeInstalledModuleInventory(
    std::vector<padpilot::ModuleRecord> restoredModules,
    const std::vector<padpilot::ModuleRecord>& installedModules);
bool isValidRecutState(const padpilot::recut::RecutModuleState& state);
bool isValidAnalyzerState(const padpilot::analyzer::AnalyzerModuleState& state);

struct BoundedAnalyzerStateSnapshot {
  std::string payloadBytes;
  std::uint64_t revision {0};
};

struct BoundedRecutStateSnapshot {
  std::string payloadBytes;
  std::uint64_t revision {0};
};
std::optional<BoundedRecutStateSnapshot> readBoundedRecutStateSnapshot(
    const padpilot::RecutRuntime& runtime);
std::optional<BoundedAnalyzerStateSnapshot> readBoundedAnalyzerStateSnapshot(
    const padpilot::AnalyzerRuntime& runtime);

std::optional<float> parseFiniteFloat(const std::string& text);

struct AnalyzerNoteCorrectionPayload {
  std::uint64_t eventId {0};
  std::uint8_t midiNote {0};
};
std::optional<AnalyzerNoteCorrectionPayload> parseAnalyzerNoteCorrection(const std::string& text);
std::optional<std::uint64_t> parseAnalyzerEventId(const std::string& text);
bool looksLikeJsonObject(const void* data, std::size_t size);

}  // namespace padpilot::processor_detail
