#include "runtime/analyzer-proto.h"

#include "runtime/analyzer-state-defaults.h"
#include "runtime/base64.h"
#include "runtime/plugin-state-wire.h"

namespace {
constexpr std::uint32_t kAnalyzerSchemaVersion = 3;
}  // namespace

namespace padpilot::proto {

padpilot::analyzer::AnalyzerModuleState createDefaultAnalyzerState() {
  padpilot::analyzer::AnalyzerModuleState state;
  state.set_schema_version(kAnalyzerSchemaVersion);
  state.set_revision(1);
  state.set_record_enabled(false);
  state.set_tuning_hz(kAnalyzerDefaultTuningHz);
  state.set_detection_sensitivity(kAnalyzerDefaultDetectionSensitivity);
  return state;
}

std::string serializeAnalyzerModuleState(const padpilot::analyzer::AnalyzerModuleState& state) {
  std::string bytes;
  state.SerializeToString(&bytes);
  return bytes;
}

bool parseAnalyzerModuleState(const std::string& bytes, padpilot::analyzer::AnalyzerModuleState* state) {
  if (state == nullptr || bytes.empty()) {
    return false;
  }
  return preflightAnalyzerModuleStateWire(bytes) && state->ParseFromString(bytes);
}

std::string buildAnalyzerFrameBase64(const padpilot::analyzer::AnalyzerFrame& frame) {
  std::string bytes;
  frame.SerializeToString(&bytes);
  return bytesToBase64(bytes);
}

}  // namespace padpilot::proto
