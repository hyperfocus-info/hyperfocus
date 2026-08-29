import { describe, expect, it } from "bun:test";
import { readEditorSource } from "./editor-source-contract";
import { readProcessorSource } from "./processor-source-contract";

describe("Analyzer native contract", () => {
  it("keeps the analyzer runtime, bridge hooks, and proto schema aligned", async () => {
    const processorSource = await readProcessorSource();
    const editorSource = await readEditorSource();
    const runtimeSource = await Bun.file(new URL("./analyzer-runtime.cpp", import.meta.url)).text();
    const runtimeHeader = await Bun.file(new URL("./analyzer-runtime.h", import.meta.url)).text();
    const protoSource = await Bun.file(new URL("./analyzer-proto.cpp", import.meta.url)).text();
    const defaultsHeader = await Bun.file(new URL("./analyzer-state-defaults.h", import.meta.url)).text();
    const protoSchema = await Bun.file(new URL("../../utils/proto/analyzer.proto", import.meta.url)).text();

    expect(processorSource).toContain("analyzerRuntime_.pushAudioBlock(audioBuffer, hostBpm)");
    expect(processorSource).toContain("analyzerStreamActive_.load(std::memory_order_acquire)");
    expect(processorSource).toContain("analyzerCaptureActive_.load(std::memory_order_acquire)");
    expect(processorSource).toContain("buildAnalyzerFrameBase64");
    expect(processorSource).toContain("buildAnalyzerStateBase64");
    expect(processorSource).toContain("openAnalyzerStream");
    expect(processorSource).toContain("startAnalyzerCapture");
    expect(processorSource).toContain('action == "correct-note"');
    expect(processorSource).toContain('action == "reset-note-correction"');

    expect(editorSource).toContain("ActiveModuleStateFrame");
    expect(editorSource).toContain("CapabilityFrameEnvelope");
    expect(editorSource).toContain('type == "sendCapabilityIntent"');
    expect(editorSource).toContain('capability == "midi-export"');
    expect(editorSource).not.toContain('type == "openStream"');
    expect(editorSource).not.toContain('type == "analyzerStartCapture"');
    expect(editorSource).toContain("performExternalDragDropOfFiles");

    expect(runtimeSource).toContain("static const std::array<ScaleDefinition, 23>");
    expect(runtimeSource).toContain("writeMidiFile");
    expect(runtimeSource).toContain("startRecordingLocked");
    expect(runtimeSource).toContain("replaySnapshotsLocked");
    expect(runtimeSource).toContain("setMonitoringEnabled");
    expect(runtimeSource).toContain("rankScaleMatches");
    expect(runtimeSource).toContain("createEventIdLocked");
    expect(runtimeSource).toContain("explainedByLowerFundamental");
    expect(runtimeSource).toContain("constexpr int kMaxWorkerSlicesPerLock = 32");
    expect(runtimeSource).toContain("processedSlices < kMaxWorkerSlicesPerLock");

    expect(protoSource).toContain("createDefaultAnalyzerState");
    expect(protoSource).toContain("buildAnalyzerFrameBase64");
    expect(defaultsHeader).toContain("kAnalyzerDefaultTuningHz = 440.0f");
    expect(defaultsHeader).toContain("kAnalyzerDefaultDetectionSensitivity = 0.5f");
    expect(runtimeHeader).toContain("kAnalyzerDefaultTuningHz");
    expect(runtimeHeader).toContain("kAnalyzerDefaultDetectionSensitivity");
    expect(runtimeSource).not.toContain("kDefaultTuningHz = 440.0f");
    expect(protoSource).not.toContain("kDefaultTuningHz = 440.0f");

    expect(protoSchema).toContain("message AnalyzerModuleState");
    expect(protoSchema).toContain("message AnalyzerFrame");
    expect(protoSchema).toContain("message AnalyzerNoteEvent");
    expect(protoSchema).toContain("message AnalyzerScaleMatch");
    expect(protoSchema).toContain("detection_sensitivity");
    expect(protoSchema).toContain("event_id");
    expect(protoSchema).toContain("detected_midi_note");
  });
});
