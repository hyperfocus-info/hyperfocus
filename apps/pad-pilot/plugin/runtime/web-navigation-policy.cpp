#include "runtime/web-navigation-policy.h"

#include <juce_core/juce_core.h>

namespace padpilot {
namespace {
constexpr std::size_t kMaxExternalNavigationChars = 32U * 1024U;
constexpr std::size_t kMaxBridgeNavigationChars = 16U * 1024U * 1024U + 256U;

bool isInternalResourceUrl(const juce::URL& navigation, const juce::URL& internalRoot) {
  if (navigation.getOrigin().isEmpty() ||
      !navigation.getOrigin().equalsIgnoreCase(internalRoot.getOrigin())) {
    return false;
  }

  auto rootPath = internalRoot.getSubPath(false);
  auto navigationPath = navigation.getSubPath(false);
  if (rootPath.isEmpty()) {
    rootPath = "/";
  }
  if (navigationPath.isEmpty()) {
    navigationPath = "/";
  }
  if (!rootPath.startsWithChar('/')) {
    rootPath = "/" + rootPath;
  }
  if (!navigationPath.startsWithChar('/')) {
    navigationPath = "/" + navigationPath;
  }
  if (!rootPath.endsWithChar('/')) {
    rootPath += "/";
  }
  return navigationPath == rootPath.dropLastCharacters(1) ||
         navigationPath.startsWith(rootPath);
}
}

WebNavigationDisposition classifyWebNavigation(std::string_view navigationUrl,
                                                std::string_view internalRootUrl) {
  if (navigationUrl.empty() || internalRootUrl.empty() ||
      navigationUrl.size() > kMaxBridgeNavigationChars ||
      internalRootUrl.size() > kMaxExternalNavigationChars) {
    return WebNavigationDisposition::reject;
  }

  const auto navigation = juce::URL(juce::String::fromUTF8(
      navigationUrl.data(), static_cast<int>(navigationUrl.size())));
  const auto internalRoot = juce::URL(juce::String::fromUTF8(
      internalRootUrl.data(), static_cast<int>(internalRootUrl.size())));
  const auto scheme = navigation.getScheme().toLowerCase();
  if (scheme == "padpilot") {
    return navigation.getDomain().equalsIgnoreCase("bridge")
               ? WebNavigationDisposition::handleBridge
               : WebNavigationDisposition::reject;
  }

  if (navigationUrl.size() > kMaxExternalNavigationChars) {
    return WebNavigationDisposition::reject;
  }
  if (isInternalResourceUrl(navigation, internalRoot)) {
    return WebNavigationDisposition::allowInternal;
  }
  if (scheme == "https" && navigation.getDomain().isNotEmpty()) {
    return WebNavigationDisposition::openExternal;
  }
  return WebNavigationDisposition::reject;
}

}  // namespace padpilot
