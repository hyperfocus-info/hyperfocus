#pragma once

#include <cstddef>
#include <string_view>

namespace padpilot {

constexpr bool fitsAggregateByteBudget(std::size_t retainedBytes,
                                       std::size_t nextBytes,
                                       std::size_t maximumBytes) noexcept {
  return retainedBytes <= maximumBytes && nextBytes <= maximumBytes - retainedBytes;
}

bool preflightPluginStateWire(const void* data, std::size_t size);
bool preflightSetControllerConfigRequestWire(std::string_view bytes);
bool preflightFxChainStateWire(std::string_view bytes);
bool preflightRecutModuleStateWire(std::string_view bytes);
bool preflightAnalyzerModuleStateWire(std::string_view bytes);
bool preflightSampleSourceLoadRequestWire(std::string_view bytes);
bool preflightSampleAnalysisRequestWire(std::string_view bytes);
bool preflightSlicePlaybackStateWire(std::string_view bytes);
bool preflightSlicePlaybackTriggerWire(std::string_view bytes);
bool preflightSliceEditIntentWire(std::string_view bytes);
bool preflightHapticIntentWire(std::string_view bytes);
bool preflightPresetSaveRequestWire(std::string_view bytes);
bool preflightSetModuleStateRequestWire(std::string_view bytes);

}  // namespace padpilot
