#pragma once

#include <algorithm>
#include <cstddef>
#include <string_view>

namespace padpilot {

inline constexpr std::size_t kMaximumAutomationParameterIdBytes = 64U;

inline bool isValidAutomationParameterId(std::string_view value) noexcept {
  if (value.empty() || value.size() > kMaximumAutomationParameterIdBytes) {
    return false;
  }
  return std::all_of(value.begin(), value.end(), [](const unsigned char character) {
    return (character >= 'a' && character <= 'z') ||
           (character >= 'A' && character <= 'Z') ||
           (character >= '0' && character <= '9') ||
           character == '.' || character == '_';
  });
}

}  // namespace padpilot
