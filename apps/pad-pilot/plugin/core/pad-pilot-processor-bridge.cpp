#include "core/pad-pilot-processor.h"

#include "core/pad-pilot-processor-internal.h"

using namespace padpilot::processor_detail;

namespace {

template <typename Frame>
void appendModuleSummaries(Frame& frame, const std::vector<padpilot::ModuleRecord>& modules) {
  for (const auto& module : modules) {
    if (isLegacyRemovedBuiltInModuleId(module.id)) {
      continue;
    }
    auto* summary = frame.add_modules();
    summary->set_id(std::string(padpilot::canonicalModuleId(module.id)));
    summary->set_name(module.id == kLegacyReverbModuleId ? "FX" : module.name);
    summary->set_version(module.version);
    for (const auto& capability : module.capabilities) {
      summary->add_capabilities(capability);
    }
    summary->set_load_status(module.loadStatus);
    summary->set_ui_entry_path(module.entryPath);
    summary->set_script_entry_path(module.scriptEntryPath);
    summary->set_load_error_message(module.loadErrorMessage);
    summary->set_expected_module_version(module.expectedModuleVersion);
    summary->set_resolved_module_version(module.resolvedModuleVersion);
  }
}

template <typename Frame>
void appendPresetSummaries(Frame& frame, const std::vector<padpilot::PresetRecord>& presets) {
  for (const auto& preset : presets) {
    auto* summary = frame.add_presets();
    summary->set_id(preset.id);
    summary->set_name(preset.name);
  }
}

}  // namespace

std::string PadPilotAudioProcessor::buildHostSyncFrameBase64() {
  reconcileFxStateFromParametersIfDirty();

  padpilot::bridge::HostSyncFrame frame;
  const auto controllerState = inputThread_.getControllerState();
  const auto inputDevices = inputThread_.getInputDevices();
  const auto analyzerState = readBoundedAnalyzerStateSnapshot(analyzerRuntime_);
  std::lock_guard<std::mutex> guard(stateMutex_);
  syncControllerConfigWithInputDevicesLocked(inputDevices);
  inputThread_.setControllerConfig(controllerConfig_);

  appendModuleSummaries(frame, modules_);

  appendPresetSummaries(frame, presets_);

  frame.set_selected_module_id(selectedModuleId_);
  frame.set_selected_preset_id(selectedPresetId_);
  if (selectedModuleId_ == kAnalyzerModuleId) {
    if (analyzerState.has_value()) {
      frame.set_active_module_state(analyzerState->payloadBytes);
      frame.set_accepted_revision(analyzerState->revision);
    }
  } else {
    frame.set_active_module_state(getModuleStateBytesLocked(selectedModuleId_));
    if (const auto revisionIt = acceptedRevisionByModuleId_.find(selectedModuleId_);
        revisionIt != acceptedRevisionByModuleId_.end()) {
      frame.set_accepted_revision(revisionIt->second);
    }
  }
  for (const auto& [scopeId, payloadJson] : editorViewStatePayloadByScope_) {
    auto* entry = frame.add_editor_view_states();
    entry->set_scope_id(scopeId);
    entry->set_payload_json(payloadJson);
  }

  frame.set_controller_connected(controllerState.connected);
  frame.set_controller_frame_index(controllerState.frameIndex);
  for (const auto axis : controllerState.axes) {
    frame.add_controller_axes(axis);
  }
  for (const auto button : controllerState.buttons) {
    frame.add_controller_buttons(button);
  }

  for (const auto& inputDevice : inputDevices) {
    if (!inputDevice.connected) {
      continue;
    }

    auto* device = frame.add_input_devices();
    device->set_device_id(std::string(padpilot::cStringView(inputDevice.deviceId)));
    device->set_runtime_device_id(std::string(padpilot::cStringView(inputDevice.runtimeDeviceId)));
    device->set_hardware_id(std::string(padpilot::cStringView(inputDevice.hardwareId)));
    device->set_device_kind(inputDevice.kind == padpilot::InputDeviceKind::gamepad
                                ? padpilot::bridge::INPUT_DEVICE_KIND_GAMEPAD
                                : padpilot::bridge::INPUT_DEVICE_KIND_UNKNOWN);
    device->set_display_name(std::string(padpilot::cStringView(inputDevice.displayName)));
    device->set_connected(inputDevice.connected);
    device->set_frame_index(inputDevice.frameIndex);
    device->set_detected_layout_kind(padpilot::toProtoControllerLayoutKind(inputDevice.detectedLayoutKind));
    device->set_active_layout_kind(padpilot::toProtoControllerLayoutKind(inputDevice.activeLayoutKind));
    for (const auto axis : inputDevice.axes) {
      device->add_axes(axis);
    }
    for (const auto button : inputDevice.buttons) {
      device->add_buttons(button);
    }
    for (const auto axis : inputDevice.rawAxes) {
      device->add_raw_axes(axis);
    }
    for (const auto button : inputDevice.rawButtons) {
      device->add_raw_buttons(button);
    }
  }
  padpilot::populateProtoControllerConfig(controllerConfig_, frame.mutable_controller_config());

  frame.set_project_bpm(lastKnownProjectBpm_.load(std::memory_order_acquire));

  std::string bytes;
  if (!frame.SerializeToString(&bytes) ||
      bytes.size() > padpilot::state_wire_limits::kMaximumHostSyncFrameBytes) {
    padpilot::appendBackendLog(
        "processor",
        "HostSyncFrame serialization rejected bytes=" + std::to_string(bytes.size()));
    return {};
  }
  return padpilot::proto::bytesToBase64(bytes);
}

std::string PadPilotAudioProcessor::buildNavigationFrameBase64() {
  padpilot::bridge::NavigationFrame frame;
  std::lock_guard<std::mutex> guard(stateMutex_);

  appendModuleSummaries(frame, modules_);

  appendPresetSummaries(frame, presets_);

  frame.set_selected_module_id(selectedModuleId_);
  frame.set_selected_preset_id(selectedPresetId_);

  std::string bytes;
  frame.SerializeToString(&bytes);
  return padpilot::proto::bytesToBase64(bytes);
}

std::string PadPilotAudioProcessor::buildActiveModuleStateFrameBase64() {
  reconcileFxStateFromParametersIfDirty();

  padpilot::bridge::ActiveModuleStateFrame frame;
  const auto analyzerState = readBoundedAnalyzerStateSnapshot(analyzerRuntime_);
  std::lock_guard<std::mutex> guard(stateMutex_);
  frame.set_module_id(selectedModuleId_);
  if (selectedModuleId_ == kAnalyzerModuleId) {
    if (analyzerState.has_value()) {
      frame.set_payload(analyzerState->payloadBytes);
      frame.set_accepted_revision(analyzerState->revision);
    }
  } else {
    frame.set_payload(getModuleStateBytesLocked(selectedModuleId_));
    if (const auto revisionIt = acceptedRevisionByModuleId_.find(selectedModuleId_);
        revisionIt != acceptedRevisionByModuleId_.end()) {
      frame.set_accepted_revision(revisionIt->second);
    }
  }
  frame.set_project_bpm(lastKnownProjectBpm_.load(std::memory_order_acquire));

  std::string bytes;
  frame.SerializeToString(&bytes);
  return padpilot::proto::bytesToBase64(bytes);
}

std::string PadPilotAudioProcessor::buildInputStateFrameBase64() const {
  padpilot::bridge::InputStateFrame frame;
  const auto controllerState = inputThread_.getControllerState();
  const auto inputDevices = inputThread_.getInputDevices();
  frame.set_controller_connected(controllerState.connected);
  frame.set_controller_frame_index(controllerState.frameIndex);
  for (const auto axis : controllerState.axes) {
    frame.add_controller_axes(axis);
  }
  for (const auto button : controllerState.buttons) {
    frame.add_controller_buttons(button);
  }
  for (const auto& inputDevice : inputDevices) {
    if (!inputDevice.connected) {
      continue;
    }

    auto* device = frame.add_input_devices();
    device->set_device_id(std::string(padpilot::cStringView(inputDevice.deviceId)));
    device->set_runtime_device_id(std::string(padpilot::cStringView(inputDevice.runtimeDeviceId)));
    device->set_hardware_id(std::string(padpilot::cStringView(inputDevice.hardwareId)));
    device->set_device_kind(inputDevice.kind == padpilot::InputDeviceKind::gamepad
                                ? padpilot::bridge::INPUT_DEVICE_KIND_GAMEPAD
                                : padpilot::bridge::INPUT_DEVICE_KIND_UNKNOWN);
    device->set_display_name(std::string(padpilot::cStringView(inputDevice.displayName)));
    device->set_connected(inputDevice.connected);
    device->set_frame_index(inputDevice.frameIndex);
    device->set_detected_layout_kind(padpilot::toProtoControllerLayoutKind(inputDevice.detectedLayoutKind));
    device->set_active_layout_kind(padpilot::toProtoControllerLayoutKind(inputDevice.activeLayoutKind));
    for (const auto axis : inputDevice.axes) {
      device->add_axes(axis);
    }
    for (const auto button : inputDevice.buttons) {
      device->add_buttons(button);
    }
    for (const auto axis : inputDevice.rawAxes) {
      device->add_raw_axes(axis);
    }
    for (const auto button : inputDevice.rawButtons) {
      device->add_raw_buttons(button);
    }
  }
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    padpilot::populateProtoControllerConfig(controllerConfig_, frame.mutable_controller_config());
  }

  std::string bytes;
  frame.SerializeToString(&bytes);
  return padpilot::proto::bytesToBase64(bytes);
}

std::string PadPilotAudioProcessor::buildVisualizerFrameBase64() {
  reconcileFxStateFromParametersIfDirty();
  padpilot::fx::FxChainState state;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto bytes = getModuleStateBytesLocked(kFxModuleId);
    if (!bytes.empty()) {
      padpilot::proto::parseFxChainState(bytes, &state);
    }
  }

  if (state.schema_version() == 0) {
    state = padpilot::proto::createDefaultFxChainState();
  }

  return padpilot::proto::buildVisualizerFrameBase64(
      state,
      convolverGraph_.getTimingSnapshot(),
      visualizerSequence_.fetch_add(1, std::memory_order_relaxed) + 1);
}

std::string PadPilotAudioProcessor::buildAnalyzerStateBase64() {
  if (!analyzerStreamActive_.load(std::memory_order_acquire)) {
    return {};
  }
  return analyzerRuntime_.getStateBase64();
}

std::string PadPilotAudioProcessor::buildAnalyzerFrameBase64() {
  if (!analyzerStreamActive_.load(std::memory_order_acquire)) {
    return {};
  }
  return analyzerRuntime_.buildFrameBase64();
}

std::string PadPilotAudioProcessor::buildCapabilityFrameEnvelopeBase64() {
  std::string capability;
  std::string handle;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (!capabilityStreamActive_.load(std::memory_order_relaxed) || capabilityStreamHandle_.empty()) {
      return {};
    }
    capability = capabilityStreamKind_;
    handle = capabilityStreamHandle_;
  }

  padpilot::capability::CapabilityFrameEnvelope envelope;
  envelope.set_capability(capability);
  envelope.set_handle(handle);

  if (capability == "sample-analysis") {
    const auto payloadBase64 = recutRuntime_.buildSampleEditorFrameBase64();
    if (payloadBase64.empty()) {
      return {};
    }

    std::string payloadBytes;
    if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes)) {
      return {};
    }

    envelope.set_payload_type("SampleEditorFrame");
    envelope.set_payload(payloadBytes);
    if (const auto current = recutRuntime_.snapshot()) {
      envelope.set_sequence(current->state.revision());
    }
    return padpilot::proto::buildCapabilityFrameEnvelopeBase64(envelope);
  }

  if (capability == "analyzer-feed") {
    const auto payloadBase64 = buildAnalyzerFrameBase64();
    if (payloadBase64.empty()) {
      return {};
    }

    std::string payloadBytes;
    if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes)) {
      return {};
    }

    envelope.set_payload_type("AnalyzerFrame");
    envelope.set_payload(payloadBytes);
    envelope.set_sequence(getAnalyzerStateRevision());
    return padpilot::proto::buildCapabilityFrameEnvelopeBase64(envelope);
  }

  if (capability == "fx-visualizer") {
    const auto payloadBase64 = buildVisualizerFrameBase64();
    if (payloadBase64.empty()) {
      return {};
    }

    std::string payloadBytes;
    if (!padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes)) {
      return {};
    }

    envelope.set_payload_type("VisualizerFrame");
    envelope.set_payload(payloadBytes);
    envelope.set_sequence(visualizerSequence_.load(std::memory_order_relaxed));
    return padpilot::proto::buildCapabilityFrameEnvelopeBase64(envelope);
  }

  return {};
}

std::optional<std::string> PadPilotAudioProcessor::resolveModuleWebResourcePath(const std::string& webPath) const {
  return moduleStore_.resolveWebResourcePath(webPath);
}

std::string PadPilotAudioProcessor::buildSelectedModuleCapabilityHandle(const std::string& capability,
                                                                        const std::string& slot) const {
  if (capability.empty() || capability.size() > kMaxCapabilityNameBytes ||
      slot.empty() || slot.size() > kMaxCapabilitySlotBytes || slot.find("::") != std::string::npos) {
    return {};
  }
  std::lock_guard<std::mutex> guard(stateMutex_);
  if (selectedModuleId_.empty()) {
    return {};
  }
  const auto* module = findModuleRecordLocked(selectedModuleId_);
  if (module == nullptr || module->loadStatus != "ready") {
    return {};
  }
  const auto supportsCapability = std::find(module->capabilities.begin(),
                                            module->capabilities.end(),
                                            capability) != module->capabilities.end();
  if (!supportsCapability) {
    return {};
  }
  return selectedModuleId_ + "::" + capability + "::" + slot;
}

std::uint64_t PadPilotAudioProcessor::getAnalyzerStateRevision() const {
  if (!analyzerStreamActive_.load(std::memory_order_acquire)) {
    return 0;
  }
  return analyzerRuntime_.getRevision();
}

void PadPilotAudioProcessor::openCapabilityStream(const std::string& capability, const std::string& handle) {
  if (capability.empty() || capability.size() > kMaxCapabilityNameBytes ||
      handle.empty() || handle.size() > kMaxCapabilityHandleBytes) {
    return;
  }
  if (capability != "sample-analysis" && capability != "analyzer-feed" && capability != "fx-visualizer") {
    padpilot::appendBackendLog("processor", "openCapabilityStream rejected unsupported capability=" + capability + " handle=" + handle);
    return;
  }

  const auto parsedHandle = padpilot::parseCapabilityHandle(handle);
  if (!parsedHandle.has_value() || parsedHandle->capability != capability) {
    padpilot::appendBackendLog("processor", "openCapabilityStream rejected invalid handle capability=" + capability + " handle=" + handle);
    return;
  }
  const auto canonicalModuleId = canonicalizeModuleId(parsedHandle->moduleInstanceId);
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto* module = findModuleRecordLocked(canonicalModuleId);
  const auto capabilityDeclared = module != nullptr && module->loadStatus == "ready" &&
      std::find(module->capabilities.begin(), module->capabilities.end(), capability) != module->capabilities.end();
  if (canonicalModuleId.empty() || canonicalModuleId != selectedModuleId_ || !capabilityDeclared) {
    padpilot::appendBackendLog(
        "processor",
        "openCapabilityStream rejected capability=" + capability +
            " handle=" + handle +
            " canonicalModuleId=" + canonicalModuleId +
            " selectedModuleId=" + selectedModuleId_);
    return;
  }
  if (capabilityStreamActive_.load(std::memory_order_acquire) &&
      capabilityStreamKind_ == capability && capabilityStreamHandle_ == handle) {
    return;
  }
  if (capabilityStreamKind_ == "sample-analysis") {
    recutRuntime_.setStreamActive(false);
  } else if (capabilityStreamKind_ == "analyzer-feed") {
    analyzerStreamModuleId_.clear();
    analyzerStreamActive_.store(false, std::memory_order_release);
    if (!analyzerCaptureActive_.load(std::memory_order_acquire)) {
      analyzerRuntime_.setMonitoringEnabled(false);
    }
  }
  capabilityStreamKind_ = capability;
  capabilityStreamHandle_ = handle;
  capabilityStreamActive_.store(true, std::memory_order_release);
  padpilot::appendBackendLog(
      "processor",
      "openCapabilityStream accepted capability=" + capability +
          " handle=" + handle +
          " selectedModuleId=" + selectedModuleId_);
  if (capability == "sample-analysis") {
    recutRuntime_.setStreamActive(true);
    return;
  }
  if (capability == "fx-visualizer") {
    return;
  }

  analyzerStreamModuleId_ = canonicalModuleId;
  analyzerStreamActive_.store(true, std::memory_order_release);
  analyzerRuntime_.setMonitoringEnabled(true);
}

void PadPilotAudioProcessor::closeCapabilityStream(const std::string& capability, const std::string& handle) {
  if (capability.empty() || capability.size() > kMaxCapabilityNameBytes ||
      handle.empty() || handle.size() > kMaxCapabilityHandleBytes) {
    return;
  }
  if (capability != "sample-analysis" && capability != "analyzer-feed" && capability != "fx-visualizer") {
    padpilot::appendBackendLog("processor", "closeCapabilityStream rejected unsupported capability=" + capability + " handle=" + handle);
    return;
  }

  const auto parsedHandle = padpilot::parseCapabilityHandle(handle);
  if (!parsedHandle.has_value() || parsedHandle->capability != capability) {
    return;
  }
  const auto canonicalModuleId = canonicalizeModuleId(parsedHandle->moduleInstanceId);
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto* module = findModuleRecordLocked(canonicalModuleId);
  const auto capabilityDeclared = module != nullptr && module->loadStatus == "ready" &&
      std::find(module->capabilities.begin(), module->capabilities.end(), capability) != module->capabilities.end();
  if (canonicalModuleId.empty() || canonicalModuleId != selectedModuleId_ || !capabilityDeclared) {
    return;
  }
  if (!capabilityStreamActive_.load(std::memory_order_acquire) || capabilityStreamKind_ != capability) {
    return;
  }
  if (capabilityStreamHandle_ != handle) {
    padpilot::appendBackendLog(
        "processor",
        "closeCapabilityStream ignored capability=" + capability +
            " handle=" + handle +
            " activeHandle=" + capabilityStreamHandle_);
    return;
  }
  padpilot::appendBackendLog(
      "processor",
      "closeCapabilityStream capability=" + capability +
          " handle=" + handle +
          " selectedModuleId=" + selectedModuleId_);
  capabilityStreamKind_.clear();
  capabilityStreamHandle_.clear();
  capabilityStreamActive_.store(false, std::memory_order_release);
  if (capability == "sample-analysis") {
    recutRuntime_.setStreamActive(false);
    return;
  }
  if (capability == "fx-visualizer") {
    return;
  }

  analyzerStreamModuleId_.clear();
  analyzerStreamActive_.store(false, std::memory_order_release);
  if (!analyzerCaptureActive_.load(std::memory_order_acquire)) {
    analyzerRuntime_.setMonitoringEnabled(false);
  }
}

bool PadPilotAudioProcessor::sendCapabilityIntent(const std::string& capability,
                                                  const std::string& handle,
                                                  const std::string& action,
                                                  const std::string& payloadBase64) {
  if (capability.empty() || capability.size() > kMaxCapabilityNameBytes ||
      handle.empty() || handle.size() > kMaxCapabilityHandleBytes ||
      action.empty() || action.size() > kMaxCapabilityActionBytes) {
    return false;
  }
  const auto maxPayloadBase64Chars = capability == "midi-export" && action == "begin-drag-bytes"
                                         ? kMaxMidiDragPayloadBase64Chars
                                         : kMaxModuleStateBase64Chars;
  if (payloadBase64.size() > maxPayloadBase64Chars) {
    return false;
  }
  if (capability == "keyboard-output") {
    if (action != "execute" || payloadBase64.empty() ||
        payloadBase64.size() > kMaxKeyboardOutputPayloadBase64Chars) {
      return false;
    }
  }
  if (capability == "midi-output") {
    if ((action != "note-on" && action != "note-off" && action != "cc") ||
        payloadBase64.empty() || payloadBase64.size() > kMaxMidiOutputPayloadBase64Chars) {
      return false;
    }
  }
  if (capability == "module-state") {
    const auto validComparisonAction = action == "capture-a" || action == "capture-b" ||
                                       action == "recall-a" || action == "recall-b" ||
                                       action == "toggle";
    if (!validComparisonAction || !payloadBase64.empty()) {
      return false;
    }
  }
  padpilot::appendBackendLog(
      "processor",
      "sendCapabilityIntent capability=" + capability +
          " action=" + action +
          " handle=" + handle +
          " payloadLength=" + std::to_string(payloadBase64.size()));
  const auto parsedHandle = padpilot::parseCapabilityHandle(handle);
  if (!parsedHandle.has_value()) {
    padpilot::appendBackendLog("processor", "sendCapabilityIntent rejected invalid handle");
    return false;
  }

  const auto canonicalModuleId = canonicalizeModuleId(parsedHandle->moduleInstanceId);
  if (canonicalModuleId.empty() || parsedHandle->capability != capability) {
    padpilot::appendBackendLog("processor", "sendCapabilityIntent rejected mismatched capability handle");
    return false;
  }

  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto* module = findModuleRecordLocked(canonicalModuleId);
    const auto capabilityDeclared = module != nullptr && module->loadStatus == "ready" &&
        std::find(module->capabilities.begin(), module->capabilities.end(), capability) != module->capabilities.end();
    if (canonicalModuleId != selectedModuleId_ || !capabilityDeclared) {
      padpilot::appendBackendLog("processor", "sendCapabilityIntent rejected inactive or undeclared capability");
      return false;
    }
  }

  std::string payloadBytes;
  if (!payloadBase64.empty() && !padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes)) {
    padpilot::appendBackendLog("processor", "sendCapabilityIntent failed base64 decode");
    return false;
  }

  if (capability == "midi-export" &&
      (action == "begin-drag" || action == "save-file")) {
    return payloadBytes.empty();
  }

  if (capability == "midi-export" && action == "begin-drag-bytes") {
    if (payloadBytes.empty() || payloadBytes.size() > kMaxMidiDragJsonBytes) {
      return false;
    }
    const auto payload = juce::JSON::parse(
        juce::String::fromUTF8(payloadBytes.data(), static_cast<int>(payloadBytes.size())));
    const auto* object = payload.getDynamicObject();
    if (object == nullptr) {
      return false;
    }
    const auto filenameValue = object->getProperty("filename");
    const auto midiBase64Value = object->getProperty("midiBase64");
    if (!filenameValue.isString() || !midiBase64Value.isString()) {
      return false;
    }
    const auto filename = filenameValue.toString().toStdString();
    const auto midiBase64 = midiBase64Value.toString().toStdString();
    if (!isSafePersistedKey(filename, kMaxMidiExportFilenameBytes) ||
        midiBase64.empty() || midiBase64.size() > kMaxMidiExportBase64Chars) {
      return false;
    }
    std::string midiBytes;
    if (!padpilot::proto::base64ToBytes(midiBase64, &midiBytes) ||
        midiBytes.empty() || midiBytes.size() > kMaxMidiExportBytes) {
      return false;
    }
    juce::MemoryInputStream midiInput(midiBytes.data(), midiBytes.size(), false);
    juce::MidiFile midiFile;
    return midiFile.readFrom(midiInput);
  }

  if (capability == "module-state" && payloadBytes.empty()) {
    return handleModuleStateComparisonIntent(canonicalModuleId, action);
  }

  if (capability == "midi-output") {
    if (payloadBytes.empty() || payloadBytes.size() > kMaxMidiOutputPayloadBytes) {
      return false;
    }
    const auto payload = juce::JSON::parse(
        juce::String::fromUTF8(payloadBytes.data(), static_cast<int>(payloadBytes.size())));
    const auto* object = payload.getDynamicObject();
    if (object == nullptr) {
      return false;
    }
    const auto channel = padpilot::readBoundedJsonUInt(object->getProperty("channel"), 16U);
    if (!channel.has_value() || *channel == 0U) {
      return false;
    }

    padpilot::MidiOutputCommand command {};
    command.channel = static_cast<std::uint8_t>(*channel);
    const auto sampleOffsetValue = object->getProperty("sampleOffset");
    if (!sampleOffsetValue.isVoid()) {
      const auto sampleOffset = padpilot::readBoundedJsonUInt(sampleOffsetValue, 1'048'575U);
      if (!sampleOffset.has_value()) {
        return false;
      }
      command.sampleOffset = *sampleOffset;
    }
    if (action == "cc") {
      const auto controller = padpilot::readBoundedJsonUInt(object->getProperty("controller"), 127U);
      const auto value = padpilot::readBoundedJsonUInt(object->getProperty("value"), 127U);
      if (!controller.has_value() || !value.has_value()) {
        return false;
      }
      command.type = padpilot::MidiOutputCommandType::controlChange;
      command.data1 = static_cast<std::uint8_t>(*controller);
      command.data2 = static_cast<std::uint8_t>(*value);
    } else {
      const auto note = padpilot::readBoundedJsonUInt(object->getProperty("note"), 127U);
      const auto velocity = padpilot::readBoundedJsonUInt(object->getProperty("velocity"), 127U);
      if (!note.has_value() || !velocity.has_value() ||
          (action == "note-on" && *velocity == 0U)) {
        return false;
      }
      command.type = action == "note-on"
                         ? padpilot::MidiOutputCommandType::noteOn
                         : padpilot::MidiOutputCommandType::noteOff;
      command.data1 = static_cast<std::uint8_t>(*note);
      command.data2 = static_cast<std::uint8_t>(*velocity);
    }
    return midiOutputRuntime_.enqueue(command);
  }

  if (capability == "host-tempo" && action == "set") {
    const auto bpm = parseFiniteFloat(payloadBytes);
    if (!bpm.has_value() || *bpm < 20.0f || *bpm > 320.0f) {
      return false;
    }
    requestHostTempo(*bpm);
    return true;
  }

  if (capability == "keyboard-output" && action == "execute") {
    if (payloadBytes.empty() || payloadBytes.size() > kMaxKeyboardOutputPayloadBytes) {
      return false;
    }
    const auto payload = juce::JSON::parse(
        juce::String::fromUTF8(payloadBytes.data(), static_cast<int>(payloadBytes.size())));
    const auto* shortcutArray = payload.getArray();
    if (shortcutArray == nullptr || shortcutArray->isEmpty() ||
        shortcutArray->size() > static_cast<int>(kMaxKeyboardOutputShortcuts)) {
      return false;
    }

    std::vector<std::string> shortcuts;
    shortcuts.reserve(static_cast<std::size_t>(shortcutArray->size()));
    for (const auto& shortcutValue : *shortcutArray) {
      if (!shortcutValue.isString()) {
        return false;
      }
      auto shortcut = shortcutValue.toString().toStdString();
      if (!isSafePersistedKey(shortcut, kMaxKeyboardOutputShortcutBytes)) {
        return false;
      }
      shortcuts.push_back(std::move(shortcut));
    }
    return executeHotkeyMacro(canonicalModuleId, shortcuts);
  }

  if (capability == "sample-source" && action == "load-file") {
    padpilot::capability::SampleSourceLoadRequest request;
    if (!padpilot::preflightSampleSourceLoadRequestWire(payloadBytes) ||
        !request.ParseFromString(payloadBytes)) {
      padpilot::appendBackendLog("processor", "sample-source load-file parse failed");
      return false;
    }
    const auto loaded = recutRuntime_.loadSource(request);
    setRecutPlaybackOwner(canonicalModuleId, loaded);
    padpilot::appendBackendLog(
        "processor",
        "sample-source load-file result loaded=" + std::string(loaded ? "true" : "false") +
            " sourcePath=" + request.source_path() +
            " sourceName=" + request.source_name() +
            " sourceContentId=" + request.source_content_id());
    return loaded;
  }

  if (capability == "sample-analysis" && action == "request-analysis") {
    padpilot::capability::SampleAnalysisRequest request;
    if (!padpilot::preflightSampleAnalysisRequestWire(payloadBytes) ||
        !request.ParseFromString(payloadBytes)) {
      padpilot::appendBackendLog("processor", "sample-analysis request-analysis parse failed");
      return false;
    }
    const auto accepted = recutRuntime_.requestAnalysis(request);
    padpilot::appendBackendLog(
        "processor",
        "sample-analysis request-analysis accepted=" + std::string(accepted ? "true" : "false"));
    return accepted;
  }

  if (capability == "slice-playback" && action == "apply-state") {
    padpilot::capability::SlicePlaybackState state;
    if (!padpilot::preflightSlicePlaybackStateWire(payloadBytes) ||
        !state.ParseFromString(payloadBytes)) {
      return false;
    }
    if (!recutRuntime_.applyPlaybackState(state)) {
      return false;
    }
    setRecutPlaybackOwner(canonicalModuleId);
    return true;
  }

  if (capability == "slice-playback" && action == "trigger-pad") {
    padpilot::capability::SlicePlaybackTrigger trigger;
    if (!padpilot::preflightSlicePlaybackTriggerWire(payloadBytes) ||
        !trigger.ParseFromString(payloadBytes)) {
      return false;
    }
    return recutRuntime_.triggerPlayback(trigger);
  }

  if (capability == "slice-playback" && action == "edit-slice") {
    padpilot::capability::SliceEditIntent intent;
    if (!padpilot::preflightSliceEditIntentWire(payloadBytes) ||
        !intent.ParseFromString(payloadBytes)) {
      return false;
    }
    return recutRuntime_.editSlice(intent);
  }

  if (capability == "haptics" && action == "pulse") {
    padpilot::capability::HapticIntent intent;
    if (!padpilot::preflightHapticIntentWire(payloadBytes) ||
        !intent.ParseFromString(payloadBytes) || !std::isfinite(intent.low()) ||
        !std::isfinite(intent.high()) || intent.low() < 0.0f || intent.low() > 1.0f ||
        intent.high() < 0.0f || intent.high() > 1.0f || intent.duration_ms() == 0U ||
        intent.duration_ms() > kMaxHapticDurationMs) {
      return false;
    }
    return hapticCommandQueue_.push({
        padpilot::kPrimaryHapticDeviceSlot,
        intent.low(),
        intent.high(),
        intent.duration_ms(),
    });
  }

  if (capability == "analyzer-session") {
    if (action == "start-capture") {
      const auto append = payloadBytes == "append";
      startAnalyzerCapture(append);
      return true;
    }
    if (action == "stop-capture") {
      stopAnalyzerCapture();
      return true;
    }
    if (action == "set-tuning-hz") {
      const auto tuningHz = parseFiniteFloat(payloadBytes);
      if (!tuningHz.has_value()) {
        return false;
      }
      setAnalyzerTuningHz(*tuningHz);
      return true;
    }
    if (action == "set-detection-sensitivity") {
      const auto sensitivity = parseFiniteFloat(payloadBytes);
      if (!sensitivity.has_value()) {
        return false;
      }
      setAnalyzerDetectionSensitivity(*sensitivity);
      return true;
    }
    if (action == "correct-note") {
      const auto correction = parseAnalyzerNoteCorrection(payloadBytes);
      return correction.has_value() &&
             correctAnalyzerNote(correction->eventId, correction->midiNote);
    }
    if (action == "reset-note-correction") {
      const auto eventId = parseAnalyzerEventId(payloadBytes);
      return eventId.has_value() && resetAnalyzerNoteCorrection(*eventId);
    }
  }

  if (capability == "fx-graph") {
    if (action == "set-preview-bypass") {
      if (payloadBytes != "0" && payloadBytes != "1") {
        return false;
      }
      convolverGraph_.requestStructuralBypass(payloadBytes == "1");
      return true;
    }
    if (action == "set-master-wet-dry") {
      const auto wet = parseFiniteFloat(payloadBytes);
      if (!wet.has_value() || *wet < 0.0f || *wet > 1.0f) {
        return false;
      }
      padpilot::AudioCommand command {};
      command.type = padpilot::AudioCommandType::setMasterWetDry;
      command.value = *wet;
      return queueAudioCommand(command);
    }
    if (action == "apply-state") {
      padpilot::fx::FxChainState state;
      if (!padpilot::proto::parseFxChainState(payloadBytes, &state)) {
        return false;
      }
      return setModuleStatePayloadBase64(canonicalModuleId,
                                         padpilot::proto::bytesToBase64(payloadBytes),
                                         state.revision());
    }
    if (action == "create-preset" || action == "save-preset") {
      padpilot::bridge::PresetSaveRequest request;
      if (!padpilot::preflightPresetSaveRequestWire(payloadBytes) ||
          !request.ParseFromString(payloadBytes)) {
        return false;
      }
      return createAndSavePresetProto(request);
    }
  }

  if (capability == "automation") {
    if (action == "focus-target") {
      if (payloadBytes.empty() || payloadBytes.size() > kMaxAutomationJsonBytes) {
        return false;
      }
      const auto parsed = juce::JSON::parse(juce::String::fromUTF8(payloadBytes.data(),
                                                                   static_cast<int>(payloadBytes.size())));
      const auto* object = parsed.getDynamicObject();
      if (object == nullptr) {
        return false;
      }
      const auto slotIndex = padpilot::readBoundedJsonUInt(
          object->getProperty("slotIndex"), static_cast<std::uint32_t>(kMacroSlotCount));
      const auto chainId = padpilot::readBoundedJsonUInt(object->getProperty("chainId"), 0xffU);
      const auto nodeId = padpilot::readBoundedJsonUInt(object->getProperty("nodeId"), 0xffU);
      const auto parameterId = padpilot::readBoundedJsonUInt(object->getProperty("parameterId"), 31U);
      const auto minValue = padpilot::readBoundedJsonFloat(
          object->getProperty("minValue"), -kMaxAutomationValueMagnitude, kMaxAutomationValueMagnitude);
      const auto maxValue = padpilot::readBoundedJsonFloat(
          object->getProperty("maxValue"), -kMaxAutomationValueMagnitude, kMaxAutomationValueMagnitude);
      const auto moduleIdValue = object->getProperty("moduleId");
      const auto controlKeyValue = object->getProperty("controlKey");
      const auto displayNameValue = object->getProperty("displayName");
      const auto valueKindValue = object->getProperty("valueKind");
      const auto targetKindValue = object->getProperty("targetKind");
      if (!slotIndex.has_value() || *slotIndex == 0U || !chainId.has_value() ||
          !nodeId.has_value() || !parameterId.has_value() || !minValue.has_value() ||
          !maxValue.has_value() || !moduleIdValue.isString() || !controlKeyValue.isString() ||
          !displayNameValue.isString() || !valueKindValue.isString() || !targetKindValue.isString()) {
        return false;
      }

      AutomationBinding binding;
      binding.slotIndex = static_cast<int>(*slotIndex);
      binding.moduleId = canonicalizeModuleId(moduleIdValue.toString().toStdString());
      binding.chainId = *chainId;
      binding.nodeId = *nodeId;
      binding.controlKey = controlKeyValue.toString().toStdString();
      binding.displayName = displayNameValue.toString().toStdString();
      if (!isSafePersistedKey(binding.controlKey, 128U) ||
          !isSafePersistedKey(binding.displayName, kMaxDisplayNameBytes)) {
        return false;
      }
      const auto valueKind = valueKindValue.toString();
      if (valueKind != "boolean" && valueKind != "float") {
        return false;
      }
      binding.valueKind = valueKind == "boolean"
                              ? AutomationValueKind::booleanValue
                              : AutomationValueKind::floatValue;
      const auto targetKind = targetKindValue.toString();
      if (targetKind == "masterInputGain") binding.targetKind = AutomationTargetKind::masterInputGain;
      else if (targetKind == "masterWetDry") binding.targetKind = AutomationTargetKind::masterWetDry;
      else if (targetKind == "masterOutputGain") binding.targetKind = AutomationTargetKind::masterOutputGain;
      else if (targetKind == "fxChainMix") binding.targetKind = AutomationTargetKind::fxChainMix;
      else if (targetKind == "fxNodeMix") binding.targetKind = AutomationTargetKind::fxNodeMix;
      else if (targetKind == "fxNodeParamFloat") binding.targetKind = AutomationTargetKind::fxNodeParamFloat;
      else return false;
      binding.parameterId = *parameterId;
      binding.minValue = *minValue;
      binding.maxValue = *maxValue;
      if (binding.moduleId != canonicalModuleId) {
        return false;
      }
      return focusAutomationTarget(binding);
    }
    if (action == "begin-touch") {
      return padpilot::isValidAutomationParameterId(payloadBytes) &&
             beginAutomationTouch(payloadBytes);
    }
    if (action == "update-touch") {
      if (payloadBytes.empty() || payloadBytes.size() > kMaxAutomationJsonBytes) {
        return false;
      }
      const auto parsed = juce::JSON::parse(juce::String::fromUTF8(payloadBytes.data(),
                                                                   static_cast<int>(payloadBytes.size())));
      const auto* object = parsed.getDynamicObject();
      if (object == nullptr) {
        return false;
      }
      const auto normalizedValue = padpilot::readBoundedJsonFloat(
          object->getProperty("normalizedValue"), 0.0f, 1.0f);
      const auto parameterIdValue = object->getProperty("parameterId");
      if (!normalizedValue.has_value() || !parameterIdValue.isString()) {
        return false;
      }
      const auto parameterId = parameterIdValue.toString().toStdString();
      return padpilot::isValidAutomationParameterId(parameterId) &&
             updateAutomationTouch(parameterId, *normalizedValue);
    }
    if (action == "end-touch") {
      return padpilot::isValidAutomationParameterId(payloadBytes) &&
             endAutomationTouch(payloadBytes);
    }
  }

  return false;
}

bool PadPilotAudioProcessor::handleModuleStateComparisonIntent(
    const std::string& moduleId,
    const std::string& action) {
  const auto captureSlot = action == "capture-a" ? 0 : action == "capture-b" ? 1 : -1;
  if (captureSlot >= 0) {
    std::lock_guard<std::mutex> guard(stateMutex_);
    if (selectedModuleId_ != moduleId) {
      return false;
    }
    auto payload = getModuleStatePayloadLocked(moduleId);
    if (payload.empty()) {
      payload = getSelectedPresetPayloadLocked();
    }
    if (payload.empty()) {
      return false;
    }
    moduleStateComparisonSnapshots_[static_cast<std::size_t>(captureSlot)] = {moduleId, payload};
    lastRecalledModuleStateSnapshot_ = static_cast<std::size_t>(captureSlot);
    padpilot::appendBackendLog(
        "processor", "Captured Module state comparison slot=" + std::string(captureSlot == 0 ? "A" : "B"));
    return true;
  }

  std::size_t recallSlot = 0;
  if (action == "recall-a") {
    recallSlot = 0;
  } else if (action == "recall-b") {
    recallSlot = 1;
  } else if (action == "toggle") {
    std::lock_guard<std::mutex> guard(stateMutex_);
    recallSlot = lastRecalledModuleStateSnapshot_ == 0 ? 1 : 0;
  } else {
    return false;
  }

  std::lock_guard<std::mutex> applyGuard(moduleStateApplyMutex_);
  std::string payload;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    const auto& snapshot = moduleStateComparisonSnapshots_[recallSlot];
    if (selectedModuleId_ != moduleId || !snapshot.isValid() || snapshot.moduleId != moduleId) {
      return false;
    }
    payload = snapshot.payload;
    moduleStatePayloadById_[moduleId] = payload;
    selectedPresetId_.clear();
    lastRecalledModuleStateSnapshot_ = recallSlot;
  }
  applyPresetPayloadWhileStateTransitionLocked(moduleId, payload);
  padpilot::appendBackendLog(
      "processor", "Recalled Module state comparison slot=" + std::string(recallSlot == 0 ? "A" : "B"));
  return true;
}
