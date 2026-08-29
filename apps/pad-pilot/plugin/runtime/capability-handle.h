#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace padpilot {

struct CapabilityHandleParts {
  std::string moduleInstanceId;
  std::string capability;
  std::string slot;
};

inline std::optional<CapabilityHandleParts> parseCapabilityHandle(std::string_view handle) {
  const auto first = handle.find("::");
  if (first == std::string_view::npos) {
    return std::nullopt;
  }
  const auto second = handle.find("::", first + 2U);
  if (second == std::string_view::npos ||
      handle.find("::", second + 2U) != std::string_view::npos) {
    return std::nullopt;
  }

  CapabilityHandleParts parts {
      std::string(handle.substr(0U, first)),
      std::string(handle.substr(first + 2U, second - first - 2U)),
      std::string(handle.substr(second + 2U)),
  };
  if (parts.moduleInstanceId.empty() || parts.capability.empty() || parts.slot.empty()) {
    return std::nullopt;
  }
  return parts;
}

}  // namespace padpilot
