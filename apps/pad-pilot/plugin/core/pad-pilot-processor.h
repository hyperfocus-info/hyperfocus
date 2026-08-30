#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>

#include <juce_audio_processors/juce_audio_processors.h>

#include "audio/convolver-module-graph.h"
#include "generated/proto/analyzer.pb.h"
#include "generated/proto/bridge.pb.h"
#include "runtime/analyzer-runtime.h"
#include "runtime/controller-config.h"
#include "runtime/input-thread.h"
#include "runtime/lock-free-queue.h"
#include "runtime/managed-file-store.h"
#include "runtime/midi-output-runtime.h"
#include "runtime/module-store.h"
#include "runtime/preset-store.h"
#include "runtime/recut-runtime.h"
#include "runtime/runtime-types.h"
#include "runtime/sample-capability-proto.h"
#include "runtime/script-host.h"
#include "runtime/wake-signal.h"

class PadPilotAudioProcessor final : public juce::AudioProcessor,
                                     private juce::AudioProcessorValueTreeState::Listener {
 public:
  static constexpr int kMacroSlotCount = 16;
  static constexpr const char* kMasterInputParameterId = "pp.master.input_gain";
  static constexpr const char* kMasterWetDryParameterId = "pp.master.wet_dry";
  static constexpr const char* kMasterOutputParameterId = "pp.master.output_gain";

  enum class AutomationValueKind : std::uint8_t {
    floatValue = 0,
    booleanValue = 1,
  };

  enum class AutomationTargetKind : std::uint8_t {
    none = 0,
    masterInputGain = 1,
    masterWetDry = 2,
    masterOutputGain = 3,
    fxChainMix = 4,
    fxNodeMix = 5,
    fxNodeParamFloat = 6,
  };

  enum class ActiveRuntimeModule : std::uint8_t {
    none = 0,
    fx = 1,
    recut = 2,
    analyzer = 3,
    editor = 4,
    performance = 5,
    custom = 6,
  };

  struct AutomationBinding {
    int slotIndex {0};
    std::string moduleId;
    std::uint32_t chainId {0};
    std::uint32_t nodeId {0};
    std::string controlKey;
    std::string displayName;
    AutomationValueKind valueKind {AutomationValueKind::floatValue};
    AutomationTargetKind targetKind {AutomationTargetKind::none};
    std::uint32_t parameterId {0};
    float minValue {0.0f};
    float maxValue {1.0f};

    bool isActive() const noexcept { return targetKind != AutomationTargetKind::none; }
  };

  PadPilotAudioProcessor();
  ~PadPilotAudioProcessor() override;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;
  bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
  void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

  juce::AudioProcessorEditor* createEditor() override;
  bool hasEditor() const override;

  const juce::String getName() const override;
  bool acceptsMidi() const override;
  bool producesMidi() const override;
  bool isMidiEffect() const override;
  double getTailLengthSeconds() const override;

  int getNumPrograms() override;
  int getCurrentProgram() override;
  void setCurrentProgram(int index) override;
  const juce::String getProgramName(int index) override;
  void changeProgramName(int index, const juce::String& newName) override;

  void getStateInformation(juce::MemoryBlock& destinationData) override;
  void setStateInformation(const void* data, int sizeInBytes) override;

  std::vector<padpilot::ModuleRecord> getModules() const;
  bool createAndSaveModule(const std::string& name);
  std::optional<padpilot::ModuleRecord> installModuleBundle(const std::string& bundlePath,
                                                            std::string& errorMessage);
  bool selectModule(const std::string& moduleId);
  std::vector<padpilot::PresetRecord> getPresetsForSelectedModule() const;
  bool createAndSavePreset(const std::string& name, const std::string& payloadJson);
  bool createAndSavePresetProto(const padpilot::bridge::PresetSaveRequest& request);
  bool selectPreset(const std::string& presetId);
  bool queueAudioCommand(const padpilot::AudioCommand& command);
  padpilot::ControllerState getControllerState() const;
  padpilot::RuntimeDiagnostics getRuntimeDiagnostics() const;
  std::string getSelectedModuleId() const;
  std::string getSelectedPresetId() const;
  bool setModuleStatePayload(const std::string& moduleId, const std::string& payloadJson);
  bool setModuleStatePayloadBase64(const std::string& moduleId,
                                   const std::string& payloadBase64,
                                   std::uint64_t revision);
  bool setControllerConfigPayloadBase64(const std::string& payloadBase64);
  padpilot::ControllerConfigState getControllerConfig() const;
  std::unordered_map<std::string, std::string> getModuleStatePayloads() const;
  bool setEditorViewStatePayload(const std::string& scopeId, const std::string& payloadJson);
  std::unordered_map<std::string, std::string> getEditorViewStatePayloads() const;
  std::string buildHostSyncFrameBase64();
  std::string buildNavigationFrameBase64();
  std::string buildActiveModuleStateFrameBase64();
  std::string buildInputStateFrameBase64() const;
  std::string buildVisualizerFrameBase64();
  std::string buildAnalyzerStateBase64();
  std::string buildAnalyzerFrameBase64();
  std::uint64_t getAnalyzerStateRevision() const;
  void setEditorTelemetryVisible(bool visible);
  void setDiagnosticsTelemetryVisible(bool visible);
  bool focusAutomationTarget(const AutomationBinding& binding);
  bool beginAutomationTouch(const std::string& parameterId);
  bool updateAutomationTouch(const std::string& parameterId, float normalizedValue);
  bool endAutomationTouch(const std::string& parameterId);
  void endAllAutomationTouches();
  bool executeHotkeyMacro(const std::string& moduleId,
                          const std::vector<std::string>& shortcuts);
  void openAnalyzerStream(const std::string& moduleId);
  void closeAnalyzerStream(const std::string& moduleId);
  void startAnalyzerCapture(bool append);
  void stopAnalyzerCapture();
  void setAnalyzerTuningHz(float tuningHz);
  void setAnalyzerDetectionSensitivity(float detectionSensitivity);
  bool correctAnalyzerNote(std::uint64_t eventId, std::uint8_t midiNote);
  bool resetAnalyzerNoteCorrection(std::uint64_t eventId);
  bool writeAnalyzerMidiFile(const std::string& path, juce::String& errorMessage) const;
  void requestHostTempo(float bpm);
  void openCapabilityStream(const std::string& capability, const std::string& handle);
  void closeCapabilityStream(const std::string& capability, const std::string& handle);
  bool sendCapabilityIntent(const std::string& capability,
                            const std::string& handle,
                            const std::string& action,
                            const std::string& payloadBase64);
  std::optional<padpilot::ManagedFileRecord> importManagedSampleFile(const std::string& sourcePath,
                                                                     std::uint64_t maxBytes,
                                                                     std::string& errorMessage);
  std::optional<padpilot::ManagedFileRecord> importManagedSampleBytes(const void* data,
                                                                      std::size_t size,
                                                                      const std::string& sourceName,
                                                                      const std::string& mimeType,
                                                                      std::uint64_t maxBytes,
                                                                      std::string& errorMessage);
  bool canImportManagedMediaCategory(const std::string& category) const;
  std::optional<padpilot::ManagedFileRecord> importManagedImpulseResponseFile(
      const std::string& sourcePath,
      std::uint64_t maxBytes,
      std::string& errorMessage);
  std::optional<padpilot::ManagedFileRecord> importManagedImpulseResponseBytes(
      const void* data,
      std::size_t size,
      const std::string& sourceName,
      const std::string& mimeType,
      std::uint64_t maxBytes,
      std::string& errorMessage);
  std::string buildCapabilityFrameEnvelopeBase64();
  std::optional<std::string> resolveModuleWebResourcePath(const std::string& webPath) const;
  std::string buildSelectedModuleCapabilityHandle(const std::string& capability,
                                                  const std::string& slot = "primary") const;

 private:
  struct ModuleStateSnapshot {
    std::string moduleId;
    std::string payload;

    bool isValid() const noexcept { return !moduleId.empty() && !payload.empty(); }
  };

  struct RealtimeAutomationBinding {
    std::atomic<std::uint32_t> generation {0};
    std::atomic<int> targetKind {static_cast<int>(AutomationTargetKind::none)};
    std::atomic<int> valueKind {static_cast<int>(AutomationValueKind::floatValue)};
    std::atomic<std::uint32_t> chainId {0};
    std::atomic<std::uint32_t> nodeId {0};
    std::atomic<std::uint32_t> parameterId {0};
    std::atomic<float> minValue {0.0f};
    std::atomic<float> maxValue {1.0f};
  };

  static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
  static juce::String getMacroParameterId(int slotIndex);
  static juce::String getDirectParameterId(AutomationTargetKind targetKind);
  static float normalizeAutomationValue(float value, float minValue, float maxValue);
  static float denormalizeAutomationValue(float normalizedValue, float minValue, float maxValue);
  static bool isValidFxState(const padpilot::fx::FxChainState& state);
  bool isValidManagedFxState(const padpilot::fx::FxChainState& state) const;
  static bool isValidAutomationBinding(const AutomationBinding& binding);

  void parameterChanged(const juce::String& parameterID, float newValue) override;
  bool applyCommandToGraph(const padpilot::AudioCommand& command);
  void applyPresetPayloadJson(const std::string& payloadJson);
  void applyPresetPayload(const std::string& moduleId, const std::string& payload);
  void applyPresetPayloadWhileStateTransitionLocked(const std::string& moduleId,
                                                     const std::string& payload);
  void applyRestoredStateToRuntime(const std::string& moduleId, const std::string& payload);
  void applyRestoredStateWhileStateTransitionLocked(const std::string& moduleId,
                                                     const std::string& payload);
  void applyFxChainState(const padpilot::fx::FxChainState& state, bool allowSuspend = true);
  void applyFxStateDiff(const padpilot::fx::FxChainState& state);
  bool hasFxTopologyChanges(const padpilot::fx::FxChainState& previous,
                            const padpilot::fx::FxChainState& next) const;
  bool hasUnsupportedFxRuntimeDiffs(const padpilot::fx::FxChainState& previous,
                                    const padpilot::fx::FxChainState& next) const;
  bool queueSupportedFxDiffCommands(const padpilot::fx::FxChainState& previous,
                                    const padpilot::fx::FxChainState& next);
  void queueAutomationCommand(const AutomationBinding& binding, float normalizedValue);
  void queueAutomationCommand(const RealtimeAutomationBinding& binding, float normalizedValue);
  void appendImportedMediaForModuleState(const std::string& moduleId,
                                         const std::string& payloadBase64,
                                         padpilot::bridge::PluginState& pluginState) const;
  bool healManagedMediaForRecutState(const padpilot::bridge::ImportedMediaEntry& importedMedia,
                                     std::string* modulePayloadBase64) const;
  bool healManagedMediaForFxState(const padpilot::bridge::ImportedMediaEntry& importedMedia,
                                  std::string* modulePayloadBase64) const;
  void updateLastAppliedFxState(const padpilot::fx::FxChainState& state);
  void syncDirectParametersFromFxState(const padpilot::fx::FxChainState& state);
  void markFxRuntimeStateDirty();
  void reconcileFxStateFromParameters();
  void reconcileFxStateFromParametersIfDirty();
  void refreshTelemetryMode();
  void setParameterNormalizedSilently(const juce::String& parameterId, float normalizedValue);
  std::optional<std::size_t> getAutomationTouchIndex(const juce::String& parameterId) const;
  float readParameterNormalized(const juce::String& parameterId) const;
  float readParameterDenormalized(const juce::String& parameterId) const;
  std::string serializePluginStateToJson() const;
  std::string serializePluginStateToProtobuf() const;
  bool restorePluginStateFromJson(const std::string& jsonState);
  bool restorePluginStateFromProtobuf(const void* data, int sizeInBytes);
  std::string getSelectedPresetPayloadLocked() const;
  std::string getModuleStatePayloadLocked(const std::string& moduleId) const;
  std::string getModuleStatePayloadBase64Locked(const std::string& moduleId) const;
  std::string getModuleStateBytesLocked(const std::string& moduleId) const;
  const padpilot::ModuleRecord* findModuleRecordLocked(const std::string& moduleId) const;
  bool moduleProvidesCapabilityLocked(const std::string& moduleId,
                                      std::string_view capability) const;
  std::string getSelectedFxGraphOwnerLocked() const;
  padpilot::ScriptModuleLoadRequest getScriptModuleLoadRequestLocked(const std::string& moduleId) const;
  bool migrateModuleStateAfterScriptLoad(const std::string& moduleId,
                                         std::string* payload);
  std::string canonicalizeModuleId(const std::string& moduleId) const;
  void syncRealtimeAutomationBinding(int slotIndex, const AutomationBinding& binding);
  const AutomationBinding& getAutomationBinding(int slotIndex) const;
  void startPerfDiagnostics();
  void stopPerfDiagnostics();
  void writePerfSnapshotToTempLog() const;
  void handleAnalyzerModuleSwitchLocked(const std::string& previousModuleId,
                                        const std::string& nextModuleId);
  void setSelectedModuleLocked(const std::string& moduleId);
  void syncSelectedRuntimeModule(const std::string& moduleId);
  void setRecutPlaybackOwner(const std::string& moduleId, bool active = true);
  void requestMidiOutputPanic() noexcept;
  bool handleModuleStateComparisonIntent(const std::string& moduleId, const std::string& action);
  static ActiveRuntimeModule runtimeModuleForId(std::string_view moduleId);
  static std::uint64_t runtimeModuleKeyForId(std::string_view moduleId);
  void syncControllerConfigWithInputDevicesLocked(const padpilot::InputDeviceStates& inputDevices);

  padpilot::LockFreeQueue<padpilot::InputEvent, 2048> inputEventQueue_;
  padpilot::LockFreeQueue<padpilot::AudioCommand, 2048> scriptAudioCommandQueue_;
  padpilot::LockFreeQueue<padpilot::AudioCommand, 2048> uiAudioCommandQueue_;
  padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticCommandQueue_;
  padpilot::MidiOutputRuntime midiOutputRuntime_;
  std::atomic<std::uint64_t> graphCommandEpoch_ {1};
  padpilot::WakeSignal inputSignal_;

  padpilot::ScriptHost scriptHost_;
  padpilot::InputThread inputThread_;
  padpilot::ConvolverModuleGraph convolverGraph_;
  padpilot::AnalyzerRuntime analyzerRuntime_;
  padpilot::ManagedFileStore managedFileStore_;
  padpilot::RecutRuntime recutRuntime_;
  padpilot::ModuleStore moduleStore_;
  padpilot::PresetStore presetStore_;
  juce::AudioProcessorValueTreeState parameters_;

  mutable std::mutex stateMutex_;
  std::mutex runtimeLifecycleMutex_;
  std::mutex moduleStateApplyMutex_;
  std::mutex realtimeAutomationBindingWriteMutex_;
  std::mutex automationTouchMutex_;
  std::mutex graphMutationMutex_;
  std::vector<padpilot::ModuleRecord> modules_;
  std::vector<padpilot::PresetRecord> presets_;
  std::string selectedModuleId_;
  std::string selectedPresetId_;
  std::string fxGraphOwnerModuleId_;
  std::unordered_map<std::string, std::string> moduleStatePayloadById_;
  std::unordered_map<std::string, std::string> editorViewStatePayloadByScope_;
  std::unordered_map<std::string, std::uint64_t> acceptedRevisionByModuleId_;
  padpilot::ControllerConfigState controllerConfig_ {padpilot::createDefaultControllerConfig()};
  std::optional<std::string> pendingPresetPayloadJson_;
  std::optional<padpilot::fx::FxChainState> lastAppliedFxState_;
  std::array<AutomationBinding, kMacroSlotCount> automationBindings_ {};
  std::array<ModuleStateSnapshot, 2> moduleStateComparisonSnapshots_ {};
  std::size_t lastRecalledModuleStateSnapshot_ {1};
  bool hasRestoredState_ {false};

  std::array<RealtimeAutomationBinding, kMacroSlotCount> realtimeAutomationBindings_ {};
  std::array<bool, kMacroSlotCount + 3> activeAutomationTouches_ {};
  std::atomic<bool> fxRuntimeStateDirty_ {false};
  std::atomic<bool> fxRuntimeResyncRequested_ {false};
  std::atomic<bool> graphMutationRequested_ {false};
  std::atomic<std::uint32_t> graphReaders_ {0};
  std::atomic<std::uint64_t> uiAudioCommandsPushed_ {0};
  std::atomic<std::uint64_t> uiAudioCommandsDropped_ {0};
  std::atomic<std::uint64_t> audioCommandsRejected_ {0};
  std::atomic<bool> editorTelemetryVisible_ {false};
  std::atomic<bool> diagnosticsTelemetryVisible_ {false};
  std::atomic<bool> runtimeStarted_ {false};
  std::atomic<bool> analyzerStreamActive_ {false};
  std::atomic<bool> analyzerCaptureActive_ {false};
  std::atomic<bool> capabilityStreamActive_ {false};
  std::atomic<bool> fxGraphProcessingActive_ {false};
  std::atomic<ActiveRuntimeModule> activeRuntimeModule_ {ActiveRuntimeModule::none};
  std::atomic<std::uint64_t> activeRuntimeModuleKey_ {0};
  std::atomic<bool> recutPlaybackActive_ {false};
  std::atomic<ActiveRuntimeModule> recutPlaybackOwnerModule_ {ActiveRuntimeModule::none};
  std::atomic<std::uint64_t> recutPlaybackOwnerKey_ {0};
  bool perfDiagnosticsEnabled_ {false};
  std::atomic<bool> perfDiagnosticsRunning_ {false};
  std::thread perfDiagnosticsThread_;
  mutable std::atomic<std::uint64_t> visualizerSequence_ {0};
  std::atomic<float> lastKnownProjectBpm_ {120.0f};
  std::string analyzerStreamModuleId_;
  std::string capabilityStreamKind_;
  std::string capabilityStreamHandle_;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PadPilotAudioProcessor)
};



