import { normalizeSampleFieldTypes } from "./utils/sample-capability-native-contract-values";
import { describe, expect, it } from "bun:test";
import { readEditorSource } from "./editor-source-contract";
import { readProcessorSource } from "./processor-source-contract";

function messageFields(schema: string, messageName: string) {
  const match = schema.match(new RegExp(`message ${messageName} \\{([\\s\\S]*?)\\n\\}`));
  expect(match, `Missing protobuf message ${messageName}`).not.toBeNull();
  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}



describe("Sample capability native contract", () => {
  it("keeps the generic sample capability bridge aligned across proto, processor, editor, and UI bridge", async () => {
    const protoSchema = await Bun.file(new URL("../../utils/proto/capability.proto", import.meta.url)).text();
    const bridgeProtoSchema = await Bun.file(new URL("../../utils/proto/bridge.proto", import.meta.url)).text();
    const recutProtoSchema = await Bun.file(new URL("../../utils/proto/recut.proto", import.meta.url)).text();
    const processorSource = await readProcessorSource();
    const editorSource = await readEditorSource();
    const bridgeSource = await Bun.file(new URL("../../ui/src/bridge.ts", import.meta.url)).text();
    const moduleSdkSource = await Bun.file(new URL("../../ui/src/module-sdk.ts", import.meta.url)).text();
    const sampleCapabilitySource = await Bun.file(new URL("../../ui/src/padpilot/sample-capabilities.ts", import.meta.url)).text();
    const managedFileStoreSource = await Bun.file(new URL("./managed-file-store.cpp", import.meta.url)).text();

    expect(protoSchema).toContain("message CapabilityFrameEnvelope");
    expect(protoSchema).toContain("message SampleEditorFrame");
    expect(protoSchema).toContain("message SlicePlaybackState");
    expect(protoSchema).toContain("message SampleSourceLoadRequest");
    expect(protoSchema).toContain("bool is_empty = 6;");
    expect(protoSchema).toContain("string source_name = 2;");
    expect(protoSchema).toContain("string source_content_id = 3;");
    expect(recutProtoSchema).toContain("bool is_empty = 6;");
    expect(recutProtoSchema).toContain("string source_name = 18;");
    expect(recutProtoSchema).toContain("string source_content_id = 19;");
    expect(bridgeProtoSchema).toContain("message ImportedMediaEntry");
    expect(bridgeProtoSchema).toContain("repeated ImportedMediaEntry imported_media = 9;");

    expect(processorSource).toContain("buildCapabilityFrameEnvelopeBase64");
    expect(processorSource).toContain('capability == "sample-source"');
    expect(processorSource).toContain('capability == "slice-playback"');
    expect(processorSource).toContain("recutRuntime_.buildSampleEditorFrameBase64()");
    expect(processorSource).toContain("appendImportedMediaForModuleState");
    expect(processorSource).toContain("healManagedMediaForRecutState");
    expect(processorSource).toContain("healManagedMediaForFxState");
    expect(processorSource).toContain('category == "impulse-response"');
    expect(processorSource).toContain('"fx-graph"');
    expect(processorSource).toContain("state.add_module_states()");
    expect(processorSource).toContain("state.imported_media()");

    expect(editorSource).toContain('type == "openCapabilityStream"');
    expect(editorSource).toContain('type == "sendCapabilityIntent"');
    expect(editorSource).toContain('padpilotHostReceiveProto(\\"CapabilityFrameEnvelope\\", ');
    expect(editorSource).toContain('"padpilotBeginFileImport"');
    expect(editorSource).toContain('"padpilotAppendFileImport"');
    expect(editorSource).toContain('"padpilotFinishFileImport"');
    expect(editorSource).toContain('"padpilotCancelFileImport"');
    expect(editorSource).toContain('"padpilotImportFilePath"');
    expect(editorSource).toContain('category != "sample" && category != "impulse-response"');
    expect(managedFileStoreSource).toContain('getChildFile("impulse-responses")');
    expect(managedFileStoreSource).toContain("isManagedImpulseResponse");

    expect(bridgeSource).toContain('messageType === "CapabilityFrameEnvelope"');
    expect(bridgeSource).toContain("subscribeCapabilityStream");
    expect(bridgeSource).toContain("export async function importHostFile");

    expect(moduleSdkSource).toContain("openCapabilityStream");
    expect(moduleSdkSource).toContain("sendCapabilityIntent");
    expect(sampleCapabilitySource).toContain("createSampleCapabilityHandles");
    expect(sampleCapabilitySource).toContain("openEditorFrameStream");
    expect(sampleCapabilitySource).toContain("sourceContentId");
    expect(sampleCapabilitySource).toContain("sourceName");
  });

  it("keeps public sample frame structures exactly aligned with Recut runtime structures", async () => {
    const capabilitySchema = await Bun.file(new URL("../../utils/proto/capability.proto", import.meta.url)).text();
    const recutSchema = await Bun.file(new URL("../../utils/proto/recut.proto", import.meta.url)).text();

    expect(messageFields(capabilitySchema, "SampleSliceMarker"))
      .toEqual(messageFields(recutSchema, "SliceMarker"));
    expect(messageFields(capabilitySchema, "SamplePadAssignment"))
      .toEqual(messageFields(recutSchema, "PadAssignment"));
    expect(messageFields(capabilitySchema, "SampleChokeGroup"))
      .toEqual(messageFields(recutSchema, "ChokeGroup"));
    expect(normalizeSampleFieldTypes(messageFields(capabilitySchema, "SampleEditorFrame")))
      .toEqual(messageFields(recutSchema, "RecutFrame"));
  });

  it("keeps recut sample-editor frame sequencing stable when the state is idle", async () => {
    const recutRuntimeSource = await Bun.file(new URL("./recut-runtime.cpp", import.meta.url)).text();
    const devHostRuntimeSource = await Bun.file(new URL("../../ui/src/dev-host/sample-runtime.ts", import.meta.url)).text();

    expect(recutRuntimeSource).toContain("frame.set_sequence(current ? current->state.revision() : 0);");
    expect(recutRuntimeSource).not.toContain("frame.set_sequence(sequence_.fetch_add");
    expect(devHostRuntimeSource).toContain("sequence: runtimeState.recutState.revision");
    expect(devHostRuntimeSource).toContain("sequence: runtimeState.recutState.revision,");
  });
});
