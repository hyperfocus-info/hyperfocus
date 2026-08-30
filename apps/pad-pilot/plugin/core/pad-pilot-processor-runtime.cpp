#include "core/pad-pilot-processor.h"

#include "core/pad-pilot-processor-internal.h"

#include <algorithm>

using namespace padpilot::processor_detail;

std::string PadPilotAudioProcessor::canonicalizeModuleId(const std::string& moduleId) const {
  return std::string(padpilot::canonicalModuleId(moduleId));
}

void PadPilotAudioProcessor::setSelectedModuleLocked(const std::string& moduleId) {
  const auto nextModuleId = canonicalizeModuleId(moduleId);
  if (!selectedModuleId_.empty() && selectedModuleId_ != nextModuleId) {
    requestMidiOutputPanic();
  }
  scriptHost_.revokeModuleAuthorization();
  selectedModuleId_ = nextModuleId;
  syncSelectedRuntimeModule(selectedModuleId_);
  const auto fxGraphOwner = getSelectedFxGraphOwnerLocked();
  if (!fxGraphOwner.empty() && !moduleStatePayloadById_.contains(fxGraphOwner)) {
    moduleStatePayloadById_[fxGraphOwner] = padpilot::proto::bytesToBase64(
        padpilot::proto::serializeFxChainState(padpilot::proto::createDefaultFxChainState()));
    acceptedRevisionByModuleId_[fxGraphOwner] = 1;
  }
}

void PadPilotAudioProcessor::requestMidiOutputPanic() noexcept {
  midiOutputRuntime_.requestPanic();
}

void PadPilotAudioProcessor::syncSelectedRuntimeModule(const std::string& moduleId) {
  const auto canonicalModuleId = canonicalizeModuleId(moduleId);
  const auto* module = findModuleRecordLocked(canonicalModuleId);
  const auto fxGraphProcessingActive = module != nullptr && module->loadStatus == "ready" &&
      std::find(module->capabilities.begin(), module->capabilities.end(), "fx-graph") !=
          module->capabilities.end();
  const auto nextFxGraphOwner = fxGraphProcessingActive ? canonicalModuleId : std::string {};
  if (fxGraphOwnerModuleId_ != nextFxGraphOwner) {
    fxGraphOwnerModuleId_ = nextFxGraphOwner;
    lastAppliedFxState_.reset();
    fxRuntimeStateDirty_.store(false, std::memory_order_release);
    fxRuntimeResyncRequested_.store(false, std::memory_order_release);
  }
  fxGraphProcessingActive_.store(fxGraphProcessingActive, std::memory_order_release);
  convolverGraph_.requestStructuralBypass(!fxGraphProcessingActive);
  activeRuntimeModuleKey_.store(runtimeModuleKeyForId(canonicalModuleId), std::memory_order_release);
  activeRuntimeModule_.store(runtimeModuleForId(canonicalModuleId), std::memory_order_release);
}

void PadPilotAudioProcessor::setRecutPlaybackOwner(const std::string& moduleId, bool active) {
  if (!active) {
    recutPlaybackOwnerKey_.store(0, std::memory_order_release);
    recutPlaybackOwnerModule_.store(ActiveRuntimeModule::none, std::memory_order_release);
    recutPlaybackActive_.store(false, std::memory_order_release);
    return;
  }

  const auto canonicalModuleId = canonicalizeModuleId(moduleId);
  if (canonicalModuleId.empty()) {
    recutPlaybackOwnerKey_.store(0, std::memory_order_release);
    recutPlaybackOwnerModule_.store(ActiveRuntimeModule::none, std::memory_order_release);
    recutPlaybackActive_.store(false, std::memory_order_release);
    return;
  }

  recutPlaybackOwnerKey_.store(runtimeModuleKeyForId(canonicalModuleId), std::memory_order_release);
  recutPlaybackOwnerModule_.store(runtimeModuleForId(canonicalModuleId), std::memory_order_release);
  recutPlaybackActive_.store(true, std::memory_order_release);
}

PadPilotAudioProcessor::ActiveRuntimeModule PadPilotAudioProcessor::runtimeModuleForId(std::string_view moduleId) {
  if (moduleId.empty()) {
    return ActiveRuntimeModule::none;
  }
  if (moduleId == kFxModuleId || moduleId == kLegacyReverbModuleId) {
    return ActiveRuntimeModule::fx;
  }
  if (moduleId == kRecutModuleId) {
    return ActiveRuntimeModule::recut;
  }
  if (moduleId == kAnalyzerModuleId) {
    return ActiveRuntimeModule::analyzer;
  }
  if (moduleId == "editor") {
    return ActiveRuntimeModule::editor;
  }
  if (moduleId == "performance") {
    return ActiveRuntimeModule::performance;
  }
  return ActiveRuntimeModule::custom;
}

std::uint64_t PadPilotAudioProcessor::runtimeModuleKeyForId(std::string_view moduleId) {
  constexpr std::uint64_t kFnvOffsetBasis = 14695981039346656037ULL;
  constexpr std::uint64_t kFnvPrime = 1099511628211ULL;
  if (moduleId.empty()) {
    return 0;
  }

  std::uint64_t hash = kFnvOffsetBasis;
  for (const auto ch : moduleId) {
    hash ^= static_cast<std::uint8_t>(ch);
    hash *= kFnvPrime;
  }
  return hash;
}

std::string PadPilotAudioProcessor::getSelectedPresetPayloadLocked() const {
  if (selectedPresetId_.empty()) {
    return {};
  }

  for (const auto& preset : presets_) {
    if (preset.id == selectedPresetId_) {
      return preset.payloadJson;
    }
  }
  return {};
}

void PadPilotAudioProcessor::applyPresetPayloadJson(const std::string& payloadJson) {
  const auto parsed = juce::JSON::parse(payloadJson);
  if (!parsed.isObject()) {
    return;
  }

  const auto* root = parsed.getDynamicObject();
  if (root == nullptr) {
    return;
  }

  if (const auto chainsVar = root->getProperty("chains"); chainsVar.isArray()) {
    const auto* chainsArray = chainsVar.getArray();
    int orderIndex = 0;
    for (const auto& chainVar : *chainsArray) {
      const auto* chainObj = chainVar.getDynamicObject();
      if (chainObj == nullptr) {
        continue;
      }

      const auto chainId = padpilot::readBoundedJsonUInt(chainObj->getProperty("id"), 0xffU);
      const auto chainType = chainObj->getProperty("type").toString();
      const auto enabled = static_cast<bool>(chainObj->getProperty("enabled"));
      const auto mix = padpilot::readBoundedJsonFloat(chainObj->getProperty("mix"), 0.0f, 1.0f);
      const auto gainDb = padpilot::readBoundedJsonFloat(chainObj->getProperty("gainDb"), -96.0f, 24.0f);
      if (!chainId.has_value() || !mix.has_value() || !gainDb.has_value()) {
        continue;
      }

      padpilot::AudioCommand cmd {};
      cmd.type = padpilot::AudioCommandType::setFxChainEnabled;
      cmd.parameterId = *chainId;
      cmd.boolValue = enabled;
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setFxChainMix;
      cmd.parameterId = *chainId;
      cmd.value = *mix;
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setFxChainGainDb;
      cmd.parameterId = *chainId;
      cmd.value = *gainDb;
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setFxChainOrder;
      cmd.parameterId = *chainId;
      cmd.value = static_cast<float>(orderIndex);
      cmd.valueB = static_cast<float>(orderIndex);
      queueAudioCommand(cmd);

      if (chainType == "modulation") {
        cmd = {};
        cmd.type = padpilot::AudioCommandType::setModulationMix;
        cmd.value = *mix;
        queueAudioCommand(cmd);
      } else if (chainType == "eq") {
        cmd = {};
        cmd.type = padpilot::AudioCommandType::setEqBandCount;
        cmd.value = enabled ? 1.0f : 0.0f;
        queueAudioCommand(cmd);
      }

      ++orderIndex;
    }

    if (const auto globalMix = padpilot::readBoundedJsonFloat(
            root->getProperty("globalMix"), 0.0f, 1.0f); globalMix.has_value()) {
      padpilot::AudioCommand cmd {};
      cmd.type = padpilot::AudioCommandType::setConvolverWetDry;
      cmd.value = *globalMix;
      cmd.valueB = 1.0f - cmd.value;
      queueAudioCommand(cmd);
    }
    return;
  }

  if (const auto convolverVar = root->getProperty("convolver"); convolverVar.isObject()) {
    const auto* convObj = convolverVar.getDynamicObject();
    if (convObj != nullptr) {
      padpilot::AudioCommand cmd {};
      cmd.type = padpilot::AudioCommandType::setConvolverWetDry;
      cmd.value = padpilot::readBoundedJsonFloat(convObj->getProperty("wet"), 0.0f, 1.0f).value_or(1.0f);
      cmd.valueB = padpilot::readBoundedJsonFloat(convObj->getProperty("dry"), 0.0f, 1.0f).value_or(0.0f);
      queueAudioCommand(cmd);
    }
  }

  if (const auto delayVar = root->getProperty("delay"); delayVar.isObject()) {
    const auto* delayObj = delayVar.getDynamicObject();
    if (delayObj != nullptr) {
      padpilot::AudioCommand cmd {};
      cmd.type = padpilot::AudioCommandType::setDelaySyncEnabled;
      cmd.boolValue = static_cast<bool>(delayObj->getProperty("syncEnabled"));
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setDelayTimeBeats;
      cmd.value = padpilot::readBoundedJsonFloat(
          delayObj->getProperty("timeBeats"), 0.0f, 64.0f).value_or(0.5f);
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setDelayTimeHz;
      cmd.value = padpilot::readBoundedJsonFloat(
          delayObj->getProperty("timeHz"), 0.01f, 20'000.0f).value_or(2.0f);
      queueAudioCommand(cmd);

      cmd = {};
      cmd.type = padpilot::AudioCommandType::setDelayWetDry;
      cmd.value = padpilot::readBoundedJsonFloat(delayObj->getProperty("wet"), 0.0f, 1.0f).value_or(0.5f);
      cmd.valueB = padpilot::readBoundedJsonFloat(delayObj->getProperty("dry"), 0.0f, 1.0f).value_or(0.5f);
      queueAudioCommand(cmd);
    }
  }

  if (const auto reverbVar = root->getProperty("reverb"); reverbVar.isObject()) {
    const auto* reverbObj = reverbVar.getDynamicObject();
    if (reverbObj != nullptr) {
      padpilot::AudioCommand cmd {};
      cmd.type = padpilot::AudioCommandType::setReverbWetDry;
      cmd.value = padpilot::readBoundedJsonFloat(reverbObj->getProperty("wet"), 0.0f, 1.0f).value_or(0.5f);
      cmd.valueB = padpilot::readBoundedJsonFloat(reverbObj->getProperty("dry"), 0.0f, 1.0f).value_or(0.5f);
      queueAudioCommand(cmd);
    }
  }

}


void PadPilotAudioProcessor::handleAnalyzerModuleSwitchLocked(const std::string& previousModuleId,
                                                              const std::string& nextModuleId) {
  if (canonicalizeModuleId(previousModuleId) == canonicalizeModuleId(nextModuleId)) {
    return;
  }

  analyzerStreamModuleId_.clear();
  analyzerStreamActive_.store(false, std::memory_order_release);
  capabilityStreamKind_.clear();
  capabilityStreamHandle_.clear();
  capabilityStreamActive_.store(false, std::memory_order_release);
  recutRuntime_.setStreamActive(false);

  if (analyzerCaptureActive_.exchange(false, std::memory_order_acq_rel)) {
    analyzerRuntime_.setRecordMode(padpilot::AnalyzerRecordMode::stop);
  }

  analyzerRuntime_.setMonitoringEnabled(false);
}

const padpilot::ModuleRecord* PadPilotAudioProcessor::findModuleRecordLocked(const std::string& moduleId) const {
  const auto canonicalId = canonicalizeModuleId(moduleId);
  const auto it = std::find_if(modules_.begin(), modules_.end(), [this, &canonicalId](const auto& module) {
    return canonicalizeModuleId(module.id) == canonicalId;
  });
  return it == modules_.end() ? nullptr : &*it;
}

bool PadPilotAudioProcessor::moduleProvidesCapabilityLocked(
    const std::string& moduleId,
    const std::string_view capability) const {
  const auto* module = findModuleRecordLocked(moduleId);
  return module != nullptr && module->loadStatus == "ready" &&
         std::find(module->capabilities.begin(), module->capabilities.end(), capability) !=
             module->capabilities.end();
}

std::string PadPilotAudioProcessor::getSelectedFxGraphOwnerLocked() const {
  return fxGraphOwnerModuleId_ == selectedModuleId_ &&
                 moduleProvidesCapabilityLocked(fxGraphOwnerModuleId_, "fx-graph")
             ? fxGraphOwnerModuleId_
             : std::string {};
}

padpilot::ScriptModuleLoadRequest PadPilotAudioProcessor::getScriptModuleLoadRequestLocked(
    const std::string& moduleId) const {
  padpilot::ScriptModuleLoadRequest request;
  if (const auto* module = findModuleRecordLocked(moduleId); module != nullptr) {
    if (module->loadStatus != "ready") {
      return request;
    }
    request.bundledModulePath = module->scriptEntryPath;
    request.moduleId = canonicalizeModuleId(module->id);
    request.allowedCapabilities = module->capabilities;
  }
  return request;
}

bool PadPilotAudioProcessor::migrateModuleStateAfterScriptLoad(
    const std::string& moduleId,
    std::string* payload) {
  if (payload == nullptr || moduleId.empty()) {
    return false;
  }

  const auto canonicalId = canonicalizeModuleId(moduleId);
  padpilot::ModuleRecord module;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto* current = findModuleRecordLocked(canonicalId);
    if (current == nullptr) {
      return false;
    }
    module = *current;
  }

  const auto markCurrentSchema = [this, &canonicalId] {
    std::lock_guard<std::mutex> guard(stateMutex_);
    auto current = std::find_if(modules_.begin(), modules_.end(), [this, &canonicalId](const auto& candidate) {
      return canonicalizeModuleId(candidate.id) == canonicalId;
    });
    if (current != modules_.end()) {
      current->expectedModuleVersion = current->resolvedModuleVersion.empty()
                                           ? current->version
                                           : current->resolvedModuleVersion;
      current->expectedStateSchemaVersion = current->stateSchemaVersion;
    }
  };
  const auto failMigration = [this, &canonicalId](const std::string& reason) {
    {
      std::lock_guard<std::mutex> guard(stateMutex_);
      auto current = std::find_if(modules_.begin(), modules_.end(), [this, &canonicalId](const auto& candidate) {
        return canonicalizeModuleId(candidate.id) == canonicalId;
      });
      if (current != modules_.end()) {
        current->loadStatus = "state-migration-failed";
        current->loadErrorMessage = reason;
      }
    }
    scriptHost_.revokeModuleAuthorization();
    padpilot::appendBackendLog("module-state", "State migration failed module=" + canonicalId + " reason=" + reason);
    return false;
  };

  if (module.scriptEntryPath.empty()) {
    if (module.expectedStateSchemaVersion != 0 &&
        module.expectedStateSchemaVersion == module.stateSchemaVersion) {
      markCurrentSchema();
      return true;
    }
    return payload->empty()
               ? (markCurrentSchema(), true)
               : failMigration("Module has no Script Thread migration hook.");
  }
  if (payload->empty() || module.expectedStateSchemaVersion == module.stateSchemaVersion) {
    markCurrentSchema();
    return true;
  }
  if (module.expectedStateSchemaVersion == 0 || module.stateSchemaVersion == 0) {
    return failMigration("Saved state schema version is unavailable.");
  }
  if (module.expectedStateSchemaVersion > module.stateSchemaVersion) {
    return failMigration("Saved state schema is newer than installed Module schema.");
  }

  const auto originalPayload = *payload;
  const auto isJsonObject = [](const std::string& candidate) {
    if (candidate.empty() || candidate.size() > kMaxModuleStateBytes) {
      return false;
    }
    return juce::JSON::parse(juce::String::fromUTF8(
        candidate.data(), static_cast<int>(candidate.size()))).isObject();
  };
  std::string stateJson;
  std::string decodedPayload;
  if (padpilot::proto::base64ToBytes(originalPayload, &decodedPayload) &&
      isJsonObject(decodedPayload)) {
    stateJson = std::move(decodedPayload);
  } else if (isJsonObject(originalPayload)) {
    stateJson = originalPayload;
  } else {
    return failMigration("Saved state is not a JSON object.");
  }
  if (stateJson.empty() || stateJson.size() > kMaxModuleStateBytes) {
    return failMigration("Saved state is empty or exceeds migration bounds.");
  }

  auto migrated = scriptHost_.migrateModuleState(
      canonicalId,
      stateJson,
      module.expectedStateSchemaVersion,
      module.stateSchemaVersion);
  if (!migrated.has_value() || migrated->empty() || migrated->size() > kMaxModuleStateBytes) {
    return failMigration("onUpgradeState rejected or exceeded bounded execution.");
  }
  auto encoded = padpilot::proto::bytesToBase64(*migrated);
  if (encoded.empty() || encoded.size() > kMaxModuleStateBase64Chars) {
    return failMigration("Migrated state exceeds persistence bounds.");
  }

  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    auto existingState = moduleStatePayloadById_.find(canonicalId);
    const auto insertedState = existingState == moduleStatePayloadById_.end();
    if ((!insertedState && existingState->second != originalPayload) ||
        (insertedState &&
         (moduleStatePayloadById_.size() >= static_cast<std::size_t>(kMaxStoredModuleStates) ||
          !canReplaceBoundedPayload(moduleStatePayloadById_, canonicalId, encoded.size(),
                                    kMaxAggregateModuleStateBytes)))) {
      return false;
    }
    if (insertedState) {
      existingState = moduleStatePayloadById_.emplace(canonicalId, encoded).first;
    } else {
      existingState->second = encoded;
    }
    if (pendingPresetPayloadJson_.has_value() && *pendingPresetPayloadJson_ == originalPayload) {
      pendingPresetPayloadJson_ = encoded;
    }
    auto current = std::find_if(modules_.begin(), modules_.end(), [this, &canonicalId](const auto& candidate) {
      return canonicalizeModuleId(candidate.id) == canonicalId;
    });
    if (current == modules_.end()) {
      if (insertedState) {
        moduleStatePayloadById_.erase(existingState);
      } else {
        existingState->second = originalPayload;
      }
      return false;
    }
    current->expectedModuleVersion = current->resolvedModuleVersion.empty()
                                         ? current->version
                                         : current->resolvedModuleVersion;
    current->expectedStateSchemaVersion = current->stateSchemaVersion;
  }
  *payload = std::move(encoded);
  padpilot::appendBackendLog(
      "module-state",
      "Migrated Module state module=" + canonicalId + " schema=" +
          std::to_string(module.expectedStateSchemaVersion) + "->" +
          std::to_string(module.stateSchemaVersion));
  return true;
}

std::string PadPilotAudioProcessor::getModuleStatePayloadLocked(const std::string& moduleId) const {
  if (moduleId.empty()) {
    return {};
  }

  const auto canonicalId = canonicalizeModuleId(moduleId);
  if (const auto it = moduleStatePayloadById_.find(canonicalId); it != moduleStatePayloadById_.end()) {
    return it->second;
  }
  return {};
}

std::string PadPilotAudioProcessor::getModuleStatePayloadBase64Locked(const std::string& moduleId) const {
  const auto payload = getModuleStatePayloadLocked(moduleId);
  if (payload.empty()) {
    return {};
  }

  std::string bytes;
  if (padpilot::proto::base64ToBytes(payload, &bytes)) {
    return payload;
  }

  if (moduleProvidesCapabilityLocked(canonicalizeModuleId(moduleId), "fx-graph")) {
    const auto migrated = padpilot::proto::migrateLegacyJsonToFxChainState(payload, selectedPresetId_);
    return padpilot::proto::bytesToBase64(padpilot::proto::serializeFxChainState(migrated));
  }

  return padpilot::proto::bytesToBase64(payload);
}

std::string PadPilotAudioProcessor::getModuleStateBytesLocked(const std::string& moduleId) const {
  const auto payload = getModuleStatePayloadLocked(moduleId);
  if (payload.empty()) {
    return {};
  }

  std::string bytes;
  if (padpilot::proto::base64ToBytes(payload, &bytes)) {
    return bytes;
  }

  if (moduleProvidesCapabilityLocked(canonicalizeModuleId(moduleId), "fx-graph")) {
    const auto migrated = padpilot::proto::migrateLegacyJsonToFxChainState(payload, selectedPresetId_);
    return padpilot::proto::serializeFxChainState(migrated);
  }

  return payload;
}

void PadPilotAudioProcessor::applyPresetPayload(const std::string& moduleId, const std::string& payload) {
  if (payload.empty()) {
    return;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  applyPresetPayloadWhileStateTransitionLocked(moduleId, payload);
}

void PadPilotAudioProcessor::applyPresetPayloadWhileStateTransitionLocked(
    const std::string& moduleId,
    const std::string& payload) {
  if (payload.empty()) {
    return;
  }

  const auto canonicalId = canonicalizeModuleId(moduleId);
  bool isFxGraphState = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto current = moduleStatePayloadById_.find(canonicalId);
    if (current != moduleStatePayloadById_.end() && current->second != payload) {
      return;
    }
    isFxGraphState = canonicalId == getSelectedFxGraphOwnerLocked();
  }
  endAllAutomationTouches();
  if (canonicalId == kAnalyzerModuleId) {
    std::string bytes;
    padpilot::analyzer::AnalyzerModuleState state;
    if (padpilot::proto::base64ToBytes(payload, &bytes) &&
        padpilot::proto::parseAnalyzerModuleState(bytes, &state) && isValidAnalyzerState(state)) {
      analyzerRuntime_.restoreState(state);
    }
    return;
  }
  if (canonicalId == kRecutModuleId) {
    std::string bytes;
    padpilot::recut::RecutModuleState state;
    const auto applied = padpilot::proto::base64ToBytes(payload, &bytes) &&
                         padpilot::proto::parseRecutModuleState(bytes, &state) &&
                         isValidRecutState(state) && recutRuntime_.applyStateFromBytes(bytes);
    setRecutPlaybackOwner(canonicalId, applied);
    return;
  }
  if (!isFxGraphState) {
    return;
  }

  std::string bytes;
  if (padpilot::proto::base64ToBytes(payload, &bytes)) {
    padpilot::fx::FxChainState state;
    if (padpilot::proto::parseFxChainState(bytes, &state) && isValidFxState(state)) {
      applyFxStateDiff(state);
    }
    return;
  }

  const auto migrated = padpilot::proto::migrateLegacyJsonToFxChainState(payload, selectedPresetId_);
  applyFxStateDiff(migrated);
}

void PadPilotAudioProcessor::applyRestoredStateToRuntime(const std::string& moduleId, const std::string& payload) {
  if (payload.empty()) {
    return;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  applyRestoredStateWhileStateTransitionLocked(moduleId, payload);
}

void PadPilotAudioProcessor::applyRestoredStateWhileStateTransitionLocked(
    const std::string& moduleId,
    const std::string& payload) {
  if (payload.empty()) {
    return;
  }

  const auto canonicalId = canonicalizeModuleId(moduleId);
  bool isFxGraphState = false;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto current = moduleStatePayloadById_.find(canonicalId);
    if (current != moduleStatePayloadById_.end() && current->second != payload) {
      return;
    }
    isFxGraphState = canonicalId == getSelectedFxGraphOwnerLocked();
  }
  endAllAutomationTouches();
  if (canonicalId == kAnalyzerModuleId) {
    std::string bytes;
    padpilot::analyzer::AnalyzerModuleState state;
    if (padpilot::proto::base64ToBytes(payload, &bytes) &&
        padpilot::proto::parseAnalyzerModuleState(bytes, &state) && isValidAnalyzerState(state)) {
      analyzerRuntime_.restoreState(state);
    }
    return;
  }
  if (canonicalId == kRecutModuleId) {
    std::string bytes;
    padpilot::recut::RecutModuleState state;
    const auto applied = padpilot::proto::base64ToBytes(payload, &bytes) &&
                         padpilot::proto::parseRecutModuleState(bytes, &state) &&
                         isValidRecutState(state) && recutRuntime_.applyStateFromBytes(bytes);
    setRecutPlaybackOwner(canonicalId, applied);
    return;
  }
  if (!isFxGraphState) {
    return;
  }

  std::string bytes;
  if (padpilot::proto::base64ToBytes(payload, &bytes)) {
    padpilot::fx::FxChainState state;
    if (padpilot::proto::parseFxChainState(bytes, &state) && isValidFxState(state)) {
      applyFxChainState(state, true);
    }
    return;
  }

  applyFxChainState(padpilot::proto::migrateLegacyJsonToFxChainState(payload, selectedPresetId_), true);
}

void PadPilotAudioProcessor::applyFxChainState(const padpilot::fx::FxChainState& state, bool allowSuspend) {
  juce::ignoreUnused(allowSuspend);
  if (!isValidFxState(state) || !isValidManagedFxState(state)) {
    return;
  }
  std::lock_guard<std::mutex> writerGuard(graphMutationMutex_);
  convolverGraph_.requestStructuralBypass(true);
  if (runtimeStarted_.load(std::memory_order_acquire)) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(100);
    while (!convolverGraph_.isStructuralBypassComplete() &&
           std::chrono::steady_clock::now() < deadline) {
      std::this_thread::yield();
    }
  }
  {
    GraphMutationGuard mutationGuard(*this, graphMutationRequested_, graphReaders_);
    updateLastAppliedFxState(state);
    syncDirectParametersFromFxState(state);
    convolverGraph_.applyState(state);
    padpilot::advanceGraphEpoch(graphCommandEpoch_);
  }
  convolverGraph_.requestStructuralBypass(false);
}
