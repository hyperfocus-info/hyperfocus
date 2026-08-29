#pragma once

#include <string>

#include "generated/proto/recut.pb.h"

namespace padpilot::proto {

padpilot::recut::RecutModuleState createDefaultRecutState();
std::string serializeRecutModuleState(const padpilot::recut::RecutModuleState& state);
bool parseRecutModuleState(const std::string& bytes, padpilot::recut::RecutModuleState* state);
std::string buildRecutFrameBase64(const padpilot::recut::RecutFrame& frame);

}  // namespace padpilot::proto
