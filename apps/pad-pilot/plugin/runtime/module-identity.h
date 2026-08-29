#pragma once

#include <cstddef>
#include <string_view>

namespace padpilot {

inline constexpr std::size_t kMaximumModuleIdBytes = 128U;
inline constexpr std::string_view kFxModuleId = "fx";
inline constexpr std::string_view kLegacyReverbModuleId = "reverb";

inline bool isValidModuleId(std::string_view moduleId) noexcept {
  if (moduleId.empty() || moduleId.size() > kMaximumModuleIdBytes) {
    return false;
  }

  bool previousWasDash = true;
  for (const auto character : moduleId) {
    const auto isAlphaNumeric = (character >= 'a' && character <= 'z') ||
                                (character >= '0' && character <= '9');
    if (!isAlphaNumeric && (character != '-' || previousWasDash)) {
      return false;
    }
    previousWasDash = character == '-';
  }
  return !previousWasDash;
}

inline std::string_view canonicalModuleId(std::string_view moduleId) noexcept {
  return moduleId == kLegacyReverbModuleId ? kFxModuleId : moduleId;
}

inline bool moduleIdMatchesCanonical(std::string_view moduleId,
                                     std::string_view canonicalId) noexcept {
  return canonicalModuleId(moduleId) == canonicalId;
}

}  // namespace padpilot
