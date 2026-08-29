#pragma once

#include <string>

#include "generated/proto/analyzer.pb.h"

namespace padpilot::proto {

padpilot::analyzer::AnalyzerModuleState createDefaultAnalyzerState();
std::string serializeAnalyzerModuleState(const padpilot::analyzer::AnalyzerModuleState& state);
bool parseAnalyzerModuleState(const std::string& bytes, padpilot::analyzer::AnalyzerModuleState* state);
std::string buildAnalyzerFrameBase64(const padpilot::analyzer::AnalyzerFrame& frame);

}  // namespace padpilot::proto
