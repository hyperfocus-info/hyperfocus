#include "core/pad-pilot-processor.h"

#include "core/pad-pilot-processor-internal.h"

using namespace padpilot::processor_detail;

std::vector<padpilot::ModuleRecord> PadPilotAudioProcessor::getModules() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  std::vector<padpilot::ModuleRecord> modules;
  modules.reserve(modules_.size());
  for (const auto& module : modules_) {
    if (isLegacyRemovedBuiltInModuleId(module.id)) {
      continue;
    }
    modules.push_back(module);
  }
  return modules;
}

bool PadPilotAudioProcessor::createAndSaveModule(const std::string& name) {
  const auto module = moduleStore_.createDefaultModule(name);
  if (module.id.empty() || module.installRootPath.empty()) {
    return false;
  }
  if (!moduleStore_.saveModule(module)) {
    const juce::File installRoot(module.installRootPath);
    const juce::File modulesRoot(moduleStore_.getModulesRootPath());
    if (installRoot.isAChildOf(modulesRoot)) {
      const auto removed = padpilot::storage::deleteSafePath(installRoot, modulesRoot);
      padpilot::appendBackendLog(
          "processor",
          "createAndSaveModule registry write failed; starter cleanup=" +
              std::string(removed ? "true" : "false") + " path=" + module.installRootPath);
    }
    return false;
  }

  endAllAutomationTouches();
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  padpilot::ScriptModuleLoadRequest nextScriptModule;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto previousModuleId = selectedModuleId_;
    modules_ = boundInstalledModules(moduleStore_.loadAllModules());
    setSelectedModuleLocked(module.id);
    handleAnalyzerModuleSwitchLocked(previousModuleId, selectedModuleId_);
    presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
    nextScriptModule = getScriptModuleLoadRequestLocked(selectedModuleId_);
  }
  scriptHost_.loadModule(nextScriptModule);
  return true;
}

std::optional<padpilot::ModuleRecord> PadPilotAudioProcessor::installModuleBundle(const std::string& bundlePath,
                                                                                  std::string& errorMessage) {
  auto installedModule = moduleStore_.installBundle(bundlePath, errorMessage);
  if (!installedModule.has_value()) {
    return std::nullopt;
  }
  endAllAutomationTouches();

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  padpilot::ScriptModuleLoadRequest nextScriptModule;
  bool selectedModuleUpdated = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto previousModuleId = selectedModuleId_;
    modules_ = boundInstalledModules(moduleStore_.loadAllModules());

    const auto installedCanonicalId = canonicalizeModuleId(installedModule->id);
    if (selectedModuleId_.empty()) {
      setSelectedModuleLocked(installedCanonicalId);
      presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
      nextScriptModule = getScriptModuleLoadRequestLocked(selectedModuleId_);
      selectedModuleUpdated = true;
    } else if (installedCanonicalId == selectedModuleId_) {
      handleAnalyzerModuleSwitchLocked(previousModuleId, selectedModuleId_);
      presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
      scriptHost_.revokeModuleAuthorization();
      nextScriptModule = getScriptModuleLoadRequestLocked(selectedModuleId_);
      selectedModuleUpdated = true;
    }
  }

  if (selectedModuleUpdated) {
    scriptHost_.loadModule(nextScriptModule);
  }

  return installedModule;
}

bool PadPilotAudioProcessor::selectModule(const std::string& moduleId) {
  endAllAutomationTouches();
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  padpilot::ScriptModuleLoadRequest nextScriptModule;
  std::string moduleStatePayload;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto canonicalModuleId = canonicalizeModuleId(moduleId);
    if (canonicalModuleId.empty() || findModuleRecordLocked(canonicalModuleId) == nullptr) {
      return false;
    }
    const auto previousModuleId = selectedModuleId_;
    setSelectedModuleLocked(canonicalModuleId);
    handleAnalyzerModuleSwitchLocked(previousModuleId, selectedModuleId_);
    presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
    selectedPresetId_.clear();
    if (selectedModuleId_ == kFxModuleId && !moduleStatePayloadById_.contains(kFxModuleId)) {
      moduleStatePayloadById_[kFxModuleId] = padpilot::proto::bytesToBase64(
          padpilot::proto::serializeFxChainState(padpilot::proto::createDefaultFxChainState()));
      acceptedRevisionByModuleId_[kFxModuleId] = 1;
    }
    nextScriptModule = getScriptModuleLoadRequestLocked(selectedModuleId_);
    moduleStatePayload = getModuleStatePayloadLocked(selectedModuleId_);
  }
  const auto scriptLoaded = scriptHost_.loadModule(nextScriptModule);
  const auto stateReady = scriptLoaded &&
                          migrateModuleStateAfterScriptLoad(moduleId, &moduleStatePayload);
  if (stateReady && !moduleStatePayload.empty()) {
    applyPresetPayloadWhileStateTransitionLocked(moduleId, moduleStatePayload);
  }
  return true;
}

std::vector<padpilot::PresetRecord> PadPilotAudioProcessor::getPresetsForSelectedModule() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return presets_;
}

bool PadPilotAudioProcessor::createAndSavePreset(const std::string& name, const std::string& payloadJson) {
  if (name.size() > kMaxDisplayNameBytes || payloadJson.empty() || payloadJson.size() > kMaxModuleStateBytes) {
    return false;
  }
  const auto parsedPayload = juce::JSON::parse(
      juce::String::fromUTF8(payloadJson.data(), static_cast<int>(payloadJson.size())));
  if (parsedPayload.isVoid()) {
    return false;
  }
  std::lock_guard<std::mutex> guard(stateMutex_);
  if (!hasReadyModule(modules_, selectedModuleId_, selectedModuleId_) ||
      selectedModuleId_ == kFxModuleId || selectedModuleId_ == kRecutModuleId ||
      selectedModuleId_ == kAnalyzerModuleId) {
    return false;
  }

  auto preset = presetStore_.createDefaultPreset(selectedModuleId_, name);
  preset.payloadJson = payloadJson;
  if (!presetStore_.savePreset(preset)) {
    return false;
  }

  presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(selectedModuleId_));
  selectedPresetId_ = preset.id;
  return true;
}

bool PadPilotAudioProcessor::createAndSavePresetProto(const padpilot::bridge::PresetSaveRequest& request) {
  if (request.name().size() > kMaxDisplayNameBytes || request.preset().name().size() > kMaxDisplayNameBytes ||
      request.preset().module_id().size() > padpilot::kMaximumModuleIdBytes) {
    return false;
  }
  const auto& requestedName = request.name().empty() ? request.preset().name() : request.name();
  if (requestedName.empty() ||
      request.preset().state().empty() || request.preset().state().size() > kMaxModuleStateBytes ||
      (!request.preset().id().empty() && !padpilot::isValidPresetId(request.preset().id()))) {
    return false;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto moduleId = canonicalizeModuleId(
      request.preset().module_id().empty() ? selectedModuleId_ : request.preset().module_id());
  if (!padpilot::isValidModuleId(moduleId) || !hasReadyModule(modules_, selectedModuleId_, moduleId)) {
    return false;
  }
  if (moduleId == kFxModuleId) {
    padpilot::fx::FxChainState state;
    if (!padpilot::proto::parseFxChainState(request.preset().state(), &state) ||
        !isValidFxState(state) || !isValidManagedFxState(state)) {
      return false;
    }
  } else if (moduleId == kRecutModuleId) {
    padpilot::recut::RecutModuleState state;
    if (!padpilot::proto::parseRecutModuleState(request.preset().state(), &state) ||
        !isValidRecutState(state)) {
      return false;
    }
  } else if (moduleId == kAnalyzerModuleId) {
    padpilot::analyzer::AnalyzerModuleState state;
    if (!padpilot::proto::parseAnalyzerModuleState(request.preset().state(), &state) ||
        !isValidAnalyzerState(state)) {
      return false;
    }
  }

  auto preset = presetStore_.createDefaultPreset(moduleId, request.name());
  if (!request.preset().id().empty()) {
    preset.id = request.preset().id();
  }
  preset.moduleId = moduleId;
  preset.name = requestedName;
  preset.payloadJson = padpilot::proto::bytesToBase64(request.preset().state());
  if (!presetStore_.savePreset(preset)) {
    return false;
  }

  presets_ = boundPersistedPresets(presetStore_.loadPresetsForModule(moduleId));
  selectedPresetId_ = preset.id;
  return true;
}

bool PadPilotAudioProcessor::selectPreset(const std::string& presetId) {
  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  std::string moduleId;
  std::string payload;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    for (const auto& preset : presets_) {
      if (preset.id == presetId) {
        moduleId = canonicalizeModuleId(preset.moduleId);
        if (moduleId != selectedModuleId_) {
          return false;
        }
        payload = preset.payloadJson;
        moduleStatePayloadById_[moduleId] = payload;
        break;
      }
    }
    if (payload.empty()) {
      return false;
    }
    selectedPresetId_ = presetId;
  }

  applyPresetPayloadWhileStateTransitionLocked(moduleId, payload);
  return true;
}

bool PadPilotAudioProcessor::queueAudioCommand(const padpilot::AudioCommand& command) {
  if (!std::isfinite(command.value) || !std::isfinite(command.valueB)) {
    audioCommandsRejected_.fetch_add(1, std::memory_order_relaxed);
    return false;
  }
  auto stampedCommand = command;
  stampedCommand.graphEpoch = graphCommandEpoch_.load(std::memory_order_acquire);
  if (uiAudioCommandQueue_.push(stampedCommand)) {
    uiAudioCommandsPushed_.fetch_add(1, std::memory_order_relaxed);
    return true;
  }
  uiAudioCommandsDropped_.fetch_add(1, std::memory_order_relaxed);
  fxRuntimeResyncRequested_.store(true, std::memory_order_release);
  return false;
}

void PadPilotAudioProcessor::openAnalyzerStream(const std::string& moduleId) {
  const auto canonicalModuleId = canonicalizeModuleId(moduleId);
  bool opened = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (canonicalModuleId.empty() || canonicalModuleId != selectedModuleId_) {
      return;
    }
    if (analyzerStreamActive_.load(std::memory_order_acquire) &&
        canonicalizeModuleId(analyzerStreamModuleId_) == canonicalModuleId) {
      return;
    }
    analyzerStreamModuleId_ = canonicalModuleId;
    analyzerStreamActive_.store(true, std::memory_order_release);
    opened = true;
  }

  if (opened) {
    analyzerRuntime_.setMonitoringEnabled(true);
  }
}

void PadPilotAudioProcessor::closeAnalyzerStream(const std::string& moduleId) {
  const auto canonicalModuleId = canonicalizeModuleId(moduleId);
  bool shouldDisableMonitoring = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (!analyzerStreamActive_.load(std::memory_order_acquire)) {
      return;
    }
    if (!canonicalModuleId.empty() &&
        canonicalizeModuleId(analyzerStreamModuleId_) != canonicalModuleId) {
      return;
    }
    analyzerStreamModuleId_.clear();
    analyzerStreamActive_.store(false, std::memory_order_release);
    shouldDisableMonitoring = !analyzerCaptureActive_.load(std::memory_order_acquire);
  }

  if (shouldDisableMonitoring) {
    analyzerRuntime_.setMonitoringEnabled(false);
  }
}

void PadPilotAudioProcessor::startAnalyzerCapture(bool append) {
  analyzerCaptureActive_.store(true, std::memory_order_release);
  analyzerRuntime_.setMonitoringEnabled(true);
  analyzerRuntime_.setRecordMode(
      append ? padpilot::AnalyzerRecordMode::startAppend : padpilot::AnalyzerRecordMode::startOverwrite);
}

void PadPilotAudioProcessor::stopAnalyzerCapture() {
  analyzerCaptureActive_.store(false, std::memory_order_release);
  analyzerRuntime_.setRecordMode(padpilot::AnalyzerRecordMode::stop);
  if (!analyzerStreamActive_.load(std::memory_order_acquire)) {
    analyzerRuntime_.setMonitoringEnabled(false);
  }
}

void PadPilotAudioProcessor::setAnalyzerTuningHz(float tuningHz) {
  if (!std::isfinite(tuningHz)) {
    return;
  }
  analyzerRuntime_.setTuningHz(tuningHz);
}

void PadPilotAudioProcessor::setAnalyzerDetectionSensitivity(float detectionSensitivity) {
  if (!std::isfinite(detectionSensitivity)) {
    return;
  }
  analyzerRuntime_.setDetectionSensitivity(detectionSensitivity);
}

bool PadPilotAudioProcessor::correctAnalyzerNote(const std::uint64_t eventId,
                                                 const std::uint8_t midiNote) {
  return analyzerRuntime_.correctNote(eventId, midiNote);
}

bool PadPilotAudioProcessor::resetAnalyzerNoteCorrection(const std::uint64_t eventId) {
  return analyzerRuntime_.resetNoteCorrection(eventId);
}

bool PadPilotAudioProcessor::writeAnalyzerMidiFile(const std::string& path, juce::String& errorMessage) const {
  return analyzerRuntime_.writeMidiFile(juce::File(path), errorMessage);
}

void PadPilotAudioProcessor::requestHostTempo(float bpm) {
  if (!std::isfinite(bpm)) {
    return;
  }
  const auto clampedBpm = juce::jlimit(20.0f, 320.0f, bpm);
  lastKnownProjectBpm_.store(clampedBpm, std::memory_order_release);
  recutRuntime_.setProjectBpm(clampedBpm);
}

std::optional<padpilot::ManagedFileRecord> PadPilotAudioProcessor::importManagedSampleFile(const std::string& sourcePath,
                                                                                            std::uint64_t maxBytes,
                                                                                            std::string& errorMessage) {
  padpilot::appendBackendLog("processor", "importManagedSampleFile sourcePath=" + sourcePath);
  auto imported = managedFileStore_.importSampleFile(juce::File(sourcePath), maxBytes, errorMessage);
  if (!imported.has_value()) {
    padpilot::appendBackendLog("processor", "importManagedSampleFile failed sourcePath=" + sourcePath + " error=" + errorMessage);
    return std::nullopt;
  }
  padpilot::appendBackendLog("processor", "importManagedSampleFile success managedPath=" + imported->managedPath);
  return imported;
}

std::optional<padpilot::ManagedFileRecord> PadPilotAudioProcessor::importManagedSampleBytes(const void* data,
                                                                                             std::size_t size,
                                                                                             const std::string& sourceName,
                                                                                             const std::string& mimeType,
                                                                                             std::uint64_t maxBytes,
                                                                                             std::string& errorMessage) {
  padpilot::appendBackendLog(
      "processor",
      "importManagedSampleBytes sourceName=" + sourceName +
          " size=" + std::to_string(size) +
          " mimeType=" + mimeType);
  auto imported = managedFileStore_.importSampleBytes(data, size, sourceName, mimeType, maxBytes, errorMessage);
  if (!imported.has_value()) {
    padpilot::appendBackendLog("processor", "importManagedSampleBytes failed sourceName=" + sourceName + " error=" + errorMessage);
    return std::nullopt;
  }
  padpilot::appendBackendLog("processor", "importManagedSampleBytes success managedPath=" + imported->managedPath);
  return imported;
}

bool PadPilotAudioProcessor::canImportManagedMediaCategory(const std::string& category) const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto* module = findModuleRecordLocked(selectedModuleId_);
  if (module == nullptr || module->loadStatus != "ready") {
    return false;
  }
  if (category == "sample") {
    return std::find(module->capabilities.begin(), module->capabilities.end(), "sample-source") !=
           module->capabilities.end();
  }
  return category == "impulse-response" &&
         std::find(module->capabilities.begin(), module->capabilities.end(), "fx-graph") !=
             module->capabilities.end();
}

std::optional<padpilot::ManagedFileRecord> PadPilotAudioProcessor::importManagedImpulseResponseFile(
    const std::string& sourcePath,
    std::uint64_t maxBytes,
    std::string& errorMessage) {
  if (!canImportManagedMediaCategory("impulse-response")) {
    errorMessage = "The selected ready Module does not provide fx-graph.";
    return std::nullopt;
  }
  return managedFileStore_.importImpulseResponseFile(juce::File(sourcePath), maxBytes, errorMessage);
}

std::optional<padpilot::ManagedFileRecord> PadPilotAudioProcessor::importManagedImpulseResponseBytes(
    const void* data,
    std::size_t size,
    const std::string& sourceName,
    const std::string& mimeType,
    std::uint64_t maxBytes,
    std::string& errorMessage) {
  if (!canImportManagedMediaCategory("impulse-response")) {
    errorMessage = "The selected ready Module does not provide fx-graph.";
    return std::nullopt;
  }
  return managedFileStore_.importImpulseResponseBytes(
      data, size, sourceName, mimeType, maxBytes, errorMessage);
}

std::string PadPilotAudioProcessor::getSelectedModuleId() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return selectedModuleId_;
}

std::string PadPilotAudioProcessor::getSelectedPresetId() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return selectedPresetId_;
}

bool PadPilotAudioProcessor::setModuleStatePayload(const std::string& moduleId, const std::string& payloadJson) {
  const auto canonicalId = canonicalizeModuleId(moduleId);
  if (!padpilot::isValidModuleId(canonicalId) || canonicalId == kFxModuleId || canonicalId == kRecutModuleId ||
      canonicalId == kAnalyzerModuleId || payloadJson.empty() || payloadJson.size() > kMaxModuleStateBytes) {
    return false;
  }
  const auto parsedPayload = juce::JSON::parse(
      juce::String::fromUTF8(payloadJson.data(), static_cast<int>(payloadJson.size())));
  if (parsedPayload.isVoid()) {
    return false;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  std::lock_guard<std::mutex> guard(stateMutex_);
  if (!hasReadyModule(modules_, selectedModuleId_, canonicalId) ||
      (!moduleStatePayloadById_.contains(canonicalId) &&
       moduleStatePayloadById_.size() >= static_cast<std::size_t>(kMaxStoredModuleStates)) ||
      !canReplaceBoundedPayload(moduleStatePayloadById_, canonicalId, payloadJson.size(),
                                kMaxAggregateModuleStateBytes)) {
    return false;
  }
  moduleStatePayloadById_[canonicalId] = payloadJson;
  return true;
}

bool PadPilotAudioProcessor::setModuleStatePayloadBase64(const std::string& moduleId,
                                                         const std::string& payloadBase64,
                                                         std::uint64_t revision) {
  const auto canonicalId = canonicalizeModuleId(moduleId);
  if (!padpilot::isValidModuleId(canonicalId)) {
    return false;
  }
  if (payloadBase64.empty() || payloadBase64.size() > kMaxModuleStateBase64Chars) {
    return false;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (!hasReadyModule(modules_, selectedModuleId_, canonicalId) ||
        (!moduleStatePayloadById_.contains(canonicalId) &&
         moduleStatePayloadById_.size() >= static_cast<std::size_t>(kMaxStoredModuleStates)) ||
        !canReplaceBoundedPayload(moduleStatePayloadById_, canonicalId, payloadBase64.size(),
                                  kMaxAggregateModuleStateBytes)) {
      return false;
    }
  }

  std::string payloadBytes;
  if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes) ||
      payloadBytes.size() > kMaxModuleStateBytes) {
    return false;
  }

  std::optional<padpilot::fx::FxChainState> fxState;
  std::optional<padpilot::recut::RecutModuleState> recutState;
  std::optional<padpilot::analyzer::AnalyzerModuleState> analyzerState;
  if (canonicalId == kFxModuleId) {
    fxState.emplace();
    if (!padpilot::proto::parseFxChainState(payloadBytes, &*fxState) ||
        !isValidFxState(*fxState) || !isValidManagedFxState(*fxState) ||
        fxState->revision() != revision) {
      return false;
    }
  } else if (canonicalId == kRecutModuleId) {
    recutState.emplace();
    if (!padpilot::proto::parseRecutModuleState(payloadBytes, &*recutState) ||
        !isValidRecutState(*recutState) || recutState->revision() != revision) {
      return false;
    }
  } else if (canonicalId == kAnalyzerModuleId) {
    analyzerState.emplace();
    if (!padpilot::proto::parseAnalyzerModuleState(payloadBytes, &*analyzerState) ||
        !isValidAnalyzerState(*analyzerState) || analyzerState->revision() != revision) {
      return false;
    }
  }

  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (!hasReadyModule(modules_, selectedModuleId_, canonicalId)) {
      return false;
    }
    const auto accepted = acceptedRevisionByModuleId_.find(canonicalId);
    if (accepted != acceptedRevisionByModuleId_.end()) {
      if (revision < accepted->second) {
        return false;
      }
      if (revision == accepted->second) {
        const auto current = moduleStatePayloadById_.find(canonicalId);
        return current != moduleStatePayloadById_.end() && current->second == payloadBase64;
      }
    }
  }

  if (fxState.has_value()) {
    applyFxStateDiff(*fxState);
  } else if (recutState.has_value()) {
    if (!recutRuntime_.applyStateFromBytes(payloadBytes)) {
      return false;
    }
    setRecutPlaybackOwner(canonicalId);
  } else if (analyzerState.has_value()) {
    analyzerRuntime_.restoreState(*analyzerState);
  }

  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (!hasReadyModule(modules_, selectedModuleId_, canonicalId)) {
      return false;
    }
    if (!canReplaceBoundedPayload(moduleStatePayloadById_, canonicalId, payloadBase64.size(),
                                  kMaxAggregateModuleStateBytes)) {
      return false;
    }
    moduleStatePayloadById_[canonicalId] = payloadBase64;
    acceptedRevisionByModuleId_[canonicalId] = revision;
  }
  return true;
}

std::unordered_map<std::string, std::string> PadPilotAudioProcessor::getModuleStatePayloads() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return moduleStatePayloadById_;
}

bool PadPilotAudioProcessor::setEditorViewStatePayload(const std::string& scopeId, const std::string& payloadJson) {
  const auto canonicalScopeId = canonicalizeModuleId(scopeId);
  if (!padpilot::isValidModuleId(canonicalScopeId) || canonicalScopeId.size() > kMaxEditorScopeBytes ||
      payloadJson.empty() || payloadJson.size() > kMaxEditorViewStateBytes) {
    return false;
  }
  const auto parsedPayload = juce::JSON::parse(
      juce::String::fromUTF8(payloadJson.data(), static_cast<int>(payloadJson.size())));
  if (parsedPayload.isVoid()) {
    return false;
  }

  std::lock_guard<std::mutex> guard(stateMutex_);
  if ((!isGlobalEditorViewScope(canonicalScopeId) &&
       !hasReadyModule(modules_, selectedModuleId_, canonicalScopeId)) ||
      (!editorViewStatePayloadByScope_.contains(canonicalScopeId) &&
       editorViewStatePayloadByScope_.size() >= static_cast<std::size_t>(kMaxPersistedEditorViewStates)) ||
      !canReplaceBoundedPayload(editorViewStatePayloadByScope_, canonicalScopeId, payloadJson.size(),
                                kMaxAggregateEditorViewStateBytes)) {
    return false;
  }
  editorViewStatePayloadByScope_[canonicalScopeId] = payloadJson;
  return true;
}

std::unordered_map<std::string, std::string> PadPilotAudioProcessor::getEditorViewStatePayloads() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return editorViewStatePayloadByScope_;
}

bool PadPilotAudioProcessor::setControllerConfigPayloadBase64(const std::string& payloadBase64) {
  if (payloadBase64.empty() || payloadBase64.size() > kMaxControllerConfigBase64Chars) {
    return false;
  }
  std::string payloadBytes;
  padpilot::bridge::SetControllerConfigRequest request;
  if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes) ||
      payloadBytes.size() > kMaxControllerConfigBytes ||
      !padpilot::preflightSetControllerConfigRequestWire(payloadBytes) ||
      !request.ParseFromString(payloadBytes) ||
      !isValidControllerConfigProto(request.controller_config())) {
    return false;
  }

  const auto nextConfig = padpilot::controllerConfigFromProto(request.controller_config());
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    controllerConfig_ = nextConfig;
    inputThread_.setControllerConfig(controllerConfig_);
  }
  padpilot::appendBackendLog("processor", "controller config updated rows=" + std::to_string(nextConfig.rows.size()) +
                                              " custom-layouts=" + std::to_string(nextConfig.customLayouts.size()));
  return true;
}

padpilot::ControllerConfigState PadPilotAudioProcessor::getControllerConfig() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return controllerConfig_;
}
