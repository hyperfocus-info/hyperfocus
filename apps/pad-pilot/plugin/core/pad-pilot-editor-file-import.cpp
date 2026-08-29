#include "core/pad-pilot-editor-internal.h"

using namespace padpilot::editor_detail;

bool PadPilotEditor::isSupportedSampleFile(const juce::String& path) const {
  const auto extension = juce::File(path).getFileExtension().toLowerCase();
  return extension == ".wav" || extension == ".aif" || extension == ".aiff" || extension == ".flac" ||
         extension == ".mp3" || extension == ".ogg";
}

bool PadPilotEditor::shouldHandleRecutSampleInput() const {
  return processor_.buildSelectedModuleCapabilityHandle("sample-source").length() > 0;
}

void PadPilotEditor::publishImportedSample(const padpilot::ManagedFileRecord& file) {
  const auto handle = processor_.buildSelectedModuleCapabilityHandle("sample-source");
  padpilot::appendBackendLog(
      "editor",
      "publishImportedSample handle=" + handle +
          " managedPath=" + file.managedPath +
          " sourceName=" + file.sourceName +
          " contentId=" + file.contentId);
  if (handle.empty()) {
    padpilot::appendBackendLog("editor", "publishImportedSample aborted empty handle");
    return;
  }

  processor_.sendCapabilityIntent(
      "sample-source",
      handle,
      "load-file",
      buildRecutSampleLoadRequestBase64(file));
  sendCapabilityFrameToWebUi(true);

  if (browser_ != nullptr) {
    juce::DynamicObject::Ptr response = new juce::DynamicObject();
    response->setProperty("type", "sampleSourcePathSelected");
    response->setProperty("contentId", juce::String(file.contentId));
    response->setProperty("name", juce::String(file.sourceName));
    response->setProperty("path", juce::String(file.managedPath));
    response->setProperty("pathSelectionSequence", static_cast<int>(++samplePathSelectionSequence_));
    const juce::String json = juce::JSON::toString(juce::var(response.get()), false);
    browser_->evaluateJavascript(
        "window.padpilotHostReceive && window.padpilotHostReceive(" +
        juce::JSON::toString(json) + ");");
  }
}

void PadPilotEditor::pruneExpiredFileImports() {
  const auto nowMs = juce::Time::getMillisecondCounterHiRes();
  std::erase_if(pendingFileImports_, [nowMs](const auto& entry) {
    return nowMs - entry.second.lastActivityMs > kFileImportSessionTimeoutMs;
  });
}

juce::String PadPilotEditor::beginFileImport(const juce::String& requestJson) {
  if (requestJson.isEmpty() || requestJson.length() > kMaxFileImportRequestChars) {
    return "error:Invalid file import request.";
  }
  padpilot::appendBackendLog("editor", "beginFileImport requestBytes=" + std::to_string(requestJson.getNumBytesAsUTF8()));
  const auto parsed = juce::JSON::parse(requestJson);
  const auto* object = parsed.getDynamicObject();
  if (object == nullptr) {
    padpilot::appendBackendLog("editor", "beginFileImport invalid request");
    return "error:Invalid file import request.";
  }

  const auto sourceName = object->getProperty("name").toString();
  const auto mimeType = object->getProperty("mimeType").toString();
  const auto category = object->getProperty("category").toString().toStdString();
  const auto declaredByteSize = static_cast<juce::int64>(object->getProperty("byteSize"));
  const auto requestedMaxBytes = static_cast<juce::int64>(object->getProperty("maxBytes"));
  const auto maxBytes = requestedMaxBytes > 0
      ? std::min<std::uint64_t>(static_cast<std::uint64_t>(requestedMaxBytes), kMaxImportedSampleBytes)
      : kMaxImportedSampleBytes;
  if (requestedMaxBytes < 0) {
    return "error:Invalid file import limit.";
  }

  if (category != "sample" && category != "impulse-response") {
    return "error:Unsupported file import category.";
  }
  if (!processor_.canImportManagedMediaCategory(category)) {
    return "error:The selected ready Module does not declare the required file-import capability.";
  }
  if (sourceName.isEmpty() || sourceName.length() > kMaxImportedSourceNameChars ||
      mimeType.length() > kMaxImportedMimeTypeChars) {
    return "error:Imported file is missing a name.";
  }
  if (!padpilot::ManagedFileStore::isSupportedSampleName(sourceName.toStdString())) {
    return "error:Unsupported sample format. Recut accepts wav, aif, aiff, flac, mp3, and ogg.";
  }
  if (declaredByteSize <= 0) {
    return "error:Imported sample is empty.";
  }
  const auto byteSize = static_cast<std::uint64_t>(declaredByteSize);
  if (byteSize > maxBytes || byteSize > kMaxImportedSampleBytes) {
    return "error:Imported sample exceeds the 25 MiB limit.";
  }
  pruneExpiredFileImports();
  if (pendingFileImports_.size() >= kMaxPendingFileImports) {
    return "error:Too many file imports are already pending.";
  }

  const auto importId = juce::Uuid().toString().toStdString();
  PendingFileImport pending;
  pending.category = category;
  pending.expectedBytes = byteSize;
  pending.lastActivityMs = juce::Time::getMillisecondCounterHiRes();
  pending.maxBytes = maxBytes;
  pending.mimeType = mimeType;
  pending.sourceName = sourceName;
  pendingFileImports_[importId] = std::move(pending);
  padpilot::appendBackendLog("editor", "beginFileImport opened importId=" + importId);
  return toJsonResponse([&](juce::DynamicObject& payload) {
    payload.setProperty("importId", juce::String(importId));
  });
}

juce::String PadPilotEditor::appendFileImport(const juce::String& importId, const juce::String& payloadBase64) {
  if (importId.isEmpty() || importId.length() > kMaxImportSessionIdChars ||
      payloadBase64.isEmpty() ||
      static_cast<std::size_t>(payloadBase64.length()) > kMaxFileImportChunkBase64Chars) {
    return "error:Invalid file import chunk.";
  }
  pruneExpiredFileImports();
  const auto it = pendingFileImports_.find(importId.toStdString());
  if (it == pendingFileImports_.end()) {
    padpilot::appendBackendLog("editor", "appendFileImport unknown importId=" + importId.toStdString());
    return "error:Unknown file import session.";
  }

  std::string bytes;
  if (!padpilot::proto::base64ToBytes(payloadBase64.toStdString(), &bytes) ||
      bytes.empty() || bytes.size() > kMaxFileImportChunkBytes) {
    pendingFileImports_.erase(it);
    padpilot::appendBackendLog("editor", "appendFileImport invalid base64 importId=" + importId.toStdString());
    return "error:Invalid file import chunk.";
  }

  auto& pending = it->second;
  const auto receivedBytes = static_cast<std::uint64_t>(pending.data.getSize());
  std::uint64_t aggregatePendingBytes = 0;
  for (const auto& [_, activeImport] : pendingFileImports_) {
    aggregatePendingBytes += static_cast<std::uint64_t>(activeImport.data.getSize());
  }
  if (receivedBytes > pending.maxBytes || receivedBytes > pending.expectedBytes ||
      bytes.size() > pending.maxBytes - receivedBytes ||
      bytes.size() > pending.expectedBytes - receivedBytes ||
      aggregatePendingBytes > kMaxImportedSampleBytes ||
      bytes.size() > kMaxImportedSampleBytes - aggregatePendingBytes) {
    pendingFileImports_.erase(it);
    padpilot::appendBackendLog("editor", "appendFileImport oversize importId=" + importId.toStdString());
    return "error:Imported sample exceeds the 25 MiB limit.";
  }
  pending.data.append(bytes.data(), bytes.size());
  pending.lastActivityMs = juce::Time::getMillisecondCounterHiRes();
  padpilot::appendBackendLog(
      "editor",
      "appendFileImport importId=" + importId.toStdString() +
          " receivedBytes=" + std::to_string(static_cast<std::uint64_t>(pending.data.getSize())));
  return toJsonResponse([&](juce::DynamicObject& payload) {
    payload.setProperty("receivedBytes", static_cast<juce::int64>(pending.data.getSize()));
  });
}

juce::String PadPilotEditor::finishFileImport(const juce::String& importId) {
  if (importId.isEmpty() || importId.length() > kMaxImportSessionIdChars) {
    return "error:Unknown file import session.";
  }
  pruneExpiredFileImports();
  const auto it = pendingFileImports_.find(importId.toStdString());
  if (it == pendingFileImports_.end()) {
    padpilot::appendBackendLog("editor", "finishFileImport unknown importId=" + importId.toStdString());
    return "error:Unknown file import session.";
  }

  auto pending = std::move(it->second);
  pendingFileImports_.erase(it);
  if (static_cast<std::uint64_t>(pending.data.getSize()) != pending.expectedBytes) {
    return "error:Imported sample size did not match its declaration.";
  }

  std::string errorMessage;
  const auto imported = pending.category == "impulse-response"
      ? processor_.importManagedImpulseResponseBytes(pending.data.getData(),
                                                     static_cast<std::size_t>(pending.data.getSize()),
                                                     pending.sourceName.toStdString(),
                                                     pending.mimeType.toStdString(),
                                                     pending.maxBytes,
                                                     errorMessage)
      : processor_.importManagedSampleBytes(pending.data.getData(),
                                            static_cast<std::size_t>(pending.data.getSize()),
                                            pending.sourceName.toStdString(),
                                            pending.mimeType.toStdString(),
                                            pending.maxBytes,
                                            errorMessage);
  if (!imported.has_value()) {
    padpilot::appendBackendLog("editor", "finishFileImport failed importId=" + importId.toStdString() + " error=" + errorMessage);
    return "error:" + juce::String(errorMessage.empty() ? "PadPilot could not finish the file import." : errorMessage);
  }

  padpilot::appendBackendLog(
      "editor",
      "finishFileImport success importId=" + importId.toStdString() +
          " managedPath=" + imported->managedPath);

  return toJsonResponse([&](juce::DynamicObject& payload) {
    payload.setProperty("byteSize", static_cast<juce::int64>(imported->byteSize));
    payload.setProperty("contentId", juce::String(imported->contentId));
    payload.setProperty("mimeType", juce::String(imported->mimeType));
    payload.setProperty("name", juce::String(imported->sourceName));
    payload.setProperty("path", juce::String(imported->managedPath));
  });
}

juce::String PadPilotEditor::cancelFileImport(const juce::String& importId) {
  if (importId.isEmpty() || importId.length() > kMaxImportSessionIdChars) {
    return "error:Unknown file import session.";
  }
  pendingFileImports_.erase(importId.toStdString());
  padpilot::appendBackendLog("editor", "cancelFileImport importId=" + importId.toStdString());
  return toJsonResponse([&](juce::DynamicObject& payload) {
    payload.setProperty("cancelled", true);
  });
}

void PadPilotEditor::pruneExpiredAuthorizedFileImports() {
  const auto nowMs = juce::Time::getMillisecondCounterHiRes();
  std::erase_if(authorizedFileImports_, [nowMs](const auto& entry) {
    return entry.second.expiresAtMs <= nowMs;
  });
}

void PadPilotEditor::authorizeFileImportPath(const juce::File& file) {
  const auto canonicalPath = file.getFullPathName();
  const auto key = canonicalImportPathKey(canonicalPath);
  if (!key.has_value()) {
    return;
  }
  pruneExpiredAuthorizedFileImports();
  if (authorizedFileImports_.size() >= kMaxAuthorizedFileImports) {
    authorizedFileImports_.clear();
  }
  authorizedFileImports_[*key] = {
      juce::Time::getMillisecondCounterHiRes() + kAuthorizedFileImportTimeoutMs,
      canonicalPath,
  };
}

std::optional<juce::String> PadPilotEditor::consumeAuthorizedFileImportPath(const juce::String& path) {
  pruneExpiredAuthorizedFileImports();
  const auto key = canonicalImportPathKey(path);
  if (!key.has_value()) {
    return std::nullopt;
  }
  const auto it = authorizedFileImports_.find(*key);
  if (it == authorizedFileImports_.end()) {
    return std::nullopt;
  }
  auto canonicalPath = it->second.canonicalPath;
  authorizedFileImports_.erase(it);
  if (!canonicalImportPathKey(canonicalPath).has_value()) {
    return std::nullopt;
  }
  return canonicalPath;
}

juce::String PadPilotEditor::importFilePath(const juce::String& requestJson) {
  if (requestJson.isEmpty() || requestJson.length() > kMaxFileImportRequestChars) {
    return "error:Invalid file path import request.";
  }
  padpilot::appendBackendLog("editor", "importFilePath requestBytes=" + std::to_string(requestJson.getNumBytesAsUTF8()));
  const auto parsed = juce::JSON::parse(requestJson);
  const auto* object = parsed.getDynamicObject();
  if (object == nullptr) {
    padpilot::appendBackendLog("editor", "importFilePath invalid request");
    return "error:Invalid file path import request.";
  }

  const auto requestedPath = object->getProperty("path").toString();
  const auto authorizedPath = consumeAuthorizedFileImportPath(requestedPath);
  if (!authorizedPath.has_value()) {
    padpilot::appendBackendLog("editor", "importFilePath rejected unauthorized path");
    return "error:File path was not authorized by the native picker.";
  }
  const auto path = authorizedPath->toStdString();
  const auto category = object->getProperty("category").toString().toStdString();
  const auto requestedMaxBytes = static_cast<juce::int64>(object->getProperty("maxBytes"));
  const auto maxBytes = requestedMaxBytes > 0
      ? std::min<std::uint64_t>(static_cast<std::uint64_t>(requestedMaxBytes), kMaxImportedSampleBytes)
      : kMaxImportedSampleBytes;
  if (category != "sample" && category != "impulse-response") {
    return "error:Unsupported file import category.";
  }
  if (!processor_.canImportManagedMediaCategory(category)) {
    return "error:The selected ready Module does not declare the required file-import capability.";
  }
  if (requestedMaxBytes < 0 || path.empty() || path.size() > static_cast<std::size_t>(kMaxFileImportRequestChars)) {
    return "error:Invalid file path import request.";
  }
  std::string errorMessage;
  const auto imported = category == "impulse-response"
      ? processor_.importManagedImpulseResponseFile(path, maxBytes, errorMessage)
      : processor_.importManagedSampleFile(path, maxBytes, errorMessage);
  if (!imported.has_value()) {
    padpilot::appendBackendLog("editor", "importFilePath failed path=" + path + " error=" + errorMessage);
    return "error:" + juce::String(errorMessage.empty() ? "PadPilot could not import the selected file path." : errorMessage);
  }

  padpilot::appendBackendLog("editor", "importFilePath success managedPath=" + imported->managedPath);

  return toJsonResponse([&](juce::DynamicObject& payload) {
    payload.setProperty("byteSize", static_cast<juce::int64>(imported->byteSize));
    payload.setProperty("contentId", juce::String(imported->contentId));
    payload.setProperty("mimeType", juce::String(imported->mimeType));
    payload.setProperty("name", juce::String(imported->sourceName));
    payload.setProperty("path", juce::String(imported->managedPath));
  });
}

bool PadPilotEditor::isInterestedInFileDrag(const juce::StringArray& files) {
  if (!shouldHandleRecutSampleInput()) {
    return false;
  }

  for (const auto& path : files) {
    if (isSupportedSampleFile(path)) {
      return true;
    }
  }
  return false;
}

void PadPilotEditor::filesDropped(const juce::StringArray& files, int, int) {
  if (!shouldHandleRecutSampleInput()) {
    return;
  }

  for (const auto& path : files) {
    const juce::File file(path);
    if (file.existsAsFile() && isSupportedSampleFile(path)) {
      padpilot::appendBackendLog("editor", "filesDropped importing path=" + path.toStdString());
      std::string errorMessage;
      const auto imported = processor_.importManagedSampleFile(path.toStdString(), kMaxImportedSampleBytes, errorMessage);
      if (imported.has_value()) {
        publishImportedSample(*imported);
      } else {
        padpilot::appendBackendLog("editor", "filesDropped import failed path=" + path.toStdString() + " error=" + errorMessage);
      }
      return;
    }
  }
}

