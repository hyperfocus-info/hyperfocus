#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "runtime/module-identity.h"

namespace padpilot {

enum class ScriptCapability : std::uint8_t {
  keyboardOutput = 1U << 0U,
  fxGraph = 1U << 1U,
};

struct ScriptModuleAuthorization {
  std::string moduleId;
  std::uint8_t capabilityMask {};

  bool allows(ScriptCapability capability) const noexcept {
    return (capabilityMask & static_cast<std::uint8_t>(capability)) != 0;
  }
};

struct ScriptModuleLoadRequest {
  std::string bundledModulePath;
  std::string moduleId;
  std::vector<std::string> allowedCapabilities;
};

inline std::optional<ScriptModuleAuthorization> authorizeScriptModule(
    const std::string& moduleId,
    const std::vector<std::string>& allowedCapabilities) {
  if (!isValidModuleId(moduleId)) {
    return std::nullopt;
  }

  ScriptModuleAuthorization authorization;
  authorization.moduleId = moduleId;
  for (const auto& capability : allowedCapabilities) {
    if (capability == "keyboard-output") {
      authorization.capabilityMask |= static_cast<std::uint8_t>(ScriptCapability::keyboardOutput);
    } else if (capability == "fx-graph") {
      authorization.capabilityMask |= static_cast<std::uint8_t>(ScriptCapability::fxGraph);
    }
  }
  return authorization;
}

inline bool isValidScriptModuleAuthorization(const ScriptModuleAuthorization& authorization) noexcept {
  constexpr auto kKnownMask = static_cast<std::uint8_t>(ScriptCapability::keyboardOutput) |
                              static_cast<std::uint8_t>(ScriptCapability::fxGraph);
  return isValidModuleId(authorization.moduleId) &&
         (authorization.capabilityMask & static_cast<std::uint8_t>(~kKnownMask)) == 0;
}

}  // namespace padpilot
