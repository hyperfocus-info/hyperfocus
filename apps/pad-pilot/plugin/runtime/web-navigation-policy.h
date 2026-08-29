#pragma once

#include <string_view>

namespace padpilot {

enum class WebNavigationDisposition {
  allowInternal,
  handleBridge,
  openExternal,
  reject,
};

WebNavigationDisposition classifyWebNavigation(std::string_view navigationUrl,
                                                std::string_view internalRootUrl);

}  // namespace padpilot
