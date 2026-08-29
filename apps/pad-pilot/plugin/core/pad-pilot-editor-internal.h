#pragma once

#include "core/pad-pilot-editor.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#if JUCE_WINDOWS
#include <windows.h>
#endif

#include "BinaryData.h"
#include "core/pad-pilot-processor.h"
#include "generated/proto/capability.pb.h"
#include "runtime/backend-log.h"
#include "updater/plugin-update-utils.h"
#include "runtime/fx-chain-proto.h"
#include "runtime/runtime-types.h"
#include "runtime/web-navigation-policy.h"

namespace padpilot::editor_detail {
constexpr std::uint64_t kMaxImportedSampleBytes = padpilot::ManagedFileStore::kDefaultMaxImportBytes;
constexpr std::size_t kMaxBridgeMessageChars = 16U * 1024U * 1024U;
constexpr std::size_t kMaxMidiPayloadBytes = 8U * 1024U * 1024U;
constexpr std::size_t kMaxMidiPayloadBase64Chars = ((kMaxMidiPayloadBytes + 2U) / 3U) * 4U;
constexpr int kMaxMidiFilenameChars = 256;
constexpr std::int64_t kMaxModuleWebResourceBytes = 16LL * 1024LL * 1024LL;
constexpr int kMaxFileImportRequestChars = 64 * 1024;
constexpr int kMaxNativePathChars = 32 * 1024;
constexpr int kMaxNativeJsonRequestChars = 64 * 1024;
constexpr int kMaxFilePickerTitleChars = 256;
constexpr int kMaxFilePickerPatternsChars = 1024;
constexpr int kMaxImportedSourceNameChars = 256;
constexpr int kMaxImportedMimeTypeChars = 128;
constexpr int kMaxImportSessionIdChars = 64;
constexpr std::size_t kMaxPendingFileImports = 4U;
constexpr std::size_t kMaxFileImportChunkBytes = 512U * 1024U;
constexpr std::size_t kMaxFileImportChunkBase64Chars = ((kMaxFileImportChunkBytes + 2U) / 3U) * 4U;
constexpr double kFileImportSessionTimeoutMs = 2.0 * 60.0 * 1000.0;
constexpr double kAuthorizedFileImportTimeoutMs = 2.0 * 60.0 * 1000.0;
constexpr std::size_t kMaxAuthorizedFileImports = 8U;
constexpr juce::int64 kWebViewCacheMaxAgeMs = 30LL * 24LL * 60LL * 60LL * 1000LL;
constexpr double kMaxWebViewCoordinate = 1.0e7;

constexpr auto kUnhandledShortcutRelayScript = R"JS(
(() => {
  if (window.__padpilotUnhandledShortcutRelayInstalled) return;
  window.__padpilotUnhandledShortcutRelayInstalled = true;
  const install = () => window.setTimeout(() => {
    const isInteractive = (target) => target instanceof Element && target.closest(
      "input,textarea,select,button,a,[contenteditable=true],[role=button],[role=checkbox],[role=combobox],[role=listbox],[role=menuitem],[role=option],[role=slider],[role=switch],[role=tab]"
    );
    const relay = (event) => {
      if (event.defaultPrevented || isInteractive(event.target)) return;
      if (!window.__JUCE__?.backend?.emitEvent) return;
      event.preventDefault();
      window.__JUCE__.backend.emitEvent("padpilotUnhandledShortcut", {
        altKey: event.altKey,
        code: event.code,
        ctrlKey: event.ctrlKey,
        keyCode: event.keyCode,
        metaKey: event.metaKey,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        type: event.type,
      });
    };
    window.addEventListener("keydown", relay);
    window.addEventListener("keyup", relay);
  }, 0);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
)JS";

std::optional<double> readFiniteNumber(const juce::var& value);
std::optional<std::string> canonicalImportPathKey(const juce::String& path);
#if JUCE_WINDOWS
juce::File prepareWebViewUserDataFolder();
#endif
juce::var createRuntimeDiagnosticsVar(const padpilot::RuntimeDiagnostics& diagnostics);
std::string buildRecutSampleLoadRequestBase64(const padpilot::ManagedFileRecord& file);
juce::String toJsonResponse(const std::function<void(juce::DynamicObject&)>& assign);
bool parseRevision(const std::string& text, std::uint64_t& revision);
std::optional<std::vector<std::byte>> readBoundedModuleResource(const juce::File& file);
}  // namespace padpilot::editor_detail

struct PadPilotEditor::BridgeBrowser final : public juce::WebBrowserComponent {
  explicit BridgeBrowser(PadPilotEditor& owner, const juce::WebBrowserComponent::Options& options)
      : juce::WebBrowserComponent(options), owner_(owner) {}

  bool pageAboutToLoad(const juce::String& newURL) override {
    return owner_.onBrowserNavigate(newURL);
  }

  void newWindowAttemptingToLoad(const juce::String& newURL) override {
    owner_.onBrowserNavigate(newURL);
  }

  void pageFinishedLoading(const juce::String& url) override {
    owner_.onBrowserPageFinishedLoading(url);
  }

  bool pageLoadHadNetworkError(const juce::String& errorInfo) override {
    return owner_.onBrowserNetworkError(errorInfo);
  }

  PadPilotEditor& owner_;
};

struct PadPilotEditor::LoadingOverlay final : public juce::Component {
  LoadingOverlay() {
    setInterceptsMouseClicks(false, false);
    const auto logoResourceName = findResourceNameByOriginalPathSuffix("pad-pilot-logo.png");
    if (logoResourceName.isNotEmpty()) {
      int logoSize = 0;
      if (const char* logoData = BinaryData::getNamedResource(logoResourceName.toRawUTF8(), logoSize)) {
        logoImage_ = juce::ImageFileFormat::loadFrom(logoData, static_cast<size_t>(logoSize));
      }
    }
  }

  static juce::String findResourceNameByOriginalPathSuffix(const juce::String& suffix) {
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i) {
      const auto* resourceName = BinaryData::namedResourceList[i];
      const auto originalFilename = juce::String(BinaryData::getNamedResourceOriginalFilename(resourceName));
      if (originalFilename.endsWithIgnoreCase(suffix)) {
        return juce::String(resourceName);
      }
    }
    return {};
  }

  void setProgress(float nextProgress) {
    progress_ = juce::jlimit(0.0f, 1.0f, nextProgress);
    repaint();
  }

  void setPulsePhase(float phase) {
    pulsePhase_ = phase;
    repaint();
  }

  void setStatusText(const juce::String& text) {
    statusText_ = text;
    repaint();
  }

  void paint(juce::Graphics& g) override {
    auto area = getLocalBounds().toFloat();
    g.setGradientFill(juce::ColourGradient(
        juce::Colour(0xff14284a), area.getCentreX(), area.getY(),
        juce::Colour(0xff070d1b), area.getCentreX(), area.getBottom(), false));
    g.fillRect(area);

    const float pulse = 0.5f + 0.5f * std::sin(pulsePhase_);
    const float alpha = 0.72f + 0.24f * pulse;
    const float scale = 0.985f + 0.03f * pulse;

    auto logoArea = area.removeFromTop(area.getHeight() * 0.68f).reduced(20.0f, 20.0f);
    if (logoImage_.isValid()) {
      auto imageBounds = logoImage_.getBounds().toFloat();
      const float targetWidth = juce::jmin(logoArea.getWidth() * 0.78f, imageBounds.getWidth() * scale);
      const float aspect = imageBounds.getHeight() / juce::jmax(1.0f, imageBounds.getWidth());
      const float targetHeight = targetWidth * aspect;
      juce::Rectangle<float> dest(targetWidth, targetHeight);
      dest.setCentre(logoArea.getCentre());
      g.setOpacity(alpha);
      g.drawImage(logoImage_, dest);
      g.setOpacity(1.0f);
    } else {
      g.setColour(juce::Colours::white.withAlpha(alpha));
      g.setFont(juce::FontOptions(36.0f, juce::Font::bold));
      g.drawFittedText("PAD PILOT", logoArea.toNearestInt(), juce::Justification::centred, 1);
    }

    auto progressArea = getLocalBounds().removeFromBottom(72).reduced(120, 8);
    auto track = progressArea.removeFromTop(12).toFloat();
    g.setColour(juce::Colour(0xff21385b));
    g.fillRoundedRectangle(track, 6.0f);
    g.setColour(juce::Colour(0xff7ec8ff));
    auto fill = track.withWidth(track.getWidth() * progress_);
    g.fillRoundedRectangle(fill, 6.0f);

    g.setColour(juce::Colour(0xff8ca8c8));
    g.setFont(juce::FontOptions(13.0f));
    g.drawFittedText(statusText_, progressArea.removeFromTop(24), juce::Justification::centredTop, 1);
  }

 private:
  juce::Image logoImage_;
  juce::String statusText_ {"Loading webview..."};
  float progress_ {0.0f};
  float pulsePhase_ {0.0f};
};

