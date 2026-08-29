#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include <juce_core/juce_core.h>

#include "audio/convolver-module-graph.h"
#include "generated/proto/bridge.pb.h"
#include "generated/proto/fx-chain.pb.h"
#include "runtime/base64.h"
#include "runtime/state-wire-limits.h"

namespace padpilot::proto {

inline constexpr std::size_t kMaxBridgeProtoRequestBytes =
    state_wire_limits::kMaximumModuleStateBytes + 64U * 1024U;
inline constexpr std::size_t kMaxBridgeProtoRequestBase64Chars =
    ((kMaxBridgeProtoRequestBytes + 2U) / 3U) * 4U;

padpilot::fx::FxChainState createDefaultFxChainState();
padpilot::fx::FxChainState migrateLegacyJsonToFxChainState(const std::string& payloadJson,
                                                           const std::string& selectedPresetId);

std::string serializeFxChainState(const padpilot::fx::FxChainState& state);
bool parseFxChainState(const std::string& bytes, padpilot::fx::FxChainState* state);
void syncNodeConfigFromLegacyParams(padpilot::fx::NodeState* node);

std::string buildVisualizerFrameBase64(const padpilot::fx::FxChainState& state,
                                       const padpilot::ConvolverModuleGraph::TimingSnapshot& timing,
                                       std::uint64_t sequence);

bool parsePresetSaveRequestBase64(const std::string& payloadBase64,
                                  padpilot::bridge::PresetSaveRequest* request);

bool parseSetModuleStateRequestBase64(const std::string& payloadBase64,
                                      padpilot::bridge::SetModuleStateRequest* request);

padpilot::fx::FxNodeType nodeTypeFromString(const juce::String& type);

}  // namespace padpilot::proto

