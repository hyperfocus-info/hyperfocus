import { describe, expect, it } from "bun:test";
import { readEditorSource } from "./editor-source-contract";
import { readProcessorSource } from "./processor-source-contract";

describe("Bridge native contract", () => {
  it("keeps bridge delta publication and FX reconciliation aligned with persistence", async () => {
    const protoSchema = await Bun.file(new URL("../../utils/proto/bridge.proto", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const processorBridgeSource = await Bun.file(
      new URL("../core/pad-pilot-processor-bridge.cpp", import.meta.url),
    ).text();
    const automationSource = await Bun.file(new URL("../core/pad-pilot-processor-automation.cpp", import.meta.url)).text();
    const editorSource = await readEditorSource();
    const bridgeSource = await Bun.file(new URL("../../ui/src/bridge.ts", import.meta.url)).text();
    const ingressSource = await Bun.file(new URL("../../ui/src/bridge-ingress.ts", import.meta.url)).text();
    const wireLimitsSource = await Bun.file(new URL("./state-wire-limits.h", import.meta.url)).text();
    const controllerConfigHeader = await Bun.file(new URL("./controller-config.h", import.meta.url)).text();
    const cmakeSource = await Bun.file(new URL("../CMakeLists.txt", import.meta.url)).text();
    const processorInternalSource = await Bun.file(
      new URL("../core/pad-pilot-processor-internal.cpp", import.meta.url),
    ).text();
    const devHostSource = await Bun.file(new URL("../../ui/src/dev-host/runtime.ts", import.meta.url)).text();

    expect(protoSchema).toContain("message NavigationFrame");
    expect(protoSchema).toContain("message ActiveModuleStateFrame");
    expect(protoSchema).toContain("message InputStateFrame");

    expect(processorSource).toContain("buildNavigationFrameBase64");
    expect(processorSource).toContain("buildActiveModuleStateFrameBase64");
    expect(processorSource).toContain("buildInputStateFrameBase64");
    expect(processorSource).toContain("reconcileFxStateFromParametersIfDirty();\n  destinationData.reset();");
    expect(processorSource).toContain("const_cast<PadPilotAudioProcessor*>(this)->reconcileFxStateFromParametersIfDirty();");
    expect(processorSource).toContain("std::string PadPilotAudioProcessor::buildActiveModuleStateFrameBase64()");
    expect(processorSource).toContain("std::string PadPilotAudioProcessor::buildHostSyncFrameBase64()");
    expect(processorSource).toContain("std::string PadPilotAudioProcessor::buildVisualizerFrameBase64()");
    expect(processorBridgeSource.match(/appendModuleSummaries\(frame, modules_\);/g)).toHaveLength(2);
    expect(processorBridgeSource.match(/summary->set_resolved_module_version/g)).toHaveLength(1);
    expect(processorBridgeSource.match(/appendPresetSummaries\(frame, presets_\);/g)).toHaveLength(2);
    expect(processorBridgeSource).toContain("kMaximumHostSyncFrameBytes");
    expect(processorBridgeSource).toContain("HostSyncFrame serialization rejected bytes=");
    expect(wireLimitsSource).toContain("kMaximumLegalHostSyncFrameBytes");
    expect(wireLimitsSource).toContain("kMaximumHostSyncFrameBytes = 16U * 1024U * 1024U");
    expect(ingressSource).toContain("MAX_HOST_PROTO_INGRESS_BYTES = 16 * 1024 * 1024");
    expect(controllerConfigHeader).toContain("kMaximumControllerHardwareIdBytes = kMaxDeviceIdChars - 1U");
    expect(controllerConfigHeader).toContain("kMaximumControllerLayoutNameBytes = 128U");
    expect(processorInternalSource).toContain("row.hardware_id().size() > padpilot::kMaximumControllerHardwareIdBytes");
    expect(processorInternalSource).toContain("layout.name().size() > padpilot::kMaximumControllerLayoutNameBytes");
    expect(cmakeSource).toContain('set(PADPILOT_EMBEDDED_UI_CSS "${PADPILOT_EMBEDDED_UI_DIR}/main.css")');
    expect(cmakeSource).toContain('set(PADPILOT_EMBEDDED_UI_INDEX "${PADPILOT_EMBEDDED_UI_DIR}/index.html")');
    expect(cmakeSource).toContain('OUTPUT "${PADPILOT_EMBEDDED_UI_INDEX}" "${PADPILOT_EMBEDDED_UI_MAIN}" "${PADPILOT_EMBEDDED_UI_CSS}"');
    expect(cmakeSource).toContain('"${PADPILOT_EMBEDDED_UI_CSS}"');
    expect(cmakeSource).toContain('"${CMAKE_CURRENT_SOURCE_DIR}/../utils/*"');
    expect(cmakeSource).toContain('"${CMAKE_CURRENT_SOURCE_DIR}/../scripts/ui-build-contract.ts"');
    expect(cmakeSource).toContain('"${CMAKE_CURRENT_SOURCE_DIR}/../bunfig.toml"');
    expect(cmakeSource).toContain('"${CMAKE_CURRENT_SOURCE_DIR}/../tsconfig.base.json"');
    expect(cmakeSource).toContain('"${CMAKE_CURRENT_SOURCE_DIR}/../tsconfig.json"');
    expect(cmakeSource).toContain('--ui-source "${PADPILOT_EMBEDDED_UI_DIR}"');

    expect(automationSource).toContain("void PadPilotAudioProcessor::markFxRuntimeStateDirty()");
    expect(automationSource).toContain("fxRuntimeStateDirty_.store(true, std::memory_order_release);");
    expect(automationSource).toContain("void PadPilotAudioProcessor::reconcileFxStateFromParametersIfDirty()");
    expect(automationSource).toContain("fxRuntimeStateDirty_.store(false, std::memory_order_release);");

    expect(editorSource).toContain("sendNavigationFrameToWebUi()");
    expect(editorSource).toContain("sendActiveModuleStateFrameToWebUi()");
    expect(editorSource).toContain("sendInputStateFrameToWebUi()");
    expect(editorSource).toContain("sendCapabilityFrameToWebUi()");
    expect(editorSource).toContain("void PadPilotEditor::sendRealtimeStateToWebUi() {\n  sendVisualizerFrameToWebUi();\n  sendInputStateFrameToWebUi();");
    expect(editorSource).toContain('padpilotHostReceiveProto(\\"NavigationFrame\\", ');
    expect(editorSource).toContain('padpilotHostReceiveProto(\\"ActiveModuleStateFrame\\", ');
    expect(editorSource).toContain('padpilotHostReceiveProto(\\"InputStateFrame\\", ');
    expect(editorSource).toContain('padpilotHostReceiveProto(\\"CapabilityFrameEnvelope\\", ');

    expect(bridgeSource).toContain('messageType === "NavigationFrame"');
    expect(bridgeSource).toContain('messageType === "ActiveModuleStateFrame"');
    expect(bridgeSource).toContain('messageType === "InputStateFrame"');
    expect(bridgeSource).toContain('messageType === "CapabilityFrameEnvelope"');
    expect(bridgeSource).not.toContain('type: "openStream"');
    expect(bridgeSource).not.toContain("getCachedStreamPayload");

    expect(devHostSource).toContain("publishNavigationState()");
    expect(devHostSource).toContain("publishActiveModuleState()");
    expect(devHostSource).toContain("publishInputState()");
    expect(devHostSource).toContain("publishBootstrapState(true)");
  });

  it("keeps processBlock free of state strings and locks", async () => {
    const processorSource = await readProcessorSource();
    const processBlockMatch = processorSource.match(
      /void PadPilotAudioProcessor::processBlock\(juce::AudioBuffer<float>& audioBuffer, juce::MidiBuffer&(?:\s+\w+)?\)\s*\{([\s\S]*?)\n\}/,
    );

    expect(processBlockMatch).not.toBeNull();

    const processBlockSource = processBlockMatch?.[1] ?? "";
    expect(processBlockSource).not.toContain("selectedModuleId_");
    expect(processBlockSource).not.toContain("samplePlaybackOwnerModuleId_");
    expect(processBlockSource).not.toContain("stateMutex_");
    expect(processBlockSource).not.toContain("std::string");
    expect(processBlockSource).not.toContain("std::lock_guard");
  });

  it("keeps Recut source ownership and voice publication realtime-safe", async () => {
    const headerSource = await Bun.file(new URL("./recut-runtime.h", import.meta.url)).text();
    const runtimeSource = await Bun.file(new URL("./recut-runtime.cpp", import.meta.url)).text();
    const processBlockMatch = runtimeSource.match(
      /void RecutRuntime::processBlock\(juce::AudioBuffer<float>& audioBuffer\)\s*\{([\s\S]*?)\n\}/,
    );
    const frameBuilderMatch = runtimeSource.match(
      /std::string RecutRuntime::buildFrameBase64\(\) const\s*\{([\s\S]*?)\n\}/,
    );
    const editorFrameBuilderMatch = runtimeSource.match(
      /std::string RecutRuntime::buildSampleEditorFrameBase64\(\) const\s*\{([\s\S]*?)\n\}/,
    );

    expect(processBlockMatch).not.toBeNull();
    expect(frameBuilderMatch).not.toBeNull();
    expect(editorFrameBuilderMatch).not.toBeNull();
    expect(headerSource).not.toContain("atomic<std::shared_ptr");
    expect(processBlockMatch?.[1] ?? "").not.toContain("snapshot()");
    expect(processBlockMatch?.[1] ?? "").not.toContain("shared_ptr");
    expect(processBlockMatch?.[1] ?? "").not.toContain("stateMutex_");
    expect(processBlockMatch?.[1] ?? "").toContain("audioSourceHazard_");
    expect(processBlockMatch?.[1] ?? "").not.toContain("midiToRatio(");
    expect(processBlockMatch?.[1] ?? "").not.toContain("decibelsToGain(");
    expect(processBlockMatch?.[1] ?? "").not.toContain("std::cos(");
    expect(processBlockMatch?.[1] ?? "").toContain("voice.grains");
    expect(headerSource).toContain("kGrainsPerVoice = 8");
    expect(headerSource).toContain("std::array<Grain, kGrainsPerVoice>");
    expect(frameBuilderMatch?.[1] ?? "").not.toContain("voices_");
    expect(editorFrameBuilderMatch?.[1] ?? "").not.toContain("voices_");
  });

  it("guards editor async callbacks and parses module revisions without throwing", async () => {
    const editorSource = await readEditorSource();

    expect(editorSource).toContain("std::from_chars(begin, end, revision)");
    expect(editorSource).not.toContain("std::stoull(revisionText)");
    expect(editorSource.match(/SafePointer<PadPilotEditor>/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(editorSource).not.toMatch(/callAsync\(\[this/);
    expect(editorSource).not.toMatch(/launchAsync\([\s\S]{0,250}\[this/);
    expect(editorSource).toContain("kMaxBridgeMessageChars");
    expect(editorSource).toContain("bridge navigation rejected oversized message");
    expect(editorSource).toContain("kMaxMidiPayloadBytes");
    expect(editorSource).toContain("juce::MidiFile midiFile");
    expect(editorSource).toContain("juce::Uuid().toString()");
  });

  it("hardens WebView lifecycle, host shortcuts, DPI mapping, cache cleanup, and path imports", async () => {
    const editorHeader = await Bun.file(new URL("../core/pad-pilot-editor.h", import.meta.url)).text();
    const editorSource = await readEditorSource();
    const constructorMatch = editorSource.match(
      /PadPilotEditor::PadPilotEditor\([\s\S]*?\n\}/,
    );
    const ensureBrowserMatch = editorSource.match(
      /void PadPilotEditor::ensureBrowserCreated\(\) \{([\s\S]*?)\n\}/,
    );
    const importPathMatch = editorSource.match(
      /juce::String PadPilotEditor::importFilePath\([\s\S]*?\n\}/,
    );
    const consumeAuthorizationMatch = editorSource.match(
      /std::optional<juce::String> PadPilotEditor::consumeAuthorizedFileImportPath\([\s\S]*?\n\}/,
    );

    expect(constructorMatch).not.toBeNull();
    expect(constructorMatch?.[0] ?? "").not.toContain("make_unique<BridgeBrowser>");
    expect(ensureBrowserMatch?.[1] ?? "").toContain("!isShowing()");
    expect(editorSource).toContain("releaseBrowser();");
    expect(editorSource).toContain("browser_.reset();");

    expect(editorSource).toContain("kUnhandledShortcutRelayScript");
    expect(editorSource).toContain("event.defaultPrevented || isInteractive(event.target)");
    expect(editorSource).toContain('.withEventListener("padpilotUnhandledShortcut"');
    expect(editorSource).toContain("PostMessageW(targetWindow");

    expect(editorSource).toContain('.withNativeFunction("padpilotMapWebViewPoint"');
    expect(editorSource).toContain('coordinateSpace == "physical-screen"');
    expect(editorSource).toContain("displays.physicalToLogical");
    expect(editorSource).toContain("displays.logicalToPhysical");
    expect(editorSource).toContain("browser_->getWidth()) / *viewportWidth");

    expect(editorSource).toContain("kWebViewCacheMaxAgeMs");
    expect(editorSource).toContain('InterProcessLock maintenanceLock("PadPilot-WebView2-Cache-Maintenance")');
    expect(editorSource).toContain("target.deleteRecursively(false)");
    expect(editorSource).toContain('"Default/Code Cache"');

    expect(editorHeader).toContain("authorizedFileImports_");
    expect(editorSource).toContain("!juce::File::isAbsolutePath(path)");
    expect(editorSource).toContain("file.isSymbolicLink()");
    expect(editorSource).toContain("safeThis->authorizeFileImportPath(selected)");
    expect(importPathMatch?.[0] ?? "").toContain("consumeAuthorizedFileImportPath(requestedPath)");
    expect(importPathMatch?.[0] ?? "").toContain("rejected unauthorized path");
    expect(consumeAuthorizationMatch?.[0] ?? "").toContain("authorizedFileImports_.erase(it)");
    expect((consumeAuthorizationMatch?.[0] ?? "").indexOf("authorizedFileImports_.erase(it)"))
      .toBeLessThan((consumeAuthorizationMatch?.[0] ?? "").indexOf("return canonicalPath"));
  });
});
