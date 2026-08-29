#include "core/pad-pilot-processor.h"

#include "core/pad-pilot-processor-internal.h"

using namespace padpilot::processor_detail;

std::string PadPilotAudioProcessor::serializePluginStateToJson() const {
  const_cast<PadPilotAudioProcessor*>(this)->reconcileFxStateFromParametersIfDirty();
  juce::DynamicObject::Ptr rootObject = new juce::DynamicObject();
  juce::Array<juce::var> modulesArray;
  juce::Array<juce::var> presetsArray;
  juce::DynamicObject::Ptr moduleStateObject = new juce::DynamicObject();
  juce::DynamicObject::Ptr editorViewStateObject = new juce::DynamicObject();

  std::string selectedModuleId;
  std::string selectedPresetId;

  {
    std::lock_guard<std::mutex> guard(stateMutex_);

    for (const auto& module : modules_) {
      juce::DynamicObject::Ptr moduleObj = new juce::DynamicObject();
      moduleObj->setProperty("id", juce::String(module.id));
      moduleObj->setProperty("name", juce::String(module.name));
      moduleObj->setProperty(
          "version",
          juce::String(module.expectedModuleVersion.empty()
                           ? module.version
                           : module.expectedModuleVersion));
      moduleObj->setProperty("entryPath", juce::String(module.entryPath));
      moduleObj->setProperty("scriptEntryPath", juce::String(module.scriptEntryPath));
      moduleObj->setProperty("installRootPath", juce::String(module.installRootPath));
      moduleObj->setProperty("manifestPath", juce::String(module.manifestPath));
      moduleObj->setProperty("apiVersion", juce::String(module.apiVersion));
      moduleObj->setProperty("checksum", juce::String(module.checksum));
      moduleObj->setProperty("installedAt", juce::String(module.installedAt));
      juce::Array<juce::var> capabilities;
      for (const auto& capability : module.capabilities) {
        capabilities.add(juce::String(capability));
      }
      moduleObj->setProperty("capabilities", capabilities);
      moduleObj->setProperty("loadStatus", juce::String(module.loadStatus));
      moduleObj->setProperty("loadErrorMessage", juce::String(module.loadErrorMessage));
      moduleObj->setProperty("expectedModuleVersion", juce::String(module.expectedModuleVersion));
      moduleObj->setProperty("resolvedModuleVersion", juce::String(module.resolvedModuleVersion));
      modulesArray.add(juce::var(moduleObj.get()));
    }

    for (const auto& preset : presets_) {
      juce::DynamicObject::Ptr presetObj = new juce::DynamicObject();
      presetObj->setProperty("id", juce::String(preset.id));
      presetObj->setProperty("moduleId", juce::String(preset.moduleId));
      presetObj->setProperty("name", juce::String(preset.name));
      presetObj->setProperty("payload", juce::JSON::parse(juce::String(preset.payloadJson)));
      presetsArray.add(juce::var(presetObj.get()));
    }

    for (const auto& [moduleId, payloadJson] : moduleStatePayloadById_) {
      if (canonicalizeModuleId(moduleId) == kAnalyzerModuleId) {
        continue;
      }
      moduleStateObject->setProperty(
          juce::Identifier(moduleId),
          juce::JSON::parse(juce::String(payloadJson)));
    }

    for (const auto& [scopeId, payloadJson] : editorViewStatePayloadByScope_) {
      editorViewStateObject->setProperty(
          juce::Identifier(scopeId),
          juce::JSON::parse(juce::String(payloadJson)));
    }

    selectedModuleId = selectedModuleId_;
    selectedPresetId = selectedPresetId_;
  }

  rootObject->setProperty("schemaVersion", 2);
  rootObject->setProperty("selectedModuleId", juce::String(selectedModuleId));
  rootObject->setProperty("selectedPresetId", juce::String(selectedPresetId));
  rootObject->setProperty("modules", modulesArray);
  rootObject->setProperty("presets", presetsArray);
  rootObject->setProperty("moduleStates", juce::var(moduleStateObject.get()));
  rootObject->setProperty("editorViewStates", juce::var(editorViewStateObject.get()));
  return juce::JSON::toString(juce::var(rootObject.get()), false).toStdString();
}

std::string PadPilotAudioProcessor::serializePluginStateToProtobuf() const {
  const_cast<PadPilotAudioProcessor*>(this)->reconcileFxStateFromParametersIfDirty();
  auto recutSnapshot = readBoundedRecutStateSnapshot(recutRuntime_);
  if (!recutSnapshot.has_value()) {
    const auto defaultState = padpilot::proto::createDefaultRecutState();
    recutSnapshot = BoundedRecutStateSnapshot {
        padpilot::proto::serializeRecutModuleState(defaultState),
        defaultState.revision(),
    };
  }
  auto analyzerSnapshot = readBoundedAnalyzerStateSnapshot(analyzerRuntime_);
  if (!analyzerSnapshot.has_value()) {
    const auto defaultState = padpilot::proto::createDefaultAnalyzerState();
    analyzerSnapshot = BoundedAnalyzerStateSnapshot {
        padpilot::proto::serializeAnalyzerModuleState(defaultState),
        defaultState.revision(),
    };
  }
  const auto& recutStateBytes = recutSnapshot->payloadBytes;
  const auto recutStateBase64 = padpilot::proto::bytesToBase64(recutStateBytes);
  const auto& analyzerStateBytes = analyzerSnapshot->payloadBytes;
  const auto encodedRecutStateBytes = ((recutStateBytes.size() + 2U) / 3U) * 4U;
  const auto encodedAnalyzerStateBytes = ((analyzerStateBytes.size() + 2U) / 3U) * 4U;
  if (encodedRecutStateBytes > kMaxAggregateModuleStateBytes ||
      encodedAnalyzerStateBytes > kMaxAggregateModuleStateBytes - encodedRecutStateBytes) {
    return {};
  }

  padpilot::bridge::PluginState state;
  state.set_schema_version(kPluginStateSchemaVersion);
  static_assert(padpilot::state_wire_limits::kMaximumPersistedParameterValues ==
                static_cast<std::size_t>(kMacroSlotCount + 3));
  state.add_parameter_values(readParameterNormalized(kMasterInputParameterId));
  state.add_parameter_values(readParameterNormalized(kMasterWetDryParameterId));
  state.add_parameter_values(readParameterNormalized(kMasterOutputParameterId));
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    state.add_parameter_values(readParameterNormalized(getMacroParameterId(slotIndex)));
  }

  std::lock_guard<std::mutex> guard(stateMutex_);
  for (const auto& module : modules_) {
    auto* summary = state.add_modules();
    summary->set_id(canonicalizeModuleId(module.id));
    summary->set_name(module.name);
    summary->set_version(module.expectedModuleVersion.empty()
                             ? module.version
                             : module.expectedModuleVersion);
  }

  std::size_t serializedPresetBytes = 0;
  for (const auto& preset : presets_) {
    const auto moduleId = canonicalizeModuleId(preset.moduleId);
    if (!padpilot::isValidPresetId(preset.id) || !padpilot::isValidModuleId(moduleId) || preset.name.empty() ||
        preset.name.size() > kMaxDisplayNameBytes) {
      continue;
    }
    std::string bytes;
    if (padpilot::proto::base64ToBytes(preset.payloadJson, &bytes)) {
    } else if (moduleId == kFxModuleId) {
      const auto migrated = padpilot::proto::migrateLegacyJsonToFxChainState(preset.payloadJson, preset.id);
      bytes = padpilot::proto::serializeFxChainState(migrated);
    } else {
      bytes = preset.payloadJson;
    }
    const auto encodedSize = ((bytes.size() + 2U) / 3U) * 4U;
    if (bytes.empty() || bytes.size() > kMaxModuleStateBytes ||
        encodedSize > kMaxAggregatePresetStateBytes - serializedPresetBytes) {
      continue;
    }

    auto* file = state.add_presets();
    file->set_id(preset.id);
    file->set_module_id(moduleId);
    file->set_name(preset.name);
    file->set_state(bytes);
    file->set_schema_version(1);
    serializedPresetBytes += encodedSize;
  }

  std::size_t serializedModuleStateBytes = encodedRecutStateBytes + encodedAnalyzerStateBytes;
  int serializedModuleStateEntries = 0;
  std::vector<std::string> moduleStateIds;
  moduleStateIds.reserve(moduleStatePayloadById_.size());
  for (const auto& [moduleId, payload] : moduleStatePayloadById_) {
    juce::ignoreUnused(payload);
    const auto canonicalId = canonicalizeModuleId(moduleId);
    if (canonicalId == kAnalyzerModuleId || canonicalId == kRecutModuleId) {
      continue;
    }
    moduleStateIds.push_back(canonicalId);
  }
  std::sort(moduleStateIds.begin(), moduleStateIds.end());
  moduleStateIds.erase(std::unique(moduleStateIds.begin(), moduleStateIds.end()), moduleStateIds.end());
  for (const auto& canonicalId : moduleStateIds) {
    const auto payload = getModuleStateBytesLocked(canonicalId);
    const auto encodedPayloadSize = ((payload.size() + 2U) / 3U) * 4U;
    if (!padpilot::isValidModuleId(canonicalId) || payload.empty() || payload.size() > kMaxModuleStateBytes ||
        serializedModuleStateEntries >= kMaxStoredModuleStates ||
        encodedPayloadSize > kMaxAggregateModuleStateBytes - serializedModuleStateBytes) {
      continue;
    }
    std::uint64_t acceptedRevision = 0;
    if (canonicalId == kFxModuleId) {
      padpilot::fx::FxChainState fxState;
      if (!padpilot::proto::parseFxChainState(payload, &fxState) || !isValidFxState(fxState)) {
        continue;
      }
      acceptedRevision = fxState.revision();
    } else if (const auto accepted = acceptedRevisionByModuleId_.find(canonicalId);
               accepted != acceptedRevisionByModuleId_.end()) {
      acceptedRevision = accepted->second;
    }
    auto* entry = state.add_module_states();
    entry->set_module_id(canonicalId);
    entry->set_payload(payload);
    entry->set_accepted_revision(acceptedRevision);
    serializedModuleStateBytes += encodedPayloadSize;
    ++serializedModuleStateEntries;
  }

  auto* recutEntry = state.add_module_states();
  recutEntry->set_module_id(kRecutModuleId);
  recutEntry->set_payload(recutStateBytes);
  recutEntry->set_accepted_revision(recutSnapshot->revision);
  appendImportedMediaForModuleState(kRecutModuleId, recutStateBase64, state);
  if (const auto fxState = moduleStatePayloadById_.find(kFxModuleId);
      fxState != moduleStatePayloadById_.end()) {
    appendImportedMediaForModuleState(kFxModuleId, fxState->second, state);
  }
  for (const auto& preset : presets_) {
    if (canonicalizeModuleId(preset.moduleId) == kFxModuleId) {
      appendImportedMediaForModuleState(kFxModuleId, preset.payloadJson, state);
    }
  }

  auto* analyzerEntry = state.add_module_states();
  analyzerEntry->set_module_id(kAnalyzerModuleId);
  analyzerEntry->set_payload(analyzerStateBytes);
  analyzerEntry->set_accepted_revision(analyzerSnapshot->revision);

  state.set_selected_module_id(selectedModuleId_);
  state.set_selected_preset_id(selectedPresetId_);
  for (const auto& [scopeId, payloadJson] : editorViewStatePayloadByScope_) {
    auto* entry = state.add_editor_view_states();
    entry->set_scope_id(scopeId);
    entry->set_payload_json(payloadJson);
  }
  for (const auto& binding : automationBindings_) {
    if (!binding.isActive()) {
      continue;
    }
    auto* entry = state.add_automation_bindings();
    entry->set_slot_index(static_cast<std::uint32_t>(binding.slotIndex));
    entry->set_module_id(binding.moduleId);
    entry->set_chain_id(binding.chainId);
    entry->set_node_id(binding.nodeId);
    entry->set_control_key(binding.controlKey);
    entry->set_display_name(binding.displayName);
    entry->set_value_kind(binding.valueKind == AutomationValueKind::booleanValue
                              ? padpilot::bridge::AUTOMATION_VALUE_KIND_BOOLEAN
                              : padpilot::bridge::AUTOMATION_VALUE_KIND_FLOAT);
    entry->set_target_kind(static_cast<padpilot::bridge::AutomationTargetKind>(binding.targetKind));
    entry->set_parameter_id(binding.parameterId);
    entry->set_min_value(binding.minValue);
    entry->set_max_value(binding.maxValue);
  }
  padpilot::populateProtoControllerConfig(controllerConfig_, state.mutable_controller_config());
  if (!isValidControllerConfigProto(state.controller_config())) {
    padpilot::populateProtoControllerConfig(
        padpilot::createDefaultControllerConfig(), state.mutable_controller_config());
  }

  std::string bytes;
  if (!state.SerializeToString(&bytes) || bytes.size() > kMaxPluginStateBytes) {
    return {};
  }
  return bytes;
}

bool PadPilotAudioProcessor::restorePluginStateFromProtobuf(const void* data, int sizeInBytes) {
  if (data == nullptr || sizeInBytes <= 0 ||
      static_cast<std::size_t>(sizeInBytes) > kMaxPluginStateBytes ||
      !padpilot::preflightPluginStateWire(data, static_cast<std::size_t>(sizeInBytes))) {
    return false;
  }

  padpilot::bridge::PluginState state;
  if (!state.ParseFromArray(data, sizeInBytes)) {
    return false;
  }

  if (state.schema_version() == 0U || state.schema_version() > kPluginStateSchemaVersion ||
      state.modules_size() > kMaxPersistedModules || state.presets_size() > kMaxPersistedPresets ||
      state.module_states_size() > kMaxPersistedModuleStates ||
      state.editor_view_states_size() > kMaxPersistedEditorViewStates ||
      state.imported_media_size() > kMaxPersistedImportedMedia ||
      state.automation_bindings_size() > kMaxPersistedAutomationBindings ||
      (state.parameter_values_size() != 0 &&
       state.parameter_values_size() !=
           static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedParameterValues)) ||
      (state.has_controller_config() && !isValidControllerConfigProto(state.controller_config()))) {
    return false;
  }
  for (const auto parameterValue : state.parameter_values()) {
    if (!std::isfinite(parameterValue) || parameterValue < 0.0f || parameterValue > 1.0f) {
      return false;
    }
  }
  std::size_t importedMediaBytes = 0;
  for (const auto& importedMedia : state.imported_media()) {
    if (!padpilot::fitsAggregateByteBudget(importedMediaBytes,
                                           importedMedia.payload().size(),
                                           kMaxAggregateImportedMediaBytes)) {
      return false;
    }
    importedMediaBytes += importedMedia.payload().size();
  }

  const auto installedModules = moduleStore_.loadAllModules();
  std::vector<padpilot::ModuleRecord> restoredModules;
  std::vector<padpilot::PresetRecord> restoredPresets;
  std::unordered_map<std::string, std::string> restoredModuleStates;
  std::unordered_map<std::string, std::string> restoredEditorViewStates;
  std::unordered_map<std::string, std::uint64_t> restoredRevisions;
  std::array<AutomationBinding, kMacroSlotCount> restoredAutomationBindings {};
  std::array<bool, kMacroSlotCount> restoredAutomationSlots {};
  auto restoredControllerConfig = padpilot::createDefaultControllerConfig();
  std::unordered_set<std::string> restoredModuleIds;
  std::unordered_set<std::string> restoredPresetIds;
  std::size_t restoredPresetPayloadBytes = 0;
  std::size_t restoredModuleStateBytes = 0;
  std::size_t restoredEditorViewStateBytes = 0;

  for (const auto& moduleSummary : state.modules()) {
    padpilot::ModuleRecord persistedReference;
    persistedReference.id = canonicalizeModuleId(moduleSummary.id());
    if (!padpilot::isValidModuleId(persistedReference.id) ||
        isLegacyRemovedBuiltInModuleId(persistedReference.id) ||
        !restoredModuleIds.insert(persistedReference.id).second) {
      continue;
    }
    if (moduleSummary.name().size() <= kMaxDisplayNameBytes) {
      persistedReference.name = moduleSummary.name();
    }
    if (moduleSummary.version().size() <= kMaxModuleVersionBytes) {
      persistedReference.version = moduleSummary.version();
    }
    auto record = moduleStore_.restorePersistedModuleReference(persistedReference, installedModules);
    if (record.id.empty()) {
      restoredModuleIds.erase(persistedReference.id);
      continue;
    }
    restoredModules.push_back(std::move(record));
  }
  restoredModules = mergeInstalledModuleInventory(std::move(restoredModules), installedModules);
  restoredModuleIds.clear();
  for (const auto& module : restoredModules) {
    restoredModuleIds.insert(module.id);
  }

  for (const auto& preset : state.presets()) {
    padpilot::PresetRecord record;
    record.id = preset.id();
    record.moduleId = canonicalizeModuleId(preset.module_id());
    record.name = preset.name();
    const auto encodedPayloadSize = ((static_cast<std::size_t>(preset.state().size()) + 2U) / 3U) * 4U;
    if (!padpilot::isValidPresetId(record.id) || !restoredModuleIds.contains(record.moduleId) || record.name.empty() ||
        record.name.size() > kMaxDisplayNameBytes || preset.state().empty() ||
        static_cast<std::size_t>(preset.state().size()) > kMaxModuleStateBytes ||
        encodedPayloadSize > kMaxAggregatePresetStateBytes - restoredPresetPayloadBytes) {
      continue;
    }
    if (record.moduleId == kFxModuleId) {
      padpilot::fx::FxChainState fxState;
      if (!padpilot::proto::parseFxChainState(preset.state(), &fxState) || !isValidFxState(fxState)) {
        continue;
      }
    } else if (record.moduleId == kRecutModuleId) {
      padpilot::recut::RecutModuleState recutState;
      if (!padpilot::proto::parseRecutModuleState(preset.state(), &recutState) || !isValidRecutState(recutState)) {
        continue;
      }
    } else if (record.moduleId == kAnalyzerModuleId) {
      padpilot::analyzer::AnalyzerModuleState analyzerState;
      if (!padpilot::proto::parseAnalyzerModuleState(preset.state(), &analyzerState) ||
          !isValidAnalyzerState(analyzerState)) {
        continue;
      }
    }
    if (!restoredPresetIds.insert(record.id).second) {
      continue;
    }
    record.payloadJson = padpilot::proto::bytesToBase64(preset.state());
    restoredPresetPayloadBytes += record.payloadJson.size();
    restoredPresets.push_back(std::move(record));
  }

  for (const auto& moduleState : state.module_states()) {
    const auto moduleId = canonicalizeModuleId(moduleState.module_id());
    const auto encodedPayloadSize = ((static_cast<std::size_t>(moduleState.payload().size()) + 2U) / 3U) * 4U;
    if (!restoredModuleIds.contains(moduleId) || moduleState.payload().empty() ||
        static_cast<std::size_t>(moduleState.payload().size()) > kMaxModuleStateBytes ||
        encodedPayloadSize > kMaxAggregateModuleStateBytes - restoredModuleStateBytes) {
      continue;
    }

    auto acceptedRevision = moduleState.accepted_revision();
    if (moduleId == kFxModuleId) {
      padpilot::fx::FxChainState fxState;
      if (!padpilot::proto::parseFxChainState(moduleState.payload(), &fxState) ||
          !isValidFxState(fxState) || fxState.revision() != moduleState.accepted_revision()) {
        continue;
      }
      acceptedRevision = fxState.revision();
    } else if (moduleId == kRecutModuleId) {
      padpilot::recut::RecutModuleState recutState;
      if (!padpilot::proto::parseRecutModuleState(moduleState.payload(), &recutState) ||
          !isValidRecutState(recutState) || recutState.revision() != moduleState.accepted_revision()) {
        continue;
      }
      acceptedRevision = recutState.revision();
    } else if (moduleId == kAnalyzerModuleId) {
      padpilot::analyzer::AnalyzerModuleState analyzerState;
      if (!padpilot::proto::parseAnalyzerModuleState(moduleState.payload(), &analyzerState) ||
          !isValidAnalyzerState(analyzerState) ||
          analyzerState.revision() != moduleState.accepted_revision()) {
        continue;
      }
      acceptedRevision = analyzerState.revision();
    }

    if (restoredModuleStates.emplace(moduleId, padpilot::proto::bytesToBase64(moduleState.payload())).second) {
      restoredModuleStateBytes += encodedPayloadSize;
      restoredRevisions.emplace(moduleId, acceptedRevision);
    }
  }

  for (const auto& editorViewState : state.editor_view_states()) {
    const auto scopeId = canonicalizeModuleId(editorViewState.scope_id());
    if (!padpilot::isValidModuleId(scopeId) || scopeId.size() > kMaxEditorScopeBytes ||
        (!isGlobalEditorViewScope(scopeId) && !restoredModuleIds.contains(scopeId)) ||
        editorViewState.payload_json().empty() ||
        editorViewState.payload_json().size() > kMaxEditorViewStateBytes ||
        editorViewState.payload_json().size() >
            kMaxAggregateEditorViewStateBytes - restoredEditorViewStateBytes) {
      continue;
    }
    const auto parsedPayload = juce::JSON::parse(juce::String::fromUTF8(
        editorViewState.payload_json().data(),
        static_cast<int>(editorViewState.payload_json().size())));
    if (parsedPayload.isVoid()) {
      continue;
    }
    if (restoredEditorViewStates.emplace(scopeId, editorViewState.payload_json()).second) {
      restoredEditorViewStateBytes += editorViewState.payload_json().size();
    }
  }

  for (const auto& importedMedia : state.imported_media()) {
    const auto moduleId = canonicalizeModuleId(importedMedia.module_id());
    const bool isRecutSample = moduleId == kRecutModuleId && importedMedia.category() == "sample";
    const bool isFxImpulse = moduleId == kFxModuleId && importedMedia.category() == "impulse-response";
    if ((!isRecutSample && !isFxImpulse) ||
        !padpilot::ManagedFileStore::isValidContentId(importedMedia.content_id()) ||
        importedMedia.source_name().empty() || importedMedia.source_name().size() > kMaxDisplayNameBytes ||
        !padpilot::ManagedFileStore::isSupportedSampleName(importedMedia.source_name()) ||
        importedMedia.payload().empty() ||
        static_cast<std::uint64_t>(importedMedia.payload().size()) >
            padpilot::ManagedFileStore::kDefaultMaxImportBytes) {
      continue;
    }
    bool healed = false;
    if (auto payloadIt = restoredModuleStates.find(moduleId); payloadIt != restoredModuleStates.end()) {
      healed = isRecutSample
          ? healManagedMediaForRecutState(importedMedia, &payloadIt->second)
          : healManagedMediaForFxState(importedMedia, &payloadIt->second);
    }
    if (isFxImpulse) {
      for (auto& preset : restoredPresets) {
        if (canonicalizeModuleId(preset.moduleId) == kFxModuleId) {
          healed = healManagedMediaForFxState(importedMedia, &preset.payloadJson) || healed;
        }
      }
    }
    if (!healed) {
      continue;
    }
  }

  for (const auto& binding : state.automation_bindings()) {
    if (binding.slot_index() == 0U || binding.slot_index() > static_cast<std::uint32_t>(kMacroSlotCount) ||
        binding.module_id().size() > padpilot::kMaximumModuleIdBytes ||
        binding.control_key().size() > kMaxAutomationControlKeyBytes ||
        binding.display_name().size() > kMaxDisplayNameBytes ||
        (binding.value_kind() != padpilot::bridge::AUTOMATION_VALUE_KIND_FLOAT &&
         binding.value_kind() != padpilot::bridge::AUTOMATION_VALUE_KIND_BOOLEAN)) {
      continue;
    }
    const auto slotIndex = static_cast<int>(binding.slot_index());
    if (restoredAutomationSlots[static_cast<std::size_t>(slotIndex - 1)]) {
      continue;
    }
    AutomationBinding destination;
    destination.slotIndex = slotIndex;
    destination.moduleId = canonicalizeModuleId(binding.module_id());
    destination.chainId = binding.chain_id();
    destination.nodeId = binding.node_id();
    destination.controlKey = binding.control_key();
    destination.displayName = binding.display_name();
    destination.valueKind = binding.value_kind() == padpilot::bridge::AUTOMATION_VALUE_KIND_BOOLEAN
                                ? AutomationValueKind::booleanValue
                                : AutomationValueKind::floatValue;
    destination.targetKind = static_cast<AutomationTargetKind>(binding.target_kind());
    destination.parameterId = binding.parameter_id();
    destination.minValue = binding.min_value();
    destination.maxValue = binding.max_value();
    const auto bindingModule = std::find_if(
        restoredModules.begin(), restoredModules.end(), [&destination](const auto& module) {
          return module.id == destination.moduleId && module.loadStatus == "ready" &&
                 std::find(module.capabilities.begin(), module.capabilities.end(), "automation") !=
                     module.capabilities.end();
        });
    if (bindingModule != restoredModules.end() && isValidAutomationBinding(destination)) {
      restoredAutomationBindings[static_cast<std::size_t>(slotIndex - 1)] = std::move(destination);
      restoredAutomationSlots[static_cast<std::size_t>(slotIndex - 1)] = true;
    }
  }
  if (state.has_controller_config()) {
    restoredControllerConfig = padpilot::controllerConfigFromProto(state.controller_config());
  }

  auto selectedModuleId = canonicalizeModuleId(state.selected_module_id());
  if (!padpilot::isValidModuleId(selectedModuleId)) {
    selectedModuleId.clear();
  }
  auto selectedPresetId = state.selected_preset_id();
  if (!selectedPresetId.empty() && !padpilot::isValidPresetId(selectedPresetId)) {
    selectedPresetId.clear();
  }

  std::lock_guard<std::mutex> guard(stateMutex_);
  modules_ = std::move(restoredModules);
  presets_ = std::move(restoredPresets);
  moduleStatePayloadById_ = std::move(restoredModuleStates);
  editorViewStatePayloadByScope_ = std::move(restoredEditorViewStates);
  acceptedRevisionByModuleId_ = std::move(restoredRevisions);
  controllerConfig_ = std::move(restoredControllerConfig);
  setSelectedModuleLocked(selectedModuleId);
  selectedPresetId_ = selectedPresetId;
  automationBindings_ = restoredAutomationBindings;
  if ((selectedModuleId_.empty() || isLegacyRemovedBuiltInModuleId(selectedModuleId_) ||
       findModuleRecordLocked(selectedModuleId_) == nullptr)) {
    setSelectedModuleLocked(modules_.empty() ? std::string {} : modules_.front().id);
  }
  if (!selectedPresetId_.empty()) {
    const auto selectedPreset = std::find_if(presets_.begin(), presets_.end(), [this](const auto& preset) {
      return preset.id == selectedPresetId_ && canonicalizeModuleId(preset.moduleId) == selectedModuleId_;
    });
    if (selectedPreset == presets_.end()) {
      selectedPresetId_.clear();
    }
  }
  analyzerStreamModuleId_.clear();
  analyzerStreamActive_.store(false, std::memory_order_release);
  analyzerCaptureActive_.store(false, std::memory_order_release);
  setRecutPlaybackOwner({}, false);
  inputThread_.setControllerConfig(controllerConfig_);

  hasRestoredState_ = true;
  lastAppliedFxState_.reset();
  fxRuntimeStateDirty_.store(false, std::memory_order_release);
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    syncRealtimeAutomationBinding(slotIndex, automationBindings_[static_cast<std::size_t>(slotIndex - 1)]);
  }
  if (state.parameter_values_size() ==
      static_cast<int>(padpilot::state_wire_limits::kMaximumPersistedParameterValues)) {
    int parameterIndex = 0;
    setParameterNormalizedSilently(kMasterInputParameterId, state.parameter_values(parameterIndex++));
    setParameterNormalizedSilently(kMasterWetDryParameterId, state.parameter_values(parameterIndex++));
    setParameterNormalizedSilently(kMasterOutputParameterId, state.parameter_values(parameterIndex++));
    for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
      setParameterNormalizedSilently(getMacroParameterId(slotIndex), state.parameter_values(parameterIndex++));
    }
  }
  return true;
}

void PadPilotAudioProcessor::appendImportedMediaForModuleState(const std::string& moduleId,
                                                               const std::string& payloadBase64,
                                                               padpilot::bridge::PluginState& pluginState) const {
  const auto canonicalId = canonicalizeModuleId(moduleId);
  if (canonicalId != kRecutModuleId && canonicalId != kFxModuleId) {
    return;
  }

  std::string payloadBytes;
  if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes)) {
    return;
  }

  const auto append = [&](const std::string& category,
                          const std::string& contentId,
                          const std::string& sourceName,
                          const std::string& managedPath) {
    if (pluginState.imported_media_size() >= kMaxPersistedImportedMedia || contentId.empty() ||
        sourceName.empty()) {
      return;
    }
    for (const auto& existing : pluginState.imported_media()) {
      if (existing.category() == category && existing.content_id() == contentId) {
        return;
      }
    }
    std::string managedBytes;
    std::string errorMessage;
    if (!managedFileStore_.loadManagedFileBytes(managedPath, &managedBytes, errorMessage)) {
      return;
    }
    std::size_t retainedMediaBytes = 0;
    for (const auto& existing : pluginState.imported_media()) {
      retainedMediaBytes += existing.payload().size();
    }
    if (!padpilot::fitsAggregateByteBudget(retainedMediaBytes,
                                           managedBytes.size(),
                                           kMaxAggregateImportedMediaBytes)) {
      padpilot::appendBackendLog(
          "processor",
          "Skipped imported-media fallback beyond aggregate 32 MiB budget category=" + category +
              " contentId=" + contentId);
      return;
    }
    auto* entry = pluginState.add_imported_media();
    entry->set_module_id(moduleId);
    entry->set_category(category);
    entry->set_content_id(contentId);
    entry->set_source_name(sourceName);
    entry->set_managed_path(managedPath);
    entry->set_payload(managedBytes);
  };

  if (canonicalId == kRecutModuleId) {
    padpilot::recut::RecutModuleState recutState;
    if (padpilot::proto::parseRecutModuleState(payloadBytes, &recutState)) {
      append("sample", recutState.source_content_id(), recutState.source_name(),
             managedFileStore_.resolveManagedSamplePath(recutState.source_content_id(), recutState.source_name()));
    }
    return;
  }

  padpilot::fx::FxChainState fxState;
  if (!padpilot::proto::parseFxChainState(payloadBytes, &fxState)) {
    return;
  }
  for (const auto& chain : fxState.chains()) {
    for (const auto& node : chain.nodes()) {
      if (node.type() == padpilot::fx::FX_NODE_TYPE_CONVOLVER && node.has_convolver_config()) {
        const auto& config = node.convolver_config();
        append("impulse-response", config.ir_id(), config.ir_source_name(),
               managedFileStore_.resolveManagedImpulseResponsePath(config.ir_id(), config.ir_source_name()));
      }
    }
  }
}

bool PadPilotAudioProcessor::healManagedMediaForRecutState(const padpilot::bridge::ImportedMediaEntry& importedMedia,
                                                           std::string* modulePayloadBase64) const {
  if (modulePayloadBase64 == nullptr || canonicalizeModuleId(importedMedia.module_id()) != kRecutModuleId) {
    return false;
  }

  std::string payloadBytes;
  if (!padpilot::proto::base64ToBytes(*modulePayloadBase64, &payloadBytes)) {
    return false;
  }

  padpilot::recut::RecutModuleState recutState;
  if (!padpilot::proto::parseRecutModuleState(payloadBytes, &recutState)) {
    return false;
  }

  const auto sourceName = importedMedia.source_name().empty()
      ? (!recutState.source_name().empty() ? recutState.source_name() : juce::File(recutState.source_path()).getFileName().toStdString())
      : importedMedia.source_name();
  if (importedMedia.content_id().empty() || sourceName.empty() ||
      (!recutState.source_content_id().empty() &&
       importedMedia.content_id() != recutState.source_content_id()) ||
      (!recutState.source_name().empty() && sourceName != recutState.source_name())) {
    return false;
  }

  const auto managedPath = managedFileStore_.resolveManagedSamplePath(importedMedia.content_id(), sourceName);
  std::string errorMessage;
  if (!managedFileStore_.healManagedFile(managedPath, importedMedia.payload(), errorMessage)) {
    return false;
  }

  recutState.set_source_content_id(importedMedia.content_id());
  recutState.set_source_name(sourceName);
  recutState.set_source_path(managedPath);
  *modulePayloadBase64 = padpilot::proto::bytesToBase64(padpilot::proto::serializeRecutModuleState(recutState));
  return true;
}

bool PadPilotAudioProcessor::healManagedMediaForFxState(
    const padpilot::bridge::ImportedMediaEntry& importedMedia,
    std::string* modulePayloadBase64) const {
  if (modulePayloadBase64 == nullptr || canonicalizeModuleId(importedMedia.module_id()) != kFxModuleId) {
    return false;
  }
  std::string payloadBytes;
  padpilot::fx::FxChainState state;
  if (!padpilot::proto::base64ToBytes(*modulePayloadBase64, &payloadBytes) ||
      !padpilot::proto::parseFxChainState(payloadBytes, &state)) {
    return false;
  }
  bool matched = false;
  const auto managedPath = managedFileStore_.resolveManagedImpulseResponsePath(
      importedMedia.content_id(), importedMedia.source_name());
  for (auto& chain : *state.mutable_chains()) {
    for (auto& node : *chain.mutable_nodes()) {
      if (node.type() != padpilot::fx::FX_NODE_TYPE_CONVOLVER || !node.has_convolver_config()) {
        continue;
      }
      auto* config = node.mutable_convolver_config();
      if (config->ir_id() == importedMedia.content_id() &&
          config->ir_source_name() == importedMedia.source_name()) {
        config->set_ir_source_path(managedPath);
        matched = true;
      }
    }
  }
  std::string errorMessage;
  if (!matched || !managedFileStore_.healManagedFile(managedPath, importedMedia.payload(), errorMessage)) {
    return false;
  }
  *modulePayloadBase64 = padpilot::proto::bytesToBase64(padpilot::proto::serializeFxChainState(state));
  return true;
}

bool PadPilotAudioProcessor::restorePluginStateFromJson(const std::string& jsonState) {
  if (jsonState.empty() || jsonState.size() > kMaxPluginStateBytes) {
    return false;
  }
  const auto parsed = juce::JSON::parse(
      juce::String::fromUTF8(jsonState.data(), static_cast<int>(jsonState.size())));
  if (!parsed.isObject()) {
    return false;
  }

  const auto* rootObject = parsed.getDynamicObject();
  if (rootObject == nullptr) {
    return false;
  }

  const auto schemaVersionValue = rootObject->getProperty("schemaVersion");
  if (!schemaVersionValue.isVoid() && !schemaVersionValue.isInt() && !schemaVersionValue.isInt64()) {
    return false;
  }
  const auto schemaVersion = schemaVersionValue.isVoid()
                                 ? 0
                                 : static_cast<int>(static_cast<std::int64_t>(schemaVersionValue));
  if (schemaVersion < 0 || schemaVersion > kLegacyJsonStateSchemaVersion) {
    return false;
  }
  std::vector<padpilot::ModuleRecord> restoredModules;
  std::vector<padpilot::PresetRecord> restoredPresets;
  std::unordered_map<std::string, std::string> restoredModuleStates;
  std::unordered_map<std::string, std::string> restoredEditorViewStates;
  std::unordered_map<std::string, std::uint64_t> restoredRevisions;
  auto restoredControllerConfig = padpilot::createDefaultControllerConfig();
  std::array<AutomationBinding, kMacroSlotCount> restoredAutomationBindings {};
  std::unordered_set<std::string> restoredModuleIds;
  std::unordered_set<std::string> restoredPresetIds;
  const auto installedModules = moduleStore_.loadAllModules();
  std::size_t restoredPresetPayloadBytes = 0;
  std::size_t restoredModuleStateBytes = 0;
  std::size_t restoredEditorViewStateBytes = 0;

  auto selectedModuleId = canonicalizeModuleId(
      rootObject->getProperty("selectedModuleId").toString().toStdString());
  if (!padpilot::isValidModuleId(selectedModuleId)) {
    selectedModuleId.clear();
  }
  auto selectedPresetId = rootObject->getProperty("selectedPresetId").toString().toStdString();
  if (!selectedPresetId.empty() && !padpilot::isValidPresetId(selectedPresetId)) {
    selectedPresetId.clear();
  }

  if (const auto modulesVar = rootObject->getProperty("modules"); modulesVar.isArray()) {
    const auto* modulesArray = modulesVar.getArray();
    if (modulesArray == nullptr || modulesArray->size() > kMaxPersistedModules) {
      return false;
    }
    for (const auto& moduleVar : *modulesArray) {
      const auto* moduleObj = moduleVar.getDynamicObject();
      if (moduleObj == nullptr) {
        continue;
      }
      padpilot::ModuleRecord persistedReference;
      persistedReference.id = canonicalizeModuleId(moduleObj->getProperty("id").toString().toStdString());
      if (!padpilot::isValidModuleId(persistedReference.id) ||
          isLegacyRemovedBuiltInModuleId(persistedReference.id) ||
          !restoredModuleIds.insert(persistedReference.id).second) {
        continue;
      }
      const auto name = moduleObj->getProperty("name").toString().toStdString();
      const auto version = moduleObj->getProperty("version").toString().toStdString();
      if (name.size() <= kMaxDisplayNameBytes) {
        persistedReference.name = name;
      }
      if (version.size() <= kMaxModuleVersionBytes) {
        persistedReference.version = version;
      }
      auto module = moduleStore_.restorePersistedModuleReference(persistedReference, installedModules);
      if (module.id.empty()) {
        restoredModuleIds.erase(persistedReference.id);
        continue;
      }
      restoredModules.push_back(std::move(module));
    }
  }
  restoredModules = mergeInstalledModuleInventory(std::move(restoredModules), installedModules);
  restoredModuleIds.clear();
  for (const auto& module : restoredModules) {
    restoredModuleIds.insert(module.id);
  }

  if (const auto presetsVar = rootObject->getProperty("presets"); presetsVar.isArray()) {
    const auto* presetsArray = presetsVar.getArray();
    if (presetsArray == nullptr || presetsArray->size() > kMaxPersistedPresets) {
      return false;
    }
    for (const auto& presetVar : *presetsArray) {
      const auto* presetObj = presetVar.getDynamicObject();
      if (presetObj == nullptr) {
        continue;
      }
      padpilot::PresetRecord preset;
      preset.id = presetObj->getProperty("id").toString().toStdString();
      preset.moduleId = canonicalizeModuleId(presetObj->getProperty("moduleId").toString().toStdString());
      preset.name = presetObj->getProperty("name").toString().toStdString();
      const auto payload = presetObj->getProperty("payload");
      if (payload.isVoid()) {
        continue;
      }
      preset.payloadJson = juce::JSON::toString(payload, false).toStdString();
      if (!padpilot::isValidPresetId(preset.id) || !restoredModuleIds.contains(preset.moduleId) ||
          preset.name.empty() || preset.name.size() > kMaxDisplayNameBytes || preset.payloadJson.empty() ||
          preset.payloadJson.size() > kMaxModuleStateBytes ||
          preset.payloadJson.size() > kMaxAggregatePresetStateBytes - restoredPresetPayloadBytes ||
          !restoredPresetIds.insert(preset.id).second) {
        continue;
      }
      restoredPresetPayloadBytes += preset.payloadJson.size();
      restoredPresets.push_back(std::move(preset));
    }
  }

  if (const auto moduleStatesVar = rootObject->getProperty("moduleStates"); moduleStatesVar.isObject()) {
    const auto* moduleStatesObj = moduleStatesVar.getDynamicObject();
    if (moduleStatesObj == nullptr || moduleStatesObj->getProperties().size() > kMaxPersistedModuleStates) {
      return false;
    }
    for (const auto& property : moduleStatesObj->getProperties()) {
      const auto moduleId = canonicalizeModuleId(property.name.toString().toStdString());
      const auto payloadJson = juce::JSON::toString(property.value, false).toStdString();
      if (!restoredModuleIds.contains(moduleId) || moduleId == kAnalyzerModuleId || payloadJson.empty() ||
          payloadJson.size() > kMaxModuleStateBytes ||
          payloadJson.size() > kMaxAggregateModuleStateBytes - restoredModuleStateBytes ||
          restoredModuleStates.contains(moduleId)) {
        continue;
      }
      if (moduleId == kFxModuleId) {
        const auto migrated = padpilot::proto::migrateLegacyJsonToFxChainState(payloadJson, selectedPresetId);
        if (!isValidFxState(migrated)) {
          continue;
        }
        restoredRevisions[moduleId] = migrated.revision();
      }
      restoredModuleStates.emplace(moduleId, payloadJson);
      restoredModuleStateBytes += payloadJson.size();
    }
  }

  if (const auto editorViewStatesVar = rootObject->getProperty("editorViewStates"); editorViewStatesVar.isObject()) {
    const auto* editorViewStatesObj = editorViewStatesVar.getDynamicObject();
    if (editorViewStatesObj == nullptr ||
        editorViewStatesObj->getProperties().size() > kMaxPersistedEditorViewStates) {
      return false;
    }
    for (const auto& property : editorViewStatesObj->getProperties()) {
      const auto scopeId = canonicalizeModuleId(property.name.toString().toStdString());
      const auto payloadJson = juce::JSON::toString(property.value, false).toStdString();
      if (!padpilot::isValidModuleId(scopeId) || scopeId.size() > kMaxEditorScopeBytes ||
          (!isGlobalEditorViewScope(scopeId) && !restoredModuleIds.contains(scopeId)) ||
          payloadJson.empty() ||
          payloadJson.size() > kMaxEditorViewStateBytes ||
          payloadJson.size() > kMaxAggregateEditorViewStateBytes - restoredEditorViewStateBytes) {
        continue;
      }
      if (restoredEditorViewStates.emplace(scopeId, payloadJson).second) {
        restoredEditorViewStateBytes += payloadJson.size();
      }
    }
  }

  std::lock_guard<std::mutex> guard(stateMutex_);
  modules_ = std::move(restoredModules);
  presets_ = std::move(restoredPresets);
  moduleStatePayloadById_ = std::move(restoredModuleStates);
  editorViewStatePayloadByScope_ = std::move(restoredEditorViewStates);
  acceptedRevisionByModuleId_ = std::move(restoredRevisions);
  controllerConfig_ = std::move(restoredControllerConfig);
  setSelectedModuleLocked(selectedModuleId);
  selectedPresetId_ = selectedPresetId;
  if ((selectedModuleId_.empty() || isLegacyRemovedBuiltInModuleId(selectedModuleId_) ||
       findModuleRecordLocked(selectedModuleId_) == nullptr)) {
    setSelectedModuleLocked(modules_.empty() ? std::string {} : modules_.front().id);
  }
  if (!selectedPresetId_.empty()) {
    const auto selectedPreset = std::find_if(presets_.begin(), presets_.end(), [this](const auto& preset) {
      return preset.id == selectedPresetId_ && canonicalizeModuleId(preset.moduleId) == selectedModuleId_;
    });
    if (selectedPreset == presets_.end()) {
      selectedPresetId_.clear();
    }
  }
  analyzerStreamModuleId_.clear();
  analyzerStreamActive_.store(false, std::memory_order_release);
  analyzerCaptureActive_.store(false, std::memory_order_release);
  setRecutPlaybackOwner({}, false);
  inputThread_.setControllerConfig(controllerConfig_);
  hasRestoredState_ = true;
  lastAppliedFxState_.reset();
  fxRuntimeStateDirty_.store(false, std::memory_order_release);
  for (int slotIndex = 1; slotIndex <= kMacroSlotCount; ++slotIndex) {
    syncRealtimeAutomationBinding(slotIndex, automationBindings_[static_cast<std::size_t>(slotIndex - 1)]);
  }
  return true;
}
