#pragma once

#include <algorithm>
#include <string_view>
#include "runtime/module-store.h"

namespace padpilot {

inline bool moduleProvidesCapability(const std::vector<ModuleRecord>& modules,
                                     const std::string_view moduleId,
                                     const std::string_view capability) {
  if (moduleId.empty() || capability.empty()) {
    return false;
  }
  const auto module = std::find_if(modules.begin(), modules.end(), [moduleId](const auto& record) {
    return record.id == moduleId;
  });
  return module != modules.end() && module->loadStatus == "ready" &&
         std::find(module->capabilities.begin(), module->capabilities.end(), capability) !=
             module->capabilities.end();
}

}  // namespace padpilot
