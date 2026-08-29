import { describe, expect, it } from "bun:test";
import { readEditorSource } from "./editor-source-contract";
import { readProcessorSource } from "./processor-source-contract";

const functionBody = (source: string, signature: string) => {
  const signatureIndex = source.indexOf(signature);
  expect(signatureIndex).toBeGreaterThanOrEqual(0);
  const openBrace = source.indexOf("{", signatureIndex);
  expect(openBrace).toBeGreaterThan(signatureIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }
  throw new Error(`Unterminated function: ${signature}`);
};

describe("Realtime correctness contract", () => {
  it("owns persisted-state and Module manifest limits in shared native contracts", async () => {
    const stateLimits = await Bun.file(new URL("./state-wire-limits.h", import.meta.url)).text();
    const manifestLimits = await Bun.file(new URL("./module-manifest-limits.h", import.meta.url)).text();
    const wireSource = await Bun.file(new URL("./plugin-state-wire.cpp", import.meta.url)).text();
    const quickJsSource = await Bun.file(new URL("./quick-js-host.cpp", import.meta.url)).text();
    const moduleStoreSource = await Bun.file(new URL("./module-store.cpp", import.meta.url)).text();
    const managedFileLimits = await Bun.file(new URL("./managed-file-limits.h", import.meta.url)).text();

    expect(stateLimits).toContain("kMaximumModuleStateBytes = 4U * 1024U * 1024U");
    expect(stateLimits).toContain("kMaximumPluginStateBytes = 96U * 1024U * 1024U");
    expect(stateLimits).toContain("kMaximumEditorViewStateBytes = 256U * 1024U");
    expect(stateLimits).toContain("kMaximumControllerConfigBytes = 256U * 1024U");
    expect(stateLimits).toContain("kMaximumAggregateModuleStateBytes = 24U * 1024U * 1024U");
    expect(manifestLimits).toContain("kMaximumVersionBytes = 128U");
    expect(manifestLimits).toContain("kMaximumApiVersionBytes = 128U");
    expect(manifestLimits).toContain("kMaximumStateSchemaVersion = 64U");
    expect(manifestLimits).toContain("kMaximumStateMigrationSteps = kMaximumStateSchemaVersion - 1U");
    expect(wireSource).toContain("state_wire_limits::kMaximumPluginStateBytes");
    expect(quickJsSource).toContain("state_wire_limits::kMaximumModuleStateBytes");
    expect(quickJsSource).toContain("module_manifest_limits::kMaximumApiVersionBytes");
    expect(moduleStoreSource).toContain("module_manifest_limits::kMaximumVersionBytes");
    expect(managedFileLimits).toContain("kMaximumManagedFileBytes = 25ULL * 1024ULL * 1024ULL");
    expect(wireSource).toContain("kMaximumManagedFileBytes");
  });

  it("uses bounded MPMC queues and invalidates commands across graph replacement", async () => {
    const queueHeader = await Bun.file(new URL("./lock-free-queue.h", import.meta.url)).text();
    const runtimeTypes = await Bun.file(new URL("./runtime-types.h", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const scriptHostSource = await Bun.file(new URL("./script-host.cpp", import.meta.url)).text();

    expect(queueHeader).toContain("compare_exchange_weak");
    expect(queueHeader).toContain("cell->sequence");
    expect(queueHeader).toContain("void drain() noexcept");
    expect(runtimeTypes).toContain("std::uint64_t graphEpoch {}");
    expect(runtimeTypes).toContain("graphEpoch.compare_exchange_weak");
    expect(runtimeTypes).not.toContain("graphEpoch.fetch_add");
    expect(processorSource).toContain("padpilot::advanceGraphEpoch(graphCommandEpoch_)");
    expect(processorSource).not.toContain("graphCommandEpoch_.fetch_add");
    expect(processorSource).toContain("command.graphEpoch != graphCommandEpoch_.load");
    expect(scriptHostSource).toContain("queuedAction.audioCommand.graphEpoch = graphEpoch_.load");
    const structuralApply = functionBody(processorSource, "void PadPilotAudioProcessor::applyFxChainState");
    expect(structuralApply).toContain("requestStructuralBypass(true)");
    expect(structuralApply.indexOf("requestStructuralBypass(true)")).toBeLessThan(
      structuralApply.indexOf("GraphMutationGuard mutationGuard"),
    );
    expect(structuralApply.indexOf("convolverGraph_.applyState(state)")).toBeLessThan(
      structuralApply.indexOf("requestStructuralBypass(false)"),
    );
  });

  it("keeps graph lifecycle quiescent and Recut output visible to analyzer", async () => {
    const processorSource = await readProcessorSource();
    const prepareBody = functionBody(processorSource, "void PadPilotAudioProcessor::prepareToPlay");
    const releaseBody = functionBody(processorSource, "void PadPilotAudioProcessor::releaseResources");
    const processBody = functionBody(processorSource, "void PadPilotAudioProcessor::processBlock");

    expect(prepareBody).toContain("GraphMutationGuard mutationGuard");
    expect(prepareBody.indexOf("GraphMutationGuard mutationGuard")).toBeLessThan(
      prepareBody.indexOf("analyzerRuntime_.prepare"),
    );
    expect(prepareBody.indexOf("GraphMutationGuard mutationGuard")).toBeLessThan(
      prepareBody.indexOf("recutRuntime_.prepare"),
    );
    expect(releaseBody).toContain("GraphMutationGuard mutationGuard");
    expect(processBody.indexOf("getPlayHead()")).toBeLessThan(processBody.indexOf("recutRuntime_.processBlock"));
    expect(processBody.indexOf("recutRuntime_.processBlock")).toBeLessThan(
      processBody.indexOf("analyzerRuntime_.pushAudioBlock"),
    );
    expect(processBody.indexOf("recutRuntime_.processBlock")).toBeLessThan(
      processBody.indexOf("convolverGraph_.processBlock"),
    );
    expect(processBody).toContain("fxGraphProcessingActive_.load(std::memory_order_acquire)");
    expect(processBody).toContain("if (!fxGraphProcessingActive &&");
    expect(
      processBody.slice(
        processBody.indexOf("recutRuntime_.processBlock"),
        processBody.indexOf("const auto analyzerActive"),
      ),
    ).not.toContain("return;");
  });

  it("keeps Audio Thread scratch inside prepare capacity for oversized host blocks", async () => {
    const graphSource = await Bun.file(new URL("../audio/convolver-module-graph.cpp", import.meta.url)).text();
    const nativeTests = await Bun.file(new URL("./fx-graph-native-tests.cpp", import.meta.url)).text();
    const prepareBody = functionBody(graphSource, "void ConvolverModuleGraph::prepare");
    const processBody = functionBody(graphSource, "void ConvolverModuleGraph::processBlock");

    expect(prepareBody).toContain(
      "inputScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true)",
    );
    expect(prepareBody).toContain(
      "outputScratch_.setSize(numChannels_, samplesPerBlock_, false, false, true)",
    );
    expect(prepareBody).toContain(
      "scratch.setSize(numChannels_, samplesPerBlock_, false, false, true)",
    );

    const oversizedGuard = processBody.indexOf("buffer.getNumSamples() > samplesPerBlock_");
    const activeSamples = processBody.indexOf("const int activeSamples = buffer.getNumSamples()");
    expect(oversizedGuard).toBeGreaterThanOrEqual(0);
    expect(oversizedGuard).toBeLessThan(activeSamples);
    expect(processBody).toContain("const int chunkChannels = std::min(buffer.getNumChannels(), 2)");
    expect(processBody).toContain(
      "buffer.getArrayOfWritePointers(), chunkChannels, startSample, chunkSamples",
    );
    expect(processBody).toContain("processBlock(chunk, hostBpm)");
    expect(processBody).toContain(
      "inputScratch_.setSize(numChannels_, activeSamples, false, false, true)",
    );
    expect(processBody).toContain(
      "scratch.setSize(numChannels_, activeSamples, false, false, true)",
    );
    expect(nativeTests).toContain("{7, 31, 97, 1, 53, 130, 19}");
    expect(nativeTests).toContain(
      "FX graph DSP state should be independent of small, uneven, and oversized host partitions.",
    );
  });

  it("advertises its stereo audio buses and real MIDI output path", async () => {
    const processorSource = await readProcessorSource();
    const processorHeader = await Bun.file(new URL("../core/pad-pilot-processor.h", import.meta.url)).text();
    const cmakeSource = await Bun.file(new URL("../CMakeLists.txt", import.meta.url)).text();
    const midiOutputRuntime = await Bun.file(new URL("./midi-output-runtime.h", import.meta.url)).text();
    const dependencySource = await Bun.file(new URL("../cmake/dependencies.cmake", import.meta.url)).text();
    const standaloneMidiPatch = await Bun.file(
      new URL("../cmake/patches/juce-standalone-midi-buffer.patch", import.meta.url),
    ).text();
    const layoutBody = functionBody(processorSource, "bool PadPilotAudioProcessor::isBusesLayoutSupported");
    const acceptsMidiBody = functionBody(processorSource, "bool PadPilotAudioProcessor::acceptsMidi");
    const producesMidiBody = functionBody(processorSource, "bool PadPilotAudioProcessor::producesMidi");
    const processBody = functionBody(processorSource, "void PadPilotAudioProcessor::processBlock");
    const capabilityBody = functionBody(processorSource, "bool PadPilotAudioProcessor::sendCapabilityIntent");
    const selectBody = functionBody(processorSource, "void PadPilotAudioProcessor::setSelectedModuleLocked");

    expect(layoutBody).toContain("getMainInputChannelSet() == juce::AudioChannelSet::stereo()");
    expect(layoutBody).toContain("getMainOutputChannelSet() == juce::AudioChannelSet::stereo()");
    expect(acceptsMidiBody).toContain("return false");
    expect(producesMidiBody).toContain("return true");
    expect(cmakeSource).toContain("NEEDS_MIDI_INPUT FALSE");
    expect(cmakeSource).toContain("NEEDS_MIDI_OUTPUT TRUE");
    expect(processBody).toContain("midiOutputRuntime_.processBlock(midiMessages, audioBuffer.getNumSamples())");
    expect(midiOutputRuntime).toContain("kMaximumMidiBufferBytesPerBlock <= 2048U");
    expect(midiOutputRuntime).toContain("PadPilot's JUCE wrappers reserve 2048 bytes");
    expect(midiOutputRuntime).not.toContain("ensureSize(");
    expect(dependencySource).toContain("juce-standalone-midi-buffer.patch");
    expect(standaloneMidiPatch).toContain("incomingMidi.ensureSize (2048)");
    expect(processorHeader).toContain("padpilot::MidiOutputRuntime midiOutputRuntime_");
    expect(capabilityBody).toContain('capability == "midi-output"');
    expect(capabilityBody).toContain("kMaxMidiOutputPayloadBytes");
    expect(capabilityBody).toContain("midiOutputRuntime_.enqueue(command)");
    expect(selectBody).toContain("requestMidiOutputPanic()");
  });

  it("persists live typed runtimes with independent accepted revisions", async () => {
    const protoSchema = await Bun.file(new URL("../../utils/proto/bridge.proto", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const analyzerHeader = await Bun.file(new URL("./analyzer-runtime.h", import.meta.url)).text();
    const analyzerSource = await Bun.file(new URL("./analyzer-runtime.cpp", import.meta.url)).text();
    const serializeBody = functionBody(
      processorSource,
      "std::string PadPilotAudioProcessor::serializePluginStateToProtobuf",
    );
    const restoreBody = functionBody(
      processorSource,
      "bool PadPilotAudioProcessor::restorePluginStateFromProtobuf",
    );
    const analyzerSnapshot = functionBody(
      processorSource,
      "std::optional<BoundedAnalyzerStateSnapshot> readBoundedAnalyzerStateSnapshot",
    );
    const recutSnapshot = functionBody(
      processorSource,
      "std::optional<BoundedRecutStateSnapshot> readBoundedRecutStateSnapshot",
    );
    const hostSync = functionBody(
      processorSource,
      "std::string PadPilotAudioProcessor::buildHostSyncFrameBase64",
    );
    const activeState = functionBody(
      processorSource,
      "std::string PadPilotAudioProcessor::buildActiveModuleStateFrameBase64",
    );

    expect(protoSchema).toContain("uint64 accepted_revision = 3;");
    expect(protoSchema).toContain("repeated float parameter_values = 11;");
    expect(serializeBody).not.toContain("summary->set_ui_entry_path");
    expect(serializeBody).not.toContain("summary->set_script_entry_path");
    expect(serializeBody).not.toContain("summary->add_capabilities");
    expect(serializeBody).toContain("readBoundedRecutStateSnapshot(recutRuntime_)");
    expect(serializeBody).toContain("recutSnapshot->payloadBytes");
    expect(serializeBody).toContain("readBoundedAnalyzerStateSnapshot(analyzerRuntime_)");
    expect(serializeBody).toContain("set_accepted_revision");
    expect(serializeBody).toContain("state.add_parameter_values");
    expect(restoreBody).toContain("moduleState.accepted_revision()");
    expect(restoreBody).toContain("state.parameter_values_size()");
    expect(restoreBody).toContain("setParameterNormalizedSilently");
    expect(processorSource).toContain("analyzerRuntime_.restoreState(state)");
    expect(processorSource).toContain("recutRuntime_.applyStateFromBytes(bytes)");
    expect(analyzerSnapshot).toContain("payloadBase64.size() > kMaxModuleStateBase64Chars");
    expect(analyzerSnapshot).toContain("runtime.getStateBase64()");
    expect(analyzerSnapshot).toContain("payloadBytes.size() > kMaxModuleStateBytes");
    expect(analyzerSnapshot).toContain("state.revision() == runtimeRevision");
    expect(recutSnapshot).toContain("runtime.serializeStateBytes()");
    expect(recutSnapshot).toContain("state.revision()");
    for (const body of [hostSync, activeState]) {
      expect(body.indexOf("readBoundedAnalyzerStateSnapshot(analyzerRuntime_)")).toBeLessThan(
        body.indexOf("std::lock_guard<std::mutex> guard(stateMutex_)")
      );
      expect(body).toContain("analyzerState->payloadBytes");
      expect(body).toContain("analyzerState->revision");
    }
    expect(analyzerHeader).toContain("kMaxCaptureDurationSeconds = 600.0f");
    expect(analyzerHeader).toContain("kMaxPersistedNoteEvents = 32'768");
    expect(analyzerHeader).toContain("kMaxAnalysisSnapshots = 65'536");
    expect(analyzerSource).toContain("analysisSnapshots_.size() >= kMaxAnalysisSnapshots");
    expect(analyzerSource).toContain("noteEvents_.size() >= kMaxPersistedNoteEvents");
    expect(analyzerSource).toContain("stateBytes.size() > kMaxSerializedStateBytes");
  });

  it("rejects malformed state, nonfinite commands, and unsupported public commands", async () => {
    const processorHeader = await Bun.file(new URL("../core/pad-pilot-processor.h", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const graphSource = await Bun.file(new URL("../audio/convolver-module-graph.cpp", import.meta.url)).text();
    const automationSource = await Bun.file(new URL("../core/pad-pilot-processor-automation.cpp", import.meta.url)).text();
    const parameterChanged = functionBody(
      automationSource,
      "void PadPilotAudioProcessor::parameterChanged",
    );
    const quickJsSource = await Bun.file(new URL("./quick-js-host.cpp", import.meta.url)).text();
    const quickParser = functionBody(quickJsSource, "QuickJSHost::parseAudioCommandType");

    expect(processorSource).toContain("payloadBase64.size() > kMaxModuleStateBase64Chars");
    expect(processorSource).toContain("!isValidFxState(*fxState)");
    expect(processorSource).toContain("!isValidRecutState(*recutState)");
    expect(processorSource).toContain("!isValidAnalyzerState(*analyzerState)");
    expect(processorSource).toContain("!std::isfinite(command.value)");
    expect(graphSource).toContain("!std::isfinite(command.value)");
    expect(automationSource).not.toContain("fromLastOccurrenceOf");
    expect(processorHeader).not.toContain("suppressParameterCallbacks_");
    expect(automationSource).toContain("thread_local const PadPilotAudioProcessor* callbackSuppressionOwner");
    expect(automationSource).toContain("const ScopedParameterCallbackSuppression suppression(this)");
    expect(parameterChanged).toContain("!std::isfinite(newValue)");
    expect(parameterChanged.indexOf("!std::isfinite(newValue)")).toBeLessThan(
      parameterChanged.indexOf("markFxRuntimeStateDirty()"),
    );
    expect(automationSource).toContain("parameter->getDefaultValue()");
    for (const unsupported of [
      "setConvolverStartOffset",
      "setConvolverEndOffset",
      "setConvolverReverse",
      "setConvolverImpulsePath",
      "setFxChainType",
    ]) {
      expect(quickParser).not.toContain(`\"${unsupported}\"`);
    }
  });

  it("bounds automation gestures and closes them across lifecycle discontinuities", async () => {
    const processorHeader = await Bun.file(new URL("../core/pad-pilot-processor.h", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const automationSource = await Bun.file(new URL("../core/pad-pilot-processor-automation.cpp", import.meta.url)).text();
    const editorSource = await readEditorSource();
    const beginTouch = functionBody(automationSource, "bool PadPilotAudioProcessor::beginAutomationTouch");
    const endTouch = functionBody(automationSource, "bool PadPilotAudioProcessor::endAutomationTouch");
    const endAll = functionBody(automationSource, "void PadPilotAudioProcessor::endAllAutomationTouches");
    const release = functionBody(processorSource, "void PadPilotAudioProcessor::releaseResources");
    const selectModule = functionBody(processorSource, "bool PadPilotAudioProcessor::selectModule");

    expect(processorHeader).toContain("std::array<bool, kMacroSlotCount + 3> activeAutomationTouches_");
    expect(beginTouch).toContain("if (activeAutomationTouches_[*touchIndex])");
    expect(endTouch).toContain("if (!activeAutomationTouches_[*touchIndex])");
    expect(endAll).toContain("parameter->endChangeGesture()");
    expect(release).toContain("endAllAutomationTouches()");
    expect(selectModule).toContain("endAllAutomationTouches()");
    expect(editorSource).toContain("processor_.endAllAutomationTouches()");
  });

  it("admits script action batches atomically and clears them across restart", async () => {
    const scriptHostHeader = await Bun.file(new URL("./script-host.h", import.meta.url)).text();
    const scriptHostSource = await Bun.file(new URL("./script-host.cpp", import.meta.url)).text();
    const enqueueBody = functionBody(scriptHostSource, "bool ScriptHost::enqueueActions");
    const stopBody = functionBody(scriptHostSource, "void ScriptHost::stop");

    expect(scriptHostHeader).toContain("struct QueuedActionBatch");
    expect(enqueueBody).toContain("QueuedActionBatch batch");
    expect(enqueueBody.match(/queuedActions_\.push/g)?.length).toBe(1);
    expect(stopBody).toContain("queuedActions_.drain()");
  });

  it("cannot lose wakes, starve idle haptics, or accept spoofed capability handles", async () => {
    const wakeHeader = await Bun.file(new URL("./wake-signal.h", import.meta.url)).text();
    const inputSource = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();
    const scriptHostSource = await Bun.file(new URL("./script-host.cpp", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const graphSource = await Bun.file(new URL("../audio/convolver-module-graph.cpp", import.meta.url)).text();
    const inputRun = functionBody(inputSource, "void InputThread::run");
    const hapticBody = functionBody(inputSource, "void InputThread::processHapticCommands");
    const processBody = functionBody(processorSource, "void PadPilotAudioProcessor::processBlock");
    const capabilityBody = functionBody(processorSource, "bool PadPilotAudioProcessor::sendCapabilityIntent");

    expect(wakeHeader).toContain("pending_.wait(false");
    expect(wakeHeader).toContain("pending_.exchange(false");
    expect(wakeHeader).not.toContain("binary_semaphore");
    expect(inputRun.indexOf("processHapticCommands();")).toBeLessThan(inputRun.indexOf("continue;"));
    expect(hapticBody).toContain("!std::isfinite(hapticCommand.lowFrequency)");
    expect(inputSource).toContain("lifecycleGuard(lifecycleMutex_)");
    expect(scriptHostSource).toContain("lifecycleGuard(lifecycleMutex_)");
    expect(processorSource).toContain("lifecycleGuard(runtimeLifecycleMutex_)");
    expect(processBody.indexOf("const auto analyzerActive")).toBeLessThan(
      processBody.indexOf("convolverGraph_.isWetPathBypassed()"),
    );
    expect(capabilityBody).toContain("parsedHandle->capability != capability");
    expect(capabilityBody).toContain("canonicalModuleId != selectedModuleId_");
    expect(capabilityBody).toContain("capabilityDeclared");
    expect(graphSource).toContain("chain.configured && chain.id == chainId");
  });

  it("restores host state as bounded inert references and keeps module state isolated", async () => {
    const processorSource = await readProcessorSource();
    const moduleStoreSource = await Bun.file(new URL("./module-store.cpp", import.meta.url)).text();
    const wireSource = await Bun.file(new URL("./plugin-state-wire.cpp", import.meta.url)).text();
    const protobufRestore = functionBody(
      processorSource,
      "bool PadPilotAudioProcessor::restorePluginStateFromProtobuf",
    );
    const jsonRestore = functionBody(
      processorSource,
      "bool PadPilotAudioProcessor::restorePluginStateFromJson",
    );
    const presetApply = functionBody(processorSource, "void PadPilotAudioProcessor::applyPresetPayload");
    const restoredApply = functionBody(
      processorSource,
      "void PadPilotAudioProcessor::applyRestoredStateToRuntime",
    );

    expect(protobufRestore).toContain("restorePersistedModuleReference");
    expect(jsonRestore).toContain("restorePersistedModuleReference");
    for (const untrustedField of ["ui_entry_path()", "script_entry_path()", "capabilities()", "load_status()"]) {
      expect(protobufRestore).not.toContain(untrustedField);
    }
    for (const untrustedField of ["entryPath", "scriptEntryPath", "installRootPath", "capabilities"]) {
      expect(jsonRestore).not.toContain(`getProperty(\"${untrustedField}\")`);
    }
    expect(moduleStoreSource).toContain("makeInertModuleReference");
    expect(moduleStoreSource).toContain("inert.capabilities");
    expect(moduleStoreSource).toContain("isReservedFactoryModuleId");
    expect(moduleStoreSource).toContain("Module bundle id is reserved for a PadPilot factory module.");
    expect(protobufRestore).toContain("kMaxPersistedModules");
    expect(protobufRestore).toContain("kMaxPersistedEditorViewStates");
    expect(protobufRestore.indexOf("preflightPluginStateWire")).toBeLessThan(
      protobufRestore.indexOf("state.ParseFromArray"),
    );
    expect(wireSource).toContain("kMaxPresets = state_wire_limits::kMaximumPersistedPresets");
    expect(wireSource).toContain("kMaxModuleStates = kMaxModules + 2U");
    expect(wireSource).toContain("kMaximumControllerHardwareIdBytes");
    expect(wireSource).toContain("kMaximumControllerLayoutNameBytes");
    expect(wireSource).toContain("preflightControllerConfig");
    expect(wireSource).toContain("readBoundedBytes(cursor, wire, maxEntryBytes, value)");
    expect(jsonRestore).toContain("kMaxPluginStateBytes");
    expect(presetApply).not.toContain("applyPresetPayloadJson(payload)");
    expect(restoredApply).not.toContain("applyPresetPayloadJson(payload)");
  });

  it("authorizes state, capabilities, controller payloads, presets, and haptics at bounded ready modules", async () => {
    const processorSource = await readProcessorSource();
    const setJsonState = functionBody(processorSource, "bool PadPilotAudioProcessor::setModuleStatePayload(");
    const setProtoState = functionBody(processorSource, "bool PadPilotAudioProcessor::setModuleStatePayloadBase64(");
    const setEditorState = functionBody(processorSource, "bool PadPilotAudioProcessor::setEditorViewStatePayload(");
    const setController = functionBody(processorSource, "bool PadPilotAudioProcessor::setControllerConfigPayloadBase64(");
    const createProtoPreset = functionBody(processorSource, "bool PadPilotAudioProcessor::createAndSavePresetProto(");
    const writeProfile = functionBody(processorSource, "void PadPilotAudioProcessor::writePerfSnapshotToTempLog");
    const buildHandle = functionBody(processorSource, "PadPilotAudioProcessor::buildSelectedModuleCapabilityHandle");
    const openStream = functionBody(processorSource, "void PadPilotAudioProcessor::openCapabilityStream");
    const closeStream = functionBody(processorSource, "void PadPilotAudioProcessor::closeCapabilityStream");
    const sendIntent = functionBody(processorSource, "bool PadPilotAudioProcessor::sendCapabilityIntent");

    expect(setJsonState).toContain("hasReadyModule");
    expect(setProtoState).toContain("hasReadyModule");
    expect(setProtoState).toContain("kMaxStoredModuleStates");
    expect(setEditorState).toContain("kMaxEditorViewStateBytes");
    expect(setEditorState).toContain("hasReadyModule");
    expect(setController).toContain("kMaxControllerConfigBase64Chars");
    expect(setController).toContain("isValidControllerConfigProto");
    expect(createProtoPreset).toContain("hasReadyModule");
    expect(createProtoPreset).toContain("request.preset().state().size() > kMaxModuleStateBytes");
    expect(buildHandle).toContain('module->loadStatus != "ready"');
    expect(openStream).toContain('module->loadStatus == "ready"');
    expect(closeStream).toContain('module->loadStatus == "ready"');
    expect(closeStream).toContain("capabilityStreamHandle_ != handle");
    expect(sendIntent).toContain('module->loadStatus == "ready"');
    expect(sendIntent).toContain('capability == "midi-export"');
    expect(sendIntent).toContain('action == "begin-drag" || action == "save-file"');
    expect(sendIntent).toContain('action == "begin-drag-bytes"');
    expect(sendIntent).toContain('capability == "host-tempo" && action == "set"');
    expect(sendIntent).toContain('action == "set-master-wet-dry"');
    expect(sendIntent).toContain('capability == "keyboard-output" && action == "execute"');
    expect(sendIntent).toContain("kMaxKeyboardOutputPayloadBase64Chars");
    expect(sendIntent).toContain("shortcutArray->size() > static_cast<int>(kMaxKeyboardOutputShortcuts)");
    expect(sendIntent).toContain("isSafePersistedKey(shortcut, kMaxKeyboardOutputShortcutBytes)");
    expect(sendIntent).toContain("return executeHotkeyMacro(canonicalModuleId, shortcuts)");
    expect(sendIntent).toContain("intent.duration_ms() > kMaxHapticDurationMs");
    expect(writeProfile).toContain("logPath.replaceWithText");
    expect(writeProfile).not.toContain("std::ofstream");
  });

  it("removes raw editor privilege sinks and bounds native file/update resources", async () => {
    const editorSource = await readEditorSource();
    const moduleStoreSource = await Bun.file(new URL("./module-store.cpp", import.meta.url)).text();
    const presetStoreSource = await Bun.file(new URL("./preset-store.cpp", import.meta.url)).text();
    const navigationSource = await Bun.file(new URL("./web-navigation-policy.cpp", import.meta.url)).text();

    for (const rawIntent of [
      'type == "setParam"',
      'type == "setParamLegacy"',
      'type == "browseSampleSource"',
      'type == "browseImpulse"',
      'type == "beginMidiDrag"',
      'type == "setHostTempo"',
      'type == "createPresetProto"',
      'type == "savePresetProto"',
    ]) {
      expect(editorSource).not.toContain(rawIntent);
    }
    expect(editorSource).toContain("kMaxModuleWebResourceBytes");
    expect(editorSource).toContain("streamLength > kMaxModuleWebResourceBytes");
    expect(editorSource).toContain("input->read(&trailingByte, 1) != 0");
    expect(editorSource).not.toContain("file.loadFileAsData(data)");
    expect(editorSource).toContain('path.startsWith("__padpilot/modules/")');
    expect(editorSource).toContain("return std::nullopt;");
    expect(editorSource).not.toContain('404 Missing in BinaryData: " + path');
    expect(editorSource).toContain("404 Resource not found");
    expect(editorSource).toContain("kMaxNativeJsonRequestChars");
    expect(editorSource).toContain("kMaxFilePickerPatternsChars");
    expect(editorSource).toContain("kMaxNativePathChars");
    expect(moduleStoreSource).toContain("resolved.isAChildOf(installRoot)");
    expect(moduleStoreSource).toContain("resolved.isSymbolicLink()");
    expect(moduleStoreSource).toContain("kMaxInstallTransactionFileBytes");
    expect(moduleStoreSource).toContain("marker.getSize() > kMaxInstallTransactionFileBytes");
    expect(moduleStoreSource).toContain("manifestFile.getSize() <= kMaxManifestFileBytes");
    expect(moduleStoreSource).toContain("kMaxInstallTransactions");
    expect(moduleStoreSource).not.toContain("stagingRoot.findChildFiles");
    expect(presetStoreSource).toContain("juce::RangedDirectoryIterator");
    expect(presetStoreSource).not.toContain("findChildFiles");
    expect(editorSource).toContain("classifyWebNavigation");
    expect(editorSource).toContain("newWindowAttemptingToLoad");
    expect(editorSource).toContain("url.launchInDefaultBrowser()");
    expect(navigationSource).toContain("navigation.getOrigin().equalsIgnoreCase(internalRoot.getOrigin())");
    expect(navigationSource).toContain("WebNavigationDisposition::reject");
  });
});
