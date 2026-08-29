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

#include "core/pad-pilot-editor.h"
#include "runtime/analyzer-proto.h"
#include "runtime/backend-log.h"
#include "runtime/bounded-json.h"
#include "runtime/fx-chain-proto.h"
#include "runtime/plugin-state-wire.h"
#include "runtime/recut-proto.h"
#include "runtime/storage-path-safety.h"

#include "core/pad-pilot-processor-internal.h"

using namespace padpilot::processor_detail;

PadPilotAudioProcessor::PadPilotAudioProcessor()
    : juce::AudioProcessor(BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                               .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      scriptHost_(inputEventQueue_, scriptAudioCommandQueue_, inputSignal_, graphCommandEpoch_),
      inputThread_(inputEventQueue_, hapticCommandQueue_, inputSignal_, graphCommandEpoch_),
      parameters_(*this, nullptr, "PadPilotParameters", createParameterLayout()) {
  perfDiagnosticsEnabled_ = isCpuProfilingEnabled();
  padpilot::appendBackendLog("processor", "backend logging active path=" + padpilot::getBackendLogFile().getFullPathName().toStdString());

  parameters_.addParameterListener(getDirectParameterId(AutomationTargetKind::masterInputGain), this);
  parameters_.addParameterListener(getDirectParameterId(AutomationTargetKind::masterWetDry), this);
  parameters_.addParameterListener(getDirectParameterId(AutomationTargetKind::masterOutputGain), this);
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    parameters_.addParameterListener(getMacroParameterId(slotIndex), this);
  }
}

PadPilotAudioProcessor::~PadPilotAudioProcessor() {
  endAllAutomationTouches();
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    parameters_.removeParameterListener(getMacroParameterId(slotIndex), this);
  }
  parameters_.removeParameterListener(getDirectParameterId(AutomationTargetKind::masterInputGain), this);
  parameters_.removeParameterListener(getDirectParameterId(AutomationTargetKind::masterWetDry), this);
  parameters_.removeParameterListener(getDirectParameterId(AutomationTargetKind::masterOutputGain), this);
  releaseResources();
}

const juce::String PadPilotAudioProcessor::getName() const {
  return JucePlugin_Name;
}

bool PadPilotAudioProcessor::acceptsMidi() const {
  return false;
}

bool PadPilotAudioProcessor::producesMidi() const {
  return true;
}

bool PadPilotAudioProcessor::isMidiEffect() const {
  return false;
}

double PadPilotAudioProcessor::getTailLengthSeconds() const {
  return padpilot::kMaximumFxTailLengthSeconds;
}

int PadPilotAudioProcessor::getNumPrograms() {
  return 1;
}

int PadPilotAudioProcessor::getCurrentProgram() {
  return 0;
}

void PadPilotAudioProcessor::setCurrentProgram(int) {}

const juce::String PadPilotAudioProcessor::getProgramName(int index) {
  return index == 0 ? "Default" : juce::String{};
}

void PadPilotAudioProcessor::changeProgramName(int, const juce::String&) {}

void PadPilotAudioProcessor::prepareToPlay(double, int) {
  endAllAutomationTouches();
  std::lock_guard<std::mutex> lifecycleGuard(runtimeLifecycleMutex_);
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  if (runtimeStarted_.exchange(false, std::memory_order_acq_rel)) {
    inputThread_.stop();
    scriptHost_.stop();
    if (perfDiagnosticsEnabled_) {
      stopPerfDiagnostics();
    }
  }

  {
    std::lock_guard<std::mutex> writerGuard(graphMutationMutex_);
    GraphMutationGuard mutationGuard(*this, graphMutationRequested_, graphReaders_, false);
    inputEventQueue_.drain();
    scriptAudioCommandQueue_.drain();
    uiAudioCommandQueue_.drain();
    hapticCommandQueue_.drain();
    midiOutputRuntime_.reset();
    convolverGraph_.prepare(getSampleRate(), getBlockSize(), getTotalNumOutputChannels());
    convolverGraph_.requestStructuralBypass(
        !fxGraphProcessingActive_.load(std::memory_order_acquire));
    analyzerRuntime_.prepare(getSampleRate(), getBlockSize());
    recutRuntime_.prepare(getSampleRate(), getBlockSize(), hapticCommandQueue_);
    analyzerRuntime_.setMonitoringEnabled(false);
    convolverGraph_.setProfilingEnabled(perfDiagnosticsEnabled_);
    refreshTelemetryMode();
    padpilot::advanceGraphEpoch(graphCommandEpoch_);
  }
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    inputThread_.setControllerConfig(controllerConfig_);
  }

  runtimeStarted_.store(true, std::memory_order_release);
  scriptHost_.start();
  inputThread_.start();
  if (perfDiagnosticsEnabled_) {
    startPerfDiagnostics();
  }

  std::string moduleIdToApply;
  std::string payloadToApply;
  padpilot::ScriptModuleLoadRequest scriptModuleRequest;
  bool applyAsRestore = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);

    if (!hasRestoredState_) {
      modules_ = boundInstalledModules(moduleStore_.loadAllModules());
      if (!modules_.empty()) {
        setSelectedModuleLocked(modules_.front().id);
        presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
      }
    }

    if (selectedModuleId_.empty() && !modules_.empty()) {
      setSelectedModuleLocked(modules_.front().id);
    }

    if (presets_.empty() && !selectedModuleId_.empty()) {
      presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
    }

    analyzerStreamModuleId_.clear();
    analyzerStreamActive_.store(false, std::memory_order_release);
    analyzerCaptureActive_.store(false, std::memory_order_release);
    capabilityStreamKind_.clear();
    capabilityStreamHandle_.clear();
    capabilityStreamActive_.store(false, std::memory_order_release);

    moduleIdToApply = selectedModuleId_;
    scriptModuleRequest = getScriptModuleLoadRequestLocked(selectedModuleId_);
    if (pendingPresetPayloadJson_.has_value()) {
      payloadToApply = *pendingPresetPayloadJson_;
      pendingPresetPayloadJson_.reset();
      applyAsRestore = true;
    } else if (!moduleIdToApply.empty()) {
      payloadToApply = getModuleStatePayloadLocked(moduleIdToApply);
      if (payloadToApply.empty()) {
        payloadToApply = getSelectedPresetPayloadLocked();
      }
    }
  }

  const auto scriptLoaded = scriptHost_.loadModule(scriptModuleRequest);
  const auto stateReady = scriptLoaded &&
                          migrateModuleStateAfterScriptLoad(moduleIdToApply, &payloadToApply);

  if (stateReady && !payloadToApply.empty()) {
    if (applyAsRestore) {
      applyRestoredStateWhileStateTransitionLocked(moduleIdToApply, payloadToApply);
    } else {
      applyPresetPayloadWhileStateTransitionLocked(moduleIdToApply, payloadToApply);
    }
  }
}

void PadPilotAudioProcessor::releaseResources() {
  endAllAutomationTouches();
  std::lock_guard<std::mutex> lifecycleGuard(runtimeLifecycleMutex_);
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  bool expected = true;
  if (runtimeStarted_.compare_exchange_strong(expected, false)) {
    stopPerfDiagnostics();
    inputThread_.stop();
    scriptHost_.stop();
    std::lock_guard<std::mutex> writerGuard(graphMutationMutex_);
    GraphMutationGuard mutationGuard(*this, graphMutationRequested_, graphReaders_, false);
    analyzerRuntime_.release();
    recutRuntime_.release();
    inputEventQueue_.drain();
    scriptAudioCommandQueue_.drain();
    uiAudioCommandQueue_.drain();
    hapticCommandQueue_.drain();
    midiOutputRuntime_.reset();
  }
}

bool PadPilotAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
  return layouts.getMainInputChannelSet() == juce::AudioChannelSet::stereo() &&
         layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void PadPilotAudioProcessor::processBlock(juce::AudioBuffer<float>& audioBuffer, juce::MidiBuffer& midiMessages) {
  juce::ScopedNoDenormals noDenormals;

  const auto totalNumInputChannels = getTotalNumInputChannels();
  const auto totalNumOutputChannels = getTotalNumOutputChannels();
  for (auto channel = totalNumInputChannels; channel < totalNumOutputChannels; ++channel) {
    audioBuffer.clear(channel, 0, audioBuffer.getNumSamples());
  }

  midiOutputRuntime_.processBlock(midiMessages, audioBuffer.getNumSamples());

  AudioGraphReadGuard graphReadGuard(graphMutationRequested_, graphReaders_);
  if (!graphReadGuard) {
    return;
  }

  constexpr int kMaxCommandsPerBlock = 128;
  padpilot::AudioCommand command {};
  for (int i = 0; i < kMaxCommandsPerBlock; ++i) {
    if (!scriptAudioCommandQueue_.pop(command)) {
      break;
    }
    if (command.graphEpoch != graphCommandEpoch_.load(std::memory_order_acquire) ||
        !applyCommandToGraph(command)) {
      audioCommandsRejected_.fetch_add(1, std::memory_order_relaxed);
    }
  }
  for (int i = 0; i < kMaxCommandsPerBlock; ++i) {
    if (!uiAudioCommandQueue_.pop(command)) {
      break;
    }
    if (command.graphEpoch != graphCommandEpoch_.load(std::memory_order_acquire)) {
      audioCommandsRejected_.fetch_add(1, std::memory_order_relaxed);
      fxRuntimeResyncRequested_.store(true, std::memory_order_release);
    } else if (!applyCommandToGraph(command)) {
      audioCommandsRejected_.fetch_add(1, std::memory_order_relaxed);
    }
  }

  const auto activeRuntimeModule = activeRuntimeModule_.load(std::memory_order_acquire);
  const auto activeRuntimeModuleKey = activeRuntimeModuleKey_.load(std::memory_order_acquire);
  const auto recutPlaybackActive = recutPlaybackActive_.load(std::memory_order_acquire);
  const auto recutPlaybackOwnerModule = recutPlaybackOwnerModule_.load(std::memory_order_acquire);
  const auto recutPlaybackOwnerKey = recutPlaybackOwnerKey_.load(std::memory_order_acquire);

  double hostBpm = 120.0;
  if (const auto* hostPlayHead = getPlayHead(); hostPlayHead != nullptr) {
    if (const auto position = hostPlayHead->getPosition(); position.hasValue()) {
      if (const auto bpm = position->getBpm(); bpm.hasValue()) {
        if (std::isfinite(*bpm) && *bpm > 0.0) {
          hostBpm = std::clamp(*bpm, 20.0, 400.0);
        }
      }
    }
  }
  lastKnownProjectBpm_.store(static_cast<float>(hostBpm), std::memory_order_release);
  recutRuntime_.setProjectBpm(static_cast<float>(hostBpm));

  if (recutPlaybackActive && activeRuntimeModule == recutPlaybackOwnerModule &&
      activeRuntimeModuleKey != 0 && activeRuntimeModuleKey == recutPlaybackOwnerKey) {
    recutRuntime_.processBlock(audioBuffer);
  }

  const auto analyzerActive = analyzerStreamActive_.load(std::memory_order_acquire) ||
                              analyzerCaptureActive_.load(std::memory_order_acquire);
  if (analyzerActive) {
    analyzerRuntime_.pushAudioBlock(audioBuffer, hostBpm);
  }

  const auto fxGraphProcessingActive = fxGraphProcessingActive_.load(std::memory_order_acquire);
  if (!fxGraphProcessingActive && convolverGraph_.isStructuralBypassComplete()) {
    return;
  }

  if (convolverGraph_.isWetPathBypassed()) {
    bool hasSignal = false;
    for (int channel = 0; channel < totalNumInputChannels; ++channel) {
      if (audioBuffer.getMagnitude(channel, 0, audioBuffer.getNumSamples()) > 0.0f) {
        hasSignal = true;
        break;
      }
    }
    if (!hasSignal) {
      return;
    }
  }
  convolverGraph_.processBlock(audioBuffer, hostBpm);
}

bool PadPilotAudioProcessor::hasEditor() const {
  return true;
}

juce::AudioProcessorEditor* PadPilotAudioProcessor::createEditor() {
  return new PadPilotEditor(*this);
}

void PadPilotAudioProcessor::getStateInformation(juce::MemoryBlock& destinationData) {
  reconcileFxStateFromParametersIfDirty();
  destinationData.reset();
  const auto protobufState = serializePluginStateToProtobuf();
  destinationData.append(protobufState.data(), protobufState.size());
}

void PadPilotAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
  if (data == nullptr || sizeInBytes <= 0 ||
      static_cast<std::size_t>(sizeInBytes) > kMaxPluginStateBytes) {
    return;
  }

  endAllAutomationTouches();
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  auto restored = restorePluginStateFromProtobuf(data, sizeInBytes);
  if (!restored && looksLikeJsonObject(data, static_cast<std::size_t>(sizeInBytes))) {
    const std::string jsonState(static_cast<const char*>(data), static_cast<size_t>(sizeInBytes));
    restored = restorePluginStateFromJson(jsonState);
  }
  if (!restored) {
    return;
  }

  analyzerRuntime_.setRecordMode(padpilot::AnalyzerRecordMode::stop);
  analyzerRuntime_.setMonitoringEnabled(false);

  std::string moduleIdToApply;
  std::string payloadToApply;
  padpilot::ScriptModuleLoadRequest scriptModuleRequest;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    moduleIdToApply = selectedModuleId_;
    scriptModuleRequest = getScriptModuleLoadRequestLocked(moduleIdToApply);
    payloadToApply = getModuleStatePayloadLocked(moduleIdToApply);
    if (payloadToApply.empty()) {
      payloadToApply = getSelectedPresetPayloadLocked();
    }
    if (!payloadToApply.empty()) {
      pendingPresetPayloadJson_ = payloadToApply;
    }
  }

  if (runtimeStarted_.load(std::memory_order_acquire)) {
    const auto scriptLoaded = scriptHost_.loadModule(scriptModuleRequest);
    const auto stateReady = scriptLoaded &&
                            migrateModuleStateAfterScriptLoad(moduleIdToApply, &payloadToApply);
    if (stateReady && !payloadToApply.empty()) {
      applyRestoredStateWhileStateTransitionLocked(moduleIdToApply, payloadToApply);
    }
  }

}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
  return new PadPilotAudioProcessor();
}

bool PadPilotAudioProcessor::applyCommandToGraph(const padpilot::AudioCommand& command) {
  return convolverGraph_.applyCommand(command);
}

void PadPilotAudioProcessor::startPerfDiagnostics() {
  if (!perfDiagnosticsEnabled_) {
    return;
  }

  bool expected = false;
  if (!perfDiagnosticsRunning_.compare_exchange_strong(expected, true)) {
    return;
  }

  perfDiagnosticsThread_ = std::thread([this]() {
    while (perfDiagnosticsRunning_.load(std::memory_order_acquire)) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1000));
      if (!perfDiagnosticsRunning_.load(std::memory_order_acquire)) {
        break;
      }
      writePerfSnapshotToTempLog();
    }
  });
}

void PadPilotAudioProcessor::stopPerfDiagnostics() {
  if (!perfDiagnosticsEnabled_) {
    return;
  }

  bool expected = true;
  if (!perfDiagnosticsRunning_.compare_exchange_strong(expected, false)) {
    return;
  }

  if (perfDiagnosticsThread_.joinable()) {
    perfDiagnosticsThread_.join();
  }
}

void PadPilotAudioProcessor::writePerfSnapshotToTempLog() const {
  if (!perfDiagnosticsEnabled_) {
    return;
  }

  const auto runtime = getRuntimeDiagnostics();
  const auto timing = convolverGraph_.getTimingSnapshot();
  const double blocks = static_cast<double>(timing.blocks == 0 ? 1 : timing.blocks);
  const double avgBlockUs = static_cast<double>(timing.totalNs) / blocks / 1000.0;
  const double avgConvolverUs = static_cast<double>(timing.convolverNs) / blocks / 1000.0;
  const double avgDelayUs = static_cast<double>(timing.delayNs) / blocks / 1000.0;
  const double avgReverbUs = static_cast<double>(timing.reverbNs) / blocks / 1000.0;
  const double avgReverbPreDelayUs = static_cast<double>(timing.reverbPreDelayNs) / blocks / 1000.0;
  const double avgReverbCoreUs = static_cast<double>(timing.reverbCoreNs) / blocks / 1000.0;
  const double avgReverbMixUs = static_cast<double>(timing.reverbMixNs) / blocks / 1000.0;
  const double avgModulationUs = static_cast<double>(timing.modulationNs) / blocks / 1000.0;
  const double avgEqUs = static_cast<double>(timing.eqNs) / blocks / 1000.0;
  const double avgGainUs = static_cast<double>(timing.gainNs) / blocks / 1000.0;

  std::ostringstream out;
  out << "PadPilot CPU snapshot\n";
  out << "profiling_enabled=" << (runtime.profilingEnabled ? 1 : 0) << "\n";
  out << "blocks=" << timing.blocks << "\n";
  out << std::fixed << std::setprecision(3);
  out << "avg_block_us=" << avgBlockUs << "\n";
  out << "avg_convolver_us=" << avgConvolverUs << "\n";
  out << "avg_delay_us=" << avgDelayUs << "\n";
  out << "avg_reverb_us=" << avgReverbUs << "\n";
  out << "avg_reverb_predelay_us=" << avgReverbPreDelayUs << "\n";
  out << "avg_reverb_core_us=" << avgReverbCoreUs << "\n";
  out << "avg_reverb_mix_us=" << avgReverbMixUs << "\n";
  out << "avg_modulation_us=" << avgModulationUs << "\n";
  out << "avg_eq_us=" << avgEqUs << "\n";
  out << "avg_gain_us=" << avgGainUs << "\n";
  out << "convolver_peak_db=" << timing.convolverPeakDb << "\n";
  out << "delay_peak_db=" << timing.delayPeakDb << "\n";
  out << "reverb_peak_db=" << timing.reverbPeakDb << "\n";
  out << "modulation_peak_db=" << timing.modulationPeakDb << "\n";
  out << "eq_peak_db=" << timing.eqPeakDb << "\n";
  out << "output_peak_db=" << timing.outputPeakDb << "\n";
  out << "convolver_bypassed_blocks=" << timing.convolverBypassedBlocks << "\n";
  out << "delay_bypassed_blocks=" << timing.delayBypassedBlocks << "\n";
  out << "reverb_bypassed_blocks=" << timing.reverbBypassedBlocks << "\n";
  for (const auto& chain : runtime.chains) {
    if (!chain.active) {
      continue;
    }
    out << "chain_" << chain.chainId << "_active_nodes=" << chain.activeNodeCount << "\n";
    out << "chain_" << chain.chainId << "_avg_us=" << chain.avgChainUs << "\n";
    out << "chain_" << chain.chainId << "_input_peak_db=" << chain.inputPeakDb << "\n";
    out << "chain_" << chain.chainId << "_output_peak_db=" << chain.outputPeakDb << "\n";
  }
  out << "runtime_input_wakeups=" << runtime.inputWakeups << "\n";
  out << "runtime_input_events_pushed=" << runtime.inputEventsPushed << "\n";
  out << "runtime_input_events_dropped=" << runtime.inputEventsDropped << "\n";
  out << "runtime_input_commands_pushed=" << runtime.inputCommandsPushed << "\n";
  out << "runtime_input_commands_dropped=" << runtime.inputCommandsDropped << "\n";
  out << "runtime_script_wakeups=" << runtime.scriptWakeups << "\n";
  out << "runtime_script_events_processed=" << runtime.scriptEventsProcessed << "\n";
  out << "runtime_script_commands_pushed=" << runtime.scriptCommandsPushed << "\n";
  out << "runtime_script_commands_dropped=" << runtime.scriptCommandsDropped << "\n";
  out << "runtime_ui_audio_commands_pushed=" << runtime.uiAudioCommandsPushed << "\n";
  out << "runtime_ui_audio_commands_dropped=" << runtime.uiAudioCommandsDropped << "\n";
  out << "runtime_audio_commands_rejected=" << runtime.audioCommandsRejected << "\n";
  out << "runtime_analyzer_audio_slices_pushed=" << runtime.analyzerAudioSlicesPushed << "\n";
  out << "runtime_analyzer_audio_slices_dropped=" << runtime.analyzerAudioSlicesDropped << "\n";

  const auto logPath =
      juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("padpilot_cpu_profile.log");
  const auto contents = out.str();
  if (!logPath.replaceWithText(
          juce::String::fromUTF8(contents.data(), static_cast<int>(contents.size())))) {
    padpilot::appendBackendLog("processor", "Could not write CPU profile path=" +
                                               logPath.getFullPathName().toStdString());
  }
}

padpilot::ControllerState PadPilotAudioProcessor::getControllerState() const {
  return inputThread_.getControllerState();
}

padpilot::RuntimeDiagnostics PadPilotAudioProcessor::getRuntimeDiagnostics() const {
  padpilot::RuntimeDiagnostics diagnostics {};
  const auto timing = convolverGraph_.getTimingSnapshot();
  const double blocks = static_cast<double>(timing.blocks == 0 ? 1 : timing.blocks);
  diagnostics.inputWakeups = inputThread_.getWakeupCount();
  diagnostics.inputEventsPushed = inputThread_.getInputEventsPushed();
  diagnostics.inputEventsDropped = inputThread_.getInputEventsDropped();
  diagnostics.inputCommandsPushed = inputThread_.getInputCommandsPushed();
  diagnostics.inputCommandsDropped = inputThread_.getInputCommandsDropped();
  diagnostics.scriptWakeups = scriptHost_.getWakeupCount();
  diagnostics.scriptEventsProcessed = scriptHost_.getProcessedInputEvents();
  diagnostics.scriptCommandsPushed = scriptHost_.getCommandsPushed();
  diagnostics.scriptCommandsDropped = scriptHost_.getCommandsDropped();
  diagnostics.uiAudioCommandsPushed = uiAudioCommandsPushed_.load(std::memory_order_relaxed);
  diagnostics.uiAudioCommandsDropped = uiAudioCommandsDropped_.load(std::memory_order_relaxed);
  diagnostics.audioCommandsRejected = audioCommandsRejected_.load(std::memory_order_relaxed);
  diagnostics.analyzerAudioSlicesPushed = analyzerRuntime_.getAudioSlicesPushed();
  diagnostics.analyzerAudioSlicesDropped = analyzerRuntime_.getAudioSlicesDropped();
  diagnostics.profilingEnabled = perfDiagnosticsEnabled_;
  diagnostics.profiledBlocks = timing.blocks;
  diagnostics.avgBlockUs = static_cast<float>(static_cast<double>(timing.totalNs) / blocks / 1000.0);
  diagnostics.avgConvolverUs = static_cast<float>(static_cast<double>(timing.convolverNs) / blocks / 1000.0);
  diagnostics.avgDelayUs = static_cast<float>(static_cast<double>(timing.delayNs) / blocks / 1000.0);
  diagnostics.avgReverbUs = static_cast<float>(static_cast<double>(timing.reverbNs) / blocks / 1000.0);
  diagnostics.avgReverbPreDelayUs = static_cast<float>(static_cast<double>(timing.reverbPreDelayNs) / blocks / 1000.0);
  diagnostics.avgReverbCoreUs = static_cast<float>(static_cast<double>(timing.reverbCoreNs) / blocks / 1000.0);
  diagnostics.avgReverbMixUs = static_cast<float>(static_cast<double>(timing.reverbMixNs) / blocks / 1000.0);
  diagnostics.avgModulationUs = static_cast<float>(static_cast<double>(timing.modulationNs) / blocks / 1000.0);
  diagnostics.avgEqUs = static_cast<float>(static_cast<double>(timing.eqNs) / blocks / 1000.0);
  diagnostics.convolverPeakDb = timing.convolverPeakDb;
  diagnostics.delayPeakDb = timing.delayPeakDb;
  diagnostics.reverbPeakDb = timing.reverbPeakDb;
  diagnostics.modulationPeakDb = timing.modulationPeakDb;
  diagnostics.eqPeakDb = timing.eqPeakDb;
  diagnostics.outputPeakDb = timing.outputPeakDb;
  for (std::size_t index = 0; index < diagnostics.chains.size(); ++index) {
    const auto& source = timing.chains[index];
    auto& destination = diagnostics.chains[index];
    destination.chainId = source.chainId;
    destination.active = source.active;
    destination.muted = source.muted;
    destination.solo = source.solo;
    destination.activeNodeCount = source.activeNodeCount;
    destination.avgChainUs = static_cast<float>(static_cast<double>(source.totalNs) / blocks / 1000.0);
    destination.inputPeakDb = source.inputPeakDb;
    destination.outputPeakDb = source.outputPeakDb;
  }
  return diagnostics;
}

void PadPilotAudioProcessor::syncControllerConfigWithInputDevicesLocked(const padpilot::InputDeviceStates& inputDevices) {
  std::vector<std::string> connectedHardwareIds;
  connectedHardwareIds.reserve(inputDevices.size());
  for (const auto& inputDevice : inputDevices) {
    if (!inputDevice.connected || inputDevice.kind != padpilot::InputDeviceKind::gamepad) {
      continue;
    }
    const auto hardwareId = std::string(padpilot::cStringView(inputDevice.hardwareId));
    if (!hardwareId.empty()) {
      connectedHardwareIds.push_back(hardwareId);
    }
  }

  const auto changed = padpilot::syncControllerConfigRows(&controllerConfig_, connectedHardwareIds);
  if (changed) {
    padpilot::appendBackendLog("processor", "controller config auto-synced rows=" + std::to_string(controllerConfig_.rows.size()));
  }
  const auto unsynchronized = std::count_if(
      connectedHardwareIds.begin(), connectedHardwareIds.end(), [this](const auto& hardwareId) {
        return padpilot::findControllerConfigRow(controllerConfig_, hardwareId) == nullptr;
      });
  if (unsynchronized > 0) {
    padpilot::appendBackendLog(
        "processor",
        "controller config row limit reached ignoredDevices=" + std::to_string(unsynchronized));
  }
}
