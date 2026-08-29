#include "core/pad-pilot-editor-internal.h"
#include "runtime/module-identity.h"

using namespace padpilot::editor_detail;

void PadPilotEditor::timerCallback() {
  ++ticksSinceLoad_;
  if (loadingOverlay_ != nullptr && !webUiLoaded_) {
    loadingOverlay_->setPulsePhase(static_cast<float>(ticksSinceLoad_) * 0.23f);
    loadingOverlay_->setProgress(juce::jlimit(0.0f, 0.95f, static_cast<float>(ticksSinceLoad_) / 100.0f));
    loadingOverlay_->setStatusText("Loading webview...");
    loadingOverlay_->setVisible(true);
    loadingOverlay_->toFront(false);
  }

  if (webUiLoaded_) {
    sendRealtimeStateToWebUi();
    return;
  } else if (ticksSinceLoad_ > 100) {
    // On timeout, keep browser visible so we can see the log capture area
    if (browser_ != nullptr) {
      browser_->setVisible(true);
    }
    statusLabel_.setText(
        "PadPilot UI timed out (10 seconds).\n"
        "Embedded UI resources failed to load. Check the PadPilot backend log for the missing resource.",
        juce::dontSendNotification);
    statusLabel_.setVisible(true);
    if (loadingOverlay_ != nullptr) {
      loadingOverlay_->setVisible(false);
    }
  }
}

void PadPilotEditor::resetPublishedRealtimeState() {
  lastPublishedActiveModuleStatePayload_.clear();
  lastPublishedInputStatePayload_.clear();
  lastPublishedCapabilityFramePayload_.clear();
}

void PadPilotEditor::sendStateToWebUi() {
  juce::DynamicObject::Ptr state = new juce::DynamicObject();
  const auto diagnostics = processor_.getRuntimeDiagnostics();
  state->setProperty("runtimeDiagnostics", createRuntimeDiagnosticsVar(diagnostics));
  const juce::String json = juce::JSON::toString(juce::var(state.get()), false);
  if (browser_ != nullptr) {
    browser_->evaluateJavascript(
        "window.padpilotHostReceive && window.padpilotHostReceive(" + juce::JSON::toString(json) + ");");
  }
  sendHostSyncFrameToWebUi();
  sendActiveModuleStateFrameToWebUi(true);
  sendCapabilityFrameToWebUi(true);
}

void PadPilotEditor::sendRealtimeStateToWebUi() {
  sendVisualizerFrameToWebUi();
  sendInputStateFrameToWebUi();
  sendActiveModuleStateFrameToWebUi();
  sendCapabilityFrameToWebUi();
  if (diagnosticsVisible_) {
    sendRuntimeDiagnosticsToWebUi();
  }
}

void PadPilotEditor::sendHostSyncFrameToWebUi() {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = processor_.buildHostSyncFrameBase64();
  if (payloadBase64.empty()) {
    return;
  }

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"HostSyncFrame\", "
      + juce::JSON::toString(juce::String(payloadBase64)) + ");");
}

void PadPilotEditor::sendNavigationFrameToWebUi() {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = processor_.buildNavigationFrameBase64();
  if (payloadBase64.empty()) {
    return;
  }

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"NavigationFrame\", "
      + juce::JSON::toString(juce::String(payloadBase64)) + ");");
}

void PadPilotEditor::sendActiveModuleStateFrameToWebUi(bool force) {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = juce::String(processor_.buildActiveModuleStateFrameBase64());
  if (payloadBase64.isEmpty()) {
    return;
  }
  if (!force && payloadBase64 == lastPublishedActiveModuleStatePayload_) {
    return;
  }
  lastPublishedActiveModuleStatePayload_ = payloadBase64;

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"ActiveModuleStateFrame\", "
      + juce::JSON::toString(payloadBase64) + ");");
}

void PadPilotEditor::sendInputStateFrameToWebUi(bool force) {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = juce::String(processor_.buildInputStateFrameBase64());
  if (!force && payloadBase64 == lastPublishedInputStatePayload_) {
    return;
  }
  lastPublishedInputStatePayload_ = payloadBase64;

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"InputStateFrame\", "
      + juce::JSON::toString(payloadBase64) + ");");
}

void PadPilotEditor::sendVisualizerFrameToWebUi() {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = processor_.buildVisualizerFrameBase64();
  if (payloadBase64.empty()) {
    return;
  }

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"VisualizerFrame\", "
      + juce::JSON::toString(juce::String(payloadBase64)) + ");");
}

void PadPilotEditor::sendCapabilityFrameToWebUi(bool force) {
  if (browser_ == nullptr) {
    return;
  }

  const auto payloadBase64 = juce::String(processor_.buildCapabilityFrameEnvelopeBase64());
  if (!force && payloadBase64.isEmpty()) {
    return;
  }
  if (!force && payloadBase64 == lastPublishedCapabilityFramePayload_) {
    return;
  }
  if (payloadBase64.isEmpty()) {
    padpilot::appendBackendLog("editor", "sendCapabilityFrameToWebUi payload empty force=" + std::string(force ? "true" : "false"));
  } else {
    padpilot::appendBackendLog(
        "editor",
        "sendCapabilityFrameToWebUi forwarded payloadLength=" + std::to_string(static_cast<std::size_t>(payloadBase64.getNumBytesAsUTF8())) +
            " force=" + std::string(force ? "true" : "false"));
  }
  lastPublishedCapabilityFramePayload_ = payloadBase64;

  browser_->evaluateJavascript(
      "window.padpilotHostReceiveProto && window.padpilotHostReceiveProto(\"CapabilityFrameEnvelope\", "
      + juce::JSON::toString(payloadBase64) + ");");
}

void PadPilotEditor::sendRuntimeDiagnosticsToWebUi() {
  if (browser_ == nullptr) {
    return;
  }

  juce::DynamicObject::Ptr state = new juce::DynamicObject();
  const auto diagnostics = processor_.getRuntimeDiagnostics();
  state->setProperty("runtimeDiagnostics", createRuntimeDiagnosticsVar(diagnostics));

  const juce::String json = juce::JSON::toString(juce::var(state.get()), false);
  browser_->evaluateJavascript(
      "window.padpilotHostReceive && window.padpilotHostReceive(" + juce::JSON::toString(json) + ");");
}

void PadPilotEditor::handleBridgeMessage(const juce::var& message) {
  if (!message.isObject()) {
    return;
  }
  const auto* obj = message.getDynamicObject();
  if (obj == nullptr) {
    return;
  }

  const juce::String type = obj->getProperty("type").toString();
  if (type == "ready") {
    webUiLoaded_ = true;
    if (browser_ != nullptr) {
      browser_->setVisible(true);
    }
    if (loadingOverlay_ != nullptr) {
      loadingOverlay_->setProgress(1.0f);
      loadingOverlay_->setVisible(false);
    }
    statusLabel_.setVisible(false);
    stopTimer();
    if (isShowing()) {
      processor_.setEditorTelemetryVisible(true);
      processor_.setDiagnosticsTelemetryVisible(diagnosticsVisible_);
      startTimerHz(15);
    }
    resetPublishedRealtimeState();
    sendStateToWebUi();
    sendVisualizerFrameToWebUi();
    return;
  }

  if (type == "createModule") {
    processor_.createAndSaveModule(obj->getProperty("name").toString().toStdString());
    sendNavigationFrameToWebUi();
    sendActiveModuleStateFrameToWebUi();
    return;
  }

  if (type == "selectModule") {
    processor_.selectModule(obj->getProperty("moduleId").toString().toStdString());
    sendNavigationFrameToWebUi();
    sendActiveModuleStateFrameToWebUi();
    sendCapabilityFrameToWebUi(true);
    return;
  }

  if (type == "selectPreset") {
    processor_.selectPreset(obj->getProperty("presetId").toString().toStdString());
    sendNavigationFrameToWebUi();
    sendActiveModuleStateFrameToWebUi();
    return;
  }

  if (type == "setModuleState") {
    const auto moduleId = obj->getProperty("moduleId").toString().toStdString();
    processor_.setModuleStatePayload(moduleId, obj->getProperty("payload").toString().toStdString());
    const auto selectedModuleId = processor_.getSelectedModuleId();
    const auto canonicalModuleId = std::string(padpilot::canonicalModuleId(moduleId));
    if (selectedModuleId == canonicalModuleId) {
      sendActiveModuleStateFrameToWebUi();
      sendCapabilityFrameToWebUi(true);
    }
    return;
  }

  if (type == "setModuleStateProto") {
    const auto revisionText = obj->getProperty("revision").toString().toStdString();
    std::uint64_t revision = 0;
    if (!parseRevision(revisionText, revision)) {
      padpilot::appendBackendLog("editor", "setModuleStateProto rejected invalid revision");
      return;
    }
    const auto moduleId = obj->getProperty("moduleId").toString().toStdString();
    processor_.setModuleStatePayloadBase64(
        moduleId,
        obj->getProperty("payloadBase64").toString().toStdString(),
        revision);
    const auto selectedModuleId = processor_.getSelectedModuleId();
    const auto canonicalModuleId = std::string(padpilot::canonicalModuleId(moduleId));
    if (selectedModuleId == canonicalModuleId) {
      sendActiveModuleStateFrameToWebUi();
      sendCapabilityFrameToWebUi(true);
    }
    return;
  }

  if (type == "setControllerConfig") {
    processor_.setControllerConfigPayloadBase64(
        obj->getProperty("payloadBase64").toString().toStdString());
    sendHostSyncFrameToWebUi();
    sendInputStateFrameToWebUi(true);
    return;
  }

  if (type == "setEditorViewState") {
    processor_.setEditorViewStatePayload(
        obj->getProperty("scopeId").toString().toStdString(),
        obj->getProperty("payload").toString().toStdString());
    return;
  }

  if (type == "setDiagnosticsVisible") {
    diagnosticsVisible_ = static_cast<bool>(obj->getProperty("visible"));
    processor_.setDiagnosticsTelemetryVisible(isShowing() && diagnosticsVisible_);
    return;
  }

  if (type == "openCapabilityStream") {
    processor_.openCapabilityStream(
        obj->getProperty("capability").toString().toStdString(),
        obj->getProperty("handle").toString().toStdString());
    sendCapabilityFrameToWebUi(true);
    return;
  }

  if (type == "closeCapabilityStream") {
    processor_.closeCapabilityStream(
        obj->getProperty("capability").toString().toStdString(),
        obj->getProperty("handle").toString().toStdString());
    sendCapabilityFrameToWebUi(true);
    return;
  }

  if (type == "sendCapabilityIntent") {
    const auto capability = obj->getProperty("capability").toString().toStdString();
    const auto action = obj->getProperty("action").toString().toStdString();
    const auto payloadBase64 = obj->getProperty("payloadBase64").toString();
    const auto accepted = processor_.sendCapabilityIntent(
        capability,
        obj->getProperty("handle").toString().toStdString(),
        action,
        payloadBase64.toStdString());
    if (!accepted) {
      return;
    }
    if (capability == "midi-export") {
      if (action == "begin-drag") {
        beginAnalyzerMidiDrag();
        return;
      }
      if (action == "save-file") {
        beginAnalyzerMidiSave();
        return;
      }
      if (action == "begin-drag-bytes") {
        std::string payloadBytes;
        if (!padpilot::proto::base64ToBytes(payloadBase64.toStdString(), &payloadBytes)) {
          return;
        }
        const auto payload = juce::JSON::parse(
            juce::String::fromUTF8(payloadBytes.data(), static_cast<int>(payloadBytes.size())));
        const auto* payloadObject = payload.getDynamicObject();
        if (payloadObject == nullptr) {
          return;
        }
        beginMidiDragFromBytes(
            payloadObject->getProperty("filename").toString(),
            payloadObject->getProperty("midiBase64").toString());
        return;
      }
    }
    if (capability == "host-tempo" && action == "set") {
      sendHostSyncFrameToWebUi();
      return;
    }
    sendActiveModuleStateFrameToWebUi();
    sendCapabilityFrameToWebUi(true);
    return;
  }

}

juce::WebBrowserComponent::Options PadPilotEditor::makeBrowserOptions() {
 #if JucePlugin_Build_Standalone
  constexpr bool standaloneBuild = true;
 #else
  constexpr bool standaloneBuild = false;
 #endif
  auto options = juce::WebBrowserComponent::Options()
                     .withNativeIntegrationEnabled()
                     .withUserScript(kUnhandledShortcutRelayScript)
                     .withEventListener("padpilotUnhandledShortcut", [this](juce::var payload) {
                       delegateUnhandledShortcut(payload);
                     })
                     .withNativeFunction("padpilotMapWebViewPoint", [this](const juce::Array<juce::var>& params,
                                                                            juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty()) {
                         complete("error:Missing WebView coordinate request.");
                         return;
                       }
                       complete(mapWebViewPoint(params[0]));
                     })
                     .withNativeFunction("padpilotBridge", [this](const juce::Array<juce::var>& params,
                                                                  juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.size() > 0 && params[0].isString() &&
                           static_cast<std::size_t>(params[0].toString().length()) <= kMaxBridgeMessageChars) {
                         const auto message = juce::JSON::parse(params[0].toString());
                         if (!message.isVoid()) {
                           handleBridgeMessage(message);
                         }
                       } else if (params.size() > 0 && params[0].isString()) {
                         padpilot::appendBackendLog("editor", "padpilotBridge rejected oversized message");
                       }
                       complete(true);
                     })
                     .withNativeFunction("padpilotBeginFileImport", [this](const juce::Array<juce::var>& params,
                                                                           juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString()) {
                         complete("error:Missing file import request.");
                         return;
                       }
                       complete(beginFileImport(params[0].toString()));
                     })
                     .withNativeFunction("padpilotAppendFileImport", [this](const juce::Array<juce::var>& params,
                                                                            juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.size() < 2 || !params[0].isString() || !params[1].isString()) {
                         complete("error:Missing file import chunk.");
                         return;
                       }
                       complete(appendFileImport(params[0].toString(), params[1].toString()));
                     })
                     .withNativeFunction("padpilotFinishFileImport", [this](const juce::Array<juce::var>& params,
                                                                            juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString()) {
                         complete("error:Missing file import session id.");
                         return;
                       }
                       complete(finishFileImport(params[0].toString()));
                     })
                     .withNativeFunction("padpilotCancelFileImport", [this](const juce::Array<juce::var>& params,
                                                                            juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString()) {
                         complete("error:Missing file import session id.");
                         return;
                       }
                       complete(cancelFileImport(params[0].toString()));
                     })
                     .withNativeFunction("padpilotImportFilePath", [this](const juce::Array<juce::var>& params,
                                                                          juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString()) {
                         complete("error:Missing file import path request.");
                         return;
                       }
                       complete(importFilePath(params[0].toString()));
                     })
                     .withNativeFunction("padpilotGetRuntimeInfo", [this](const juce::Array<juce::var>&,
                                                                            juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       const auto runtimeInfo = padpilot::updater::buildRuntimeInfo(standaloneBuild);
                       juce::DynamicObject::Ptr payload = new juce::DynamicObject();
                       payload->setProperty("arch", runtimeInfo.arch);
                       payload->setProperty("canApplyUpdates", runtimeInfo.canApplyUpdates);
                       payload->setProperty("currentVersion", runtimeInfo.currentVersion);
                       payload->setProperty("defaultInstallPath", runtimeInfo.defaultInstallPath);
                       payload->setProperty("hostMode", runtimeInfo.hostMode);
                       payload->setProperty("installPath", runtimeInfo.installPath);
                       payload->setProperty("platform", runtimeInfo.platform);
                       complete(juce::JSON::toString(juce::var(payload.get()), false));
                     })
                     .withNativeFunction("padpilotStagePluginUpdate", [this](const juce::Array<juce::var>& params,
                                                                               juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString() ||
                           params[0].toString().isEmpty() ||
                           params[0].toString().length() > kMaxNativeJsonRequestChars) {
                         complete("error:Invalid plugin update request.");
                         return;
                       }
                       if (stageUpdateInProgress_) {
                         complete("error:A PadPilot update is already being staged.");
                         return;
                       }
                       if (stageUpdateThread_.joinable()) {
                         stageUpdateThread_.join();
                       }
                       stageUpdateInProgress_ = true;
                       const auto request = params[0].toString();
                       const auto isStandalone = standaloneBuild;
                       auto safeThis = juce::Component::SafePointer<PadPilotEditor>(this);
                       stageUpdateThread_ = std::jthread(
                           [request, isStandalone, safeThis, complete](std::stop_token stopToken) {
                             juce::String errorMessage;
                             const auto result = padpilot::updater::stagePluginUpdate(
                                 request, isStandalone, errorMessage, stopToken);
                             const auto response = result.has_value()
                                 ? toJsonResponse([&](juce::DynamicObject& payload) {
                                     payload.setProperty("hostMode", isStandalone ? "standalone" : "plugin");
                                     payload.setProperty("logPath", result->logPath);
                                     payload.setProperty("message", result->message);
                                     payload.setProperty("targetVersion", result->targetVersion);
                                   })
                                 : juce::String("error:") + errorMessage;
                             const auto statePath = result.has_value() ? result->statePath : juce::String {};
                             juce::MessageManager::callAsync([safeThis, complete, response, statePath]() {
                               if (safeThis == nullptr || safeThis->shuttingDown_) {
                                 return;
                               }
                               safeThis->stageUpdateInProgress_ = false;
                               if (statePath.isNotEmpty()) {
                                 safeThis->stagedUpdateStatePath_ = statePath;
                               }
                               complete(response);
                             });
                           });
                     })
                     .withNativeFunction("padpilotRestartAndApplyPluginUpdate", [this](const juce::Array<juce::var>&,
                                                                                         juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       juce::String errorMessage;
                       if (!padpilot::updater::restartAndApplyStagedUpdate(standaloneBuild, stagedUpdateStatePath_, errorMessage)) {
                         complete(juce::String("error:") + errorMessage);
                         return;
                       }
                       complete(true);
                     })
                     .withNativeFunction("padpilotPickFile", [this](const juce::Array<juce::var>& params,
                                                                      juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       juce::String title = "Select file";
                       juce::String patterns = "*";
                       juce::File initialDirectory = juce::File::getSpecialLocation(juce::File::userHomeDirectory);
                       if (!params.isEmpty() && !params[0].isString()) {
                         complete("error:Invalid file picker options.");
                         return;
                       }
                       if (!params.isEmpty() && params[0].isString()) {
                         const auto optionsText = params[0].toString();
                         if (optionsText.length() > kMaxNativeJsonRequestChars) {
                           complete("error:File picker options exceeded their size limit.");
                           return;
                         }
                         const auto options = juce::JSON::parse(optionsText);
                         const auto* object = options.getDynamicObject();
                         if (object == nullptr) {
                           complete("error:Invalid file picker options.");
                           return;
                         }
                         const auto nextTitle = object->getProperty("title").toString();
                         const auto nextPatterns = object->getProperty("patterns").toString();
                         const auto nextInitialPath = object->getProperty("initialPath").toString();
                         if (nextTitle.length() > kMaxFilePickerTitleChars ||
                             nextPatterns.length() > kMaxFilePickerPatternsChars ||
                             nextInitialPath.length() > kMaxNativePathChars) {
                           complete("error:File picker option exceeded its size limit.");
                           return;
                         }
                         if (nextTitle.isNotEmpty()) {
                           title = nextTitle;
                         }
                         if (nextPatterns.isNotEmpty()) {
                           patterns = nextPatterns;
                         }
                         if (nextInitialPath.isNotEmpty()) {
                           initialDirectory = juce::File(nextInitialPath);
                           if (initialDirectory.existsAsFile()) {
                             initialDirectory = initialDirectory.getParentDirectory();
                           }
                         }
                       }

                       hostFilePickerChooser_ = std::make_unique<juce::FileChooser>(title, initialDirectory, patterns);
                       auto safeThis = juce::Component::SafePointer<PadPilotEditor>(this);
                       hostFilePickerChooser_->launchAsync(
                           juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                           [safeThis, complete](const juce::FileChooser& chooser) {
                             if (safeThis == nullptr || safeThis->shuttingDown_) {
                               return;
                             }
                             const auto selected = chooser.getResult();
                             if (selected.existsAsFile()) {
                               safeThis->authorizeFileImportPath(selected);
                             }
                             complete(toJsonResponse([&](juce::DynamicObject& payload) {
                               payload.setProperty("cancelled", !selected.existsAsFile());
                               payload.setProperty("path", selected.existsAsFile() ? selected.getFullPathName() : juce::String {});
                             }));
                           });
                     })
                     .withNativeFunction("padpilotInstallModuleBundle", [this](const juce::Array<juce::var>& params,
                                                                                juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                       if (params.isEmpty() || !params[0].isString() ||
                           params[0].toString().isEmpty() ||
                           params[0].toString().length() > kMaxNativePathChars) {
                         complete("error:Invalid bundle archive path.");
                         return;
                       }

                       std::string errorMessage;
                       const auto installedModule = processor_.installModuleBundle(params[0].toString().toStdString(), errorMessage);
                       if (!installedModule.has_value()) {
                         statusLabel_.setText(errorMessage.empty() ? "Module install failed." : juce::String(errorMessage), juce::dontSendNotification);
                         statusLabel_.setVisible(true);
                         complete(juce::String("error:") + juce::String(errorMessage));
                         return;
                       }

                       sendNavigationFrameToWebUi();
                       sendActiveModuleStateFrameToWebUi();
                       sendCapabilityFrameToWebUi(true);

                       complete(toJsonResponse([&](juce::DynamicObject& payload) {
                         payload.setProperty("id", juce::String(installedModule->id));
                         payload.setProperty("name", juce::String(installedModule->name));
                         payload.setProperty("version", juce::String(installedModule->version));
                         payload.setProperty("loadStatus", juce::String(installedModule->loadStatus));
                         payload.setProperty("loadErrorMessage", juce::String(installedModule->loadErrorMessage));
                         payload.setProperty("expectedModuleVersion", juce::String(installedModule->expectedModuleVersion));
                         payload.setProperty("resolvedModuleVersion", juce::String(installedModule->resolvedModuleVersion));
                         payload.setProperty("uiEntryPath", juce::String(installedModule->entryPath));
                         payload.setProperty("scriptEntryPath", juce::String(installedModule->scriptEntryPath));
                         juce::Array<juce::var> capabilities;
                         for (const auto& capability : installedModule->capabilities) {
                           capabilities.add(juce::String(capability));
                         }
                         payload.setProperty("capabilities", capabilities);
                       }));
                     });

  // Serve files from BinaryData
  options = options.withResourceProvider([this](const juce::String& url) -> std::optional<juce::WebBrowserComponent::Resource> {
    juce::String path = url;
    if (path.startsWithChar('/')) path = path.substring(1);
    if (path.isEmpty()) path = "index.html";

    if (path.startsWith("__padpilot/modules/")) {
      if (const auto resolved = processor_.resolveModuleWebResourcePath(("/" + path).toStdString()); resolved.has_value()) {
        const auto file = juce::File(*resolved);
        if (auto byteVector = readBoundedModuleResource(file); byteVector.has_value()) {
          juce::String mimeType = "text/plain";
          if (path.endsWith(".html")) mimeType = "text/html";
          else if (path.endsWith(".js")) mimeType = "text/javascript";
          else if (path.endsWith(".css")) mimeType = "text/css";
          else if (path.endsWith(".json")) mimeType = "application/json";

          return juce::WebBrowserComponent::Resource { std::move(*byteVector), mimeType.toStdString() };
        }
      }
      padpilot::appendBackendLog("editor", "module web resource rejected path=" + path.toStdString());
      return std::nullopt;
    }

    int size = 0;
    const char* data = nullptr;

    const auto pathFileName = juce::File(path).getFileName();
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i) {
      const auto* resourceName = BinaryData::namedResourceList[i];
      const auto originalFilename = juce::String(BinaryData::getNamedResourceOriginalFilename(resourceName));
      if (originalFilename.endsWithIgnoreCase(path) || originalFilename.endsWithIgnoreCase(pathFileName)) {
        data = BinaryData::getNamedResource(resourceName, size);
        if (data != nullptr && size > 0) {
          break;
        }
      }
    }

    // WebView2 turns a missing provider response into an opaque navigation error.
    // Return a bounded 404 document while retaining the failed path in backend diagnostics.
    if (data == nullptr) {
      padpilot::appendBackendLog("editor", "embedded UI resource missing path=" + path.toStdString());
      const juce::String errorHtml = "<html><body><h1>404 Resource not found</h1></body></html>";
      std::vector<std::byte> byteVector(static_cast<size_t>(errorHtml.getNumBytesAsUTF8()));
      std::memcpy(byteVector.data(), errorHtml.toRawUTF8(), byteVector.size());
      return juce::WebBrowserComponent::Resource { std::move(byteVector), "text/html" };
    }

    std::vector<std::byte> byteVector(static_cast<size_t>(size));
    std::memcpy(byteVector.data(), data, static_cast<size_t>(size));

    juce::String mimeType = "text/plain";
    if (path.endsWith(".html")) mimeType = "text/html";
    else if (path.endsWith(".js")) mimeType = "text/javascript";
    else if (path.endsWith(".css")) mimeType = "text/css";
    else if (path.endsWith(".json")) mimeType = "application/json";

    return juce::WebBrowserComponent::Resource { std::move(byteVector), mimeType.toStdString() };
  });

#if JUCE_WINDOWS
  const auto userDataFolder = prepareWebViewUserDataFolder();

  const auto webView2Options = juce::WebBrowserComponent::Options::WinWebView2()
                                   .withUserDataFolder(userDataFolder);
  
  options = options.withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
                   .withWinWebView2Options(webView2Options);
  
  webView2Supported_ = juce::WebBrowserComponent::areOptionsSupported(options);
  if (webView2Supported_) {
    return options;
  }
#endif

  return options;
}
