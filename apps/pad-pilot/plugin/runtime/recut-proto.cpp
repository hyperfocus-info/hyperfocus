#include "runtime/recut-proto.h"

#include "runtime/base64.h"
#include "runtime/plugin-state-wire.h"

namespace {
constexpr std::uint32_t kRecutSchemaVersion = 1;
}

namespace padpilot::proto {

padpilot::recut::RecutModuleState createDefaultRecutState() {
  padpilot::recut::RecutModuleState state;
  state.set_schema_version(kRecutSchemaVersion);
  state.set_revision(1);
  state.set_pitch_semitones(0.0f);
  state.set_gain_db(0.0f);
  state.set_stretch_enabled(false);
  state.set_granular_enabled(false);
  state.set_grain_size_ms(28.0f);
  state.set_grain_density(0.62f);
  state.set_analysis_mode(padpilot::recut::RECUT_ANALYSIS_MODE_AUTO);
  state.set_bpm_value(0.0f);
  state.set_bpm_source(padpilot::recut::RECUT_BPM_SOURCE_NONE);
  state.set_bpm_confidence(0.0f);
  state.set_bpm_suggested_value(0.0f);
  state.set_bpm_suggested_confidence(0.0f);
  state.set_density(0.5f);
  state.set_manual_edit_revision(0);
  state.set_project_bpm_snapshot(120.0f);
  state.set_loaded(false);
  return state;
}

std::string serializeRecutModuleState(const padpilot::recut::RecutModuleState& state) {
  std::string bytes;
  state.SerializeToString(&bytes);
  return bytes;
}

bool parseRecutModuleState(const std::string& bytes, padpilot::recut::RecutModuleState* state) {
  return state != nullptr && !bytes.empty() && preflightRecutModuleStateWire(bytes) &&
         state->ParseFromString(bytes);
}

std::string buildRecutFrameBase64(const padpilot::recut::RecutFrame& frame) {
  std::string bytes;
  frame.SerializeToString(&bytes);
  return bytesToBase64(bytes);
}

}  // namespace padpilot::proto
