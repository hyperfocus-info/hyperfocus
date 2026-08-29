#include "core/pad-pilot-editor-internal.h"

using namespace padpilot::editor_detail;

PadPilotEditor::PadPilotEditor(PadPilotAudioProcessor& processor)
    : juce::AudioProcessorEditor(&processor), processor_(processor) {
  processor_.setEditorTelemetryVisible(false);
  setResizable(true, true);
  setResizeLimits(400, 250, 1600, 1000);
  setSize(800, 500);
  analyzerExpandedBounds_ = getBounds();

  loadingOverlay_ = std::make_unique<LoadingOverlay>();
  addAndMakeVisible(*loadingOverlay_);

  statusLabel_.setColour(juce::Label::textColourId, juce::Colours::white);
  statusLabel_.setJustificationType(juce::Justification::centred);
  statusLabel_.setText("Loading PadPilot UI...", juce::dontSendNotification);
  addAndMakeVisible(statusLabel_);

  auto safeThis = juce::Component::SafePointer<PadPilotEditor>(this);
  juce::MessageManager::callAsync([safeThis]() {
    if (safeThis != nullptr && !safeThis->shuttingDown_) {
      safeThis->activateWebUiIfShowing();
    }
  });
}

PadPilotEditor::~PadPilotEditor() {
  shuttingDown_ = true;
  stageUpdateThread_.request_stop();
  if (stageUpdateThread_.joinable()) {
    stageUpdateThread_.join();
  }
  processor_.endAllAutomationTouches();
  stopTimer();
  browser_.reset();
  moduleBundleChooser_.reset();
  hostFilePickerChooser_.reset();
  analyzerMidiSaveChooser_.reset();
  if (analyzerDragMidiFile_.existsAsFile()) {
    analyzerDragMidiFile_.deleteFile();
  }
  processor_.setDiagnosticsTelemetryVisible(false);
  processor_.setEditorTelemetryVisible(false);
}

void PadPilotEditor::paint(juce::Graphics& graphics) {
  graphics.fillAll(juce::Colour(0xff0f1115));
}

void PadPilotEditor::resized() {
  if (browser_ != nullptr) {
    browser_->setBounds(getLocalBounds());
  }
  if (loadingOverlay_ != nullptr) {
    loadingOverlay_->setBounds(getLocalBounds());
  }
  statusLabel_.setBounds(getLocalBounds().reduced(24));
}

void PadPilotEditor::parentHierarchyChanged() {
  if (isShowing()) {
    activateWebUiIfShowing();
  } else {
    stopTimer();
    releaseBrowser();
  }
}

void PadPilotEditor::visibilityChanged() {
  const bool visible = isShowing();
  processor_.setEditorTelemetryVisible(visible);
  processor_.setDiagnosticsTelemetryVisible(visible && diagnosticsVisible_);
  if (visible) {
    activateWebUiIfShowing();
    if (!webUiLoaded_) {
      return;
    }
    resetPublishedRealtimeState();
    startTimerHz(15);
    sendStateToWebUi();
    sendRealtimeStateToWebUi();
  } else {
    stopTimer();
    releaseBrowser();
  }
}

void PadPilotEditor::activateWebUiIfShowing() {
  if (shuttingDown_ || !isShowing()) {
    return;
  }
  ensureBrowserCreated();
  if (browser_ == nullptr || webUiLoaded_ || webUiLoadStarted_) {
    return;
  }
  resized();
  startTimerHz(10);
  loadWebUi();
}

void PadPilotEditor::ensureBrowserCreated() {
  if (browser_ != nullptr || shuttingDown_ || !isShowing()) {
    return;
  }
  browser_ = std::make_unique<BridgeBrowser>(*this, makeBrowserOptions());
  addAndMakeVisible(*browser_);
  browser_->setVisible(false);
  resized();
}

void PadPilotEditor::releaseBrowser() {
  if (browser_ == nullptr) {
    return;
  }
  browser_.reset();
  webUiLoadStarted_ = false;
  webUiLoaded_ = false;
  ticksSinceLoad_ = 0;
  resetPublishedRealtimeState();
  if (loadingOverlay_ != nullptr) {
    loadingOverlay_->setProgress(0.0f);
    loadingOverlay_->setStatusText("Loading webview...");
    loadingOverlay_->setVisible(true);
  }
  statusLabel_.setText("Loading PadPilot UI...", juce::dontSendNotification);
  statusLabel_.setVisible(true);
}

bool PadPilotEditor::delegateUnhandledShortcut(const juce::var& payload) {
#if JUCE_WINDOWS
  const auto* object = payload.getDynamicObject();
  if (object == nullptr) {
    return false;
  }
  const auto keyCodeValue = object->getProperty("keyCode");
  if (!keyCodeValue.isInt() && !keyCodeValue.isInt64()) {
    return false;
  }
  const auto keyCode = static_cast<int>(keyCodeValue);
  if (keyCode <= 0 || keyCode >= 256) {
    return false;
  }
  const auto eventType = object->getProperty("type").toString();
  const auto isKeyDown = eventType == "keydown";
  if (!isKeyDown && eventType != "keyup") {
    return false;
  }
  const auto* peer = getPeer();
  if (peer == nullptr) {
    return false;
  }
  const auto editorWindow = static_cast<HWND>(peer->getNativeHandle());
  if (editorWindow == nullptr || !IsWindow(editorWindow)) {
    return false;
  }
  auto targetWindow = GetAncestor(editorWindow, GA_ROOT);
  if (targetWindow == nullptr || targetWindow == editorWindow) {
    targetWindow = GetParent(editorWindow);
  }
  if (targetWindow == nullptr || !IsWindow(targetWindow)) {
    return false;
  }

  const auto scanCode = MapVirtualKeyW(static_cast<UINT>(keyCode), MAPVK_VK_TO_VSC);
  LPARAM keyMessageFlags = 1 | (static_cast<LPARAM>(scanCode) << 16);
  if (!isKeyDown) {
    keyMessageFlags |= static_cast<LPARAM>(1ULL << 30U) | static_cast<LPARAM>(1ULL << 31U);
  }
  const auto altDown = static_cast<bool>(object->getProperty("altKey"));
  const auto message = altDown
      ? (isKeyDown ? WM_SYSKEYDOWN : WM_SYSKEYUP)
      : (isKeyDown ? WM_KEYDOWN : WM_KEYUP);
  if (PostMessageW(targetWindow, message, static_cast<WPARAM>(keyCode), keyMessageFlags) == FALSE) {
    padpilot::appendBackendLog("editor", "failed to delegate WebView shortcut to DAW host");
    return false;
  }
  return true;
#else
  juce::ignoreUnused(payload);
  return false;
#endif
}

juce::String PadPilotEditor::mapWebViewPoint(const juce::var& request) const {
  const auto* object = request.getDynamicObject();
  if (object == nullptr || browser_ == nullptr) {
    return "error:Invalid WebView coordinate request.";
  }
  const auto x = readFiniteNumber(object->getProperty("x"));
  const auto y = readFiniteNumber(object->getProperty("y"));
  if (!x.has_value() || !y.has_value()) {
    return "error:Invalid WebView coordinate request.";
  }

  const auto coordinateSpace = object->getProperty("space").toString();
  juce::Point<float> localPoint;
  auto& displays = juce::Desktop::getInstance().getDisplays();
  if (coordinateSpace == "physical-screen") {
    const juce::Point<float> physicalPoint {static_cast<float>(*x), static_cast<float>(*y)};
    const auto* display = displays.getDisplayForPoint(physicalPoint.roundToInt(), true);
    const auto logicalPoint = displays.physicalToLogical(physicalPoint, display);
    localPoint = browser_->getLocalPoint(nullptr, logicalPoint);
  } else if (coordinateSpace.isEmpty() || coordinateSpace == "css") {
    const auto viewportWidth = readFiniteNumber(object->getProperty("viewportWidth"));
    const auto viewportHeight = readFiniteNumber(object->getProperty("viewportHeight"));
    if (!viewportWidth.has_value() || !viewportHeight.has_value() ||
        *viewportWidth <= 0.0 || *viewportHeight <= 0.0) {
      return "error:Invalid WebView viewport.";
    }
    localPoint = {
        static_cast<float>(*x * static_cast<double>(browser_->getWidth()) / *viewportWidth),
        static_cast<float>(*y * static_cast<double>(browser_->getHeight()) / *viewportHeight),
    };
  } else {
    return "error:Unsupported WebView coordinate space.";
  }

  const auto logicalScreenPoint = browser_->localPointToGlobal(localPoint);
  const auto* display = displays.getDisplayForPoint(logicalScreenPoint.roundToInt(), false);
  const auto physicalScreenPoint = displays.logicalToPhysical(logicalScreenPoint, display);
  const auto platformScale = getPeer() != nullptr ? getPeer()->getPlatformScaleFactor() : 1.0;
  return toJsonResponse([&](juce::DynamicObject& response) {
    response.setProperty("displayScale", display != nullptr ? display->scale : platformScale);
    response.setProperty("juceX", localPoint.x);
    response.setProperty("juceY", localPoint.y);
    response.setProperty("logicalScreenX", logicalScreenPoint.x);
    response.setProperty("logicalScreenY", logicalScreenPoint.y);
    response.setProperty("physicalScreenX", physicalScreenPoint.x);
    response.setProperty("physicalScreenY", physicalScreenPoint.y);
    response.setProperty("platformScale", platformScale);
  });
}

bool PadPilotEditor::onBrowserNavigate(const juce::String& newURL) {
  const juce::URL url(newURL);
  const auto disposition = padpilot::classifyWebNavigation(
      newURL.toStdString(), juce::WebBrowserComponent::getResourceProviderRoot().toStdString());
  if (disposition == padpilot::WebNavigationDisposition::allowInternal) {
    return true;
  }
  if (disposition == padpilot::WebNavigationDisposition::openExternal) {
    padpilot::appendBackendLog("editor", "opening external navigation in default browser origin=" +
                                            url.getOrigin().toStdString());
    url.launchInDefaultBrowser();
    return false;
  }
  if (disposition != padpilot::WebNavigationDisposition::handleBridge) {
    padpilot::appendBackendLog("editor", "rejected webview navigation scheme=" +
                                            url.getScheme().toStdString());
    return false;
  }

  auto payloadPath = url.getSubPath();
  if (payloadPath.startsWithChar('/')) {
    payloadPath = payloadPath.substring(1);
  }
  if (static_cast<std::size_t>(payloadPath.length()) > kMaxBridgeMessageChars) {
    padpilot::appendBackendLog("editor", "bridge navigation rejected oversized message");
    return false;
  }
  const auto payload = juce::URL::removeEscapeChars(payloadPath);
  const juce::var message = juce::JSON::parse(payload);
  if (!message.isVoid()) {
    handleBridgeMessage(message);
  }
  return false;
}

void PadPilotEditor::onBrowserPageFinishedLoading(const juce::String& loadedURL) {
  if (!webUiLoaded_) {
    statusLabel_.setText(
        "Page loaded, waiting for UI bridge ready...\nURL: " + loadedURL,
        juce::dontSendNotification);
    statusLabel_.setVisible(true);
  }
}

bool PadPilotEditor::onBrowserNetworkError(const juce::String& errorInfo) {
  statusLabel_.setText(
      "WebView network/load error:\n" + errorInfo,
      juce::dontSendNotification);
  statusLabel_.setVisible(true);
  if (loadingOverlay_ != nullptr) {
    loadingOverlay_->setVisible(false);
  }
  return true;
}

void PadPilotEditor::loadWebUi() {
  if (browser_ == nullptr || !isShowing() || webUiLoadStarted_) {
    return;
  }
  webUiLoadStarted_ = true;
#if JUCE_WINDOWS
  if (!webView2Supported_) {
    if (browser_ != nullptr) browser_->setVisible(false);
    statusLabel_.setText("PadPilot requires Microsoft Edge WebView2 Runtime.", juce::dontSendNotification);
    statusLabel_.setVisible(true);
    return;
  }
#endif

  browser_->setVisible(false);
  resized();
  juce::String root = juce::WebBrowserComponent::getResourceProviderRoot();
  juce::String urlToLoad = root.endsWith("/") ? root + "index.html" : root + "/index.html";
  browser_->goToURL(urlToLoad);
  statusLabel_.setText("Loading embedded UI...", juce::dontSendNotification);
}

