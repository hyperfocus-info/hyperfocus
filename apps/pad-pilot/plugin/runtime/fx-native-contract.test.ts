import { describe, expect, it } from "bun:test";
import { readProcessorSource } from "./processor-source-contract";

describe("FX native typed-config contract", () => {
  it("keeps shared protobuf Base64 encoding independent of FX", async () => {
    const base64Header = await Bun.file(new URL("./base64.h", import.meta.url)).text();
    const fxHeader = await Bun.file(new URL("./fx-chain-proto.h", import.meta.url)).text();
    const analyzerSource = await Bun.file(new URL("./analyzer-proto.cpp", import.meta.url)).text();
    const recutSource = await Bun.file(new URL("./recut-proto.cpp", import.meta.url)).text();
    const capabilitySource = await Bun.file(new URL("./sample-capability-proto.cpp", import.meta.url)).text();

    expect(base64Header).toContain("inline std::string bytesToBase64");
    expect(base64Header).toContain("inline bool base64ToBytes");
    expect(fxHeader).toContain('#include "runtime/base64.h"');
    expect(fxHeader).not.toContain("std::string bytesToBase64(const");
    expect(analyzerSource).toContain('#include "runtime/base64.h"');
    expect(recutSource).toContain('#include "runtime/base64.h"');
    expect(capabilitySource).toContain('#include "runtime/base64.h"');
  });

  it("keeps audition bypass transient and lock-free", async () => {
    const processorSource = await readProcessorSource();
    const automationSource = await Bun.file(new URL("../core/pad-pilot-processor-automation.cpp", import.meta.url)).text();
    const graphHeader = await Bun.file(new URL("../audio/convolver-module-graph.h", import.meta.url)).text();
    const runtimeTypes = await Bun.file(new URL("./runtime-types.h", import.meta.url)).text();

    expect(processorSource).toContain('action == "set-preview-bypass"');
    expect(processorSource).toContain('convolverGraph_.requestStructuralBypass(payloadBytes == "1")');
    expect(processorSource).toContain("command.type = padpilot::AudioCommandType::setMasterWetDry");
    expect(automationSource).toContain("AudioCommandType::setFxNodeMuted");
    expect(automationSource).toContain("AudioCommandType::setFxNodeSolo");
    expect(runtimeTypes).toContain("setFxNodeMuted");
    expect(runtimeTypes).toContain("setFxNodeSolo");
    expect(graphHeader).toContain("void requestStructuralBypass(bool bypassed) noexcept;");
  });

  it("keeps the native runtime and proto schema aligned for typed node configs and timing sync", async () => {
    const graphSource = await Bun.file(new URL("../audio/convolver-module-graph.cpp", import.meta.url)).text();
    const validationHeader = await Bun.file(new URL("../audio/fx-state-validation.h", import.meta.url)).text();
    const automationSource = await Bun.file(new URL("../core/pad-pilot-processor-automation.cpp", import.meta.url)).text();
    const protoSource = await Bun.file(new URL("./fx-chain-proto.cpp", import.meta.url)).text();
    const modulationSource = await Bun.file(new URL("../audio/modulation-node.cpp", import.meta.url)).text();
    const reverbSource = await Bun.file(new URL("../audio/reverb-node.cpp", import.meta.url)).text();
    const protoSchema = await Bun.file(new URL("../../utils/proto/fx-chain.proto", import.meta.url)).text();

    expect(graphSource).toContain("applyTypedNodeState");
    expect(graphSource).toContain("processCustomNode");
    expect(graphSource).toContain("sourceNode.has_delay_config()");
    expect(graphSource).toContain("sourceNode.has_reverb_config()");
    expect(graphSource).toContain("sourceNode.has_eq_config()");
    expect(graphSource).toContain("sourceNode.has_chorus_config()");
    expect(graphSource).toContain("config.has_pre_delay_sync()");
    expect(graphSource).toContain("config.has_modulation_speed_sync()");
    expect(graphSource).toContain("config.has_rate_sync()");
    expect(graphSource).toContain("config.has_voice_delay_sync()");
    expect(graphSource).toContain("node.processors.modulation->setHostBpm(hostBpm)");
    expect(graphSource).toContain("node.processors.reverb->setHostBpm(hostBpm)");
    expect(graphSource).toContain("padpilot::isValidFxNodeConfig(node, false)");
    expect(automationSource).toContain("padpilot::isValidFxNodeConfig(node, true)");
    expect(validationHeader).toContain("case fx::FX_NODE_TYPE_REVERSE:");
    expect(validationHeader).toContain("case fx::FX_NODE_TYPE_TREMOLO:");
    expect(validationHeader).toContain("case fx::FX_NODE_TYPE_SATURATION:");

    expect(protoSource).toContain("populateNodeConfigFromLegacyParams");
    expect(protoSource).toContain("mutable_delay_config()");
    expect(protoSource).toContain("mutable_reverb_config()");
    expect(protoSource).toContain("mutable_eq_config()");
    expect(protoSource).toContain("mutable_chorus_config()");
    expect(protoSource).toContain("mutable_bitcrusher_config()");
    expect(protoSource).toContain("mutable_stereo_imager_config()");
    expect(protoSource).toContain("mutable_time_sync()");
    expect(protoSource).toContain("mutable_pre_delay_sync()");
    expect(protoSource).toContain("mutable_modulation_speed_sync()");

    expect(modulationSource).toContain("setRateSyncEnabled");
    expect(modulationSource).toContain("setBaseDelaySyncEnabled");
    expect(modulationSource).toContain("setHostBpm");
    expect(reverbSource).toContain("setPreDelaySyncEnabled");
    expect(reverbSource).toContain("setModulationSpeedSyncEnabled");
    expect(reverbSource).toContain("updatePreDelaySamples");

    expect(protoSchema).toContain("message TempoSyncState");
    expect(protoSchema).toContain("TempoSyncState time_sync = 9;");
    expect(protoSchema).toContain("TempoSyncState pre_delay_sync = 10;");
    expect(protoSchema).toContain("TempoSyncState voice_delay_sync = 8;");
    expect(protoSchema).toContain("string ir_source_path = 9;");
    expect(protoSchema).toContain("string ir_source_name = 10;");
  });
});
