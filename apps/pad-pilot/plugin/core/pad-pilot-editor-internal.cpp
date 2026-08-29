#include "core/pad-pilot-editor-internal.h"

namespace padpilot::editor_detail {
std::optional<double> readFiniteNumber(const juce::var& value) {
  if (!value.isInt() && !value.isInt64() && !value.isDouble()) {
    return std::nullopt;
  }
  const auto number = static_cast<double>(value);
  if (!std::isfinite(number) || std::abs(number) > kMaxWebViewCoordinate) {
    return std::nullopt;
  }
  return number;
}

std::optional<std::string> canonicalImportPathKey(const juce::String& path) {
  if (path.isEmpty() || path.length() > kMaxNativePathChars || !juce::File::isAbsolutePath(path)) {
    return std::nullopt;
  }
  const auto file = juce::File(path);
  if (!file.existsAsFile() || file.isSymbolicLink()) {
    return std::nullopt;
  }
  auto normalized = file.getFullPathName().replaceCharacter('\\', '/');
#if JUCE_WINDOWS
  normalized = normalized.toLowerCase();
#endif
  return normalized.toStdString();
}

#if JUCE_WINDOWS
juce::File prepareWebViewUserDataFolder() {
  const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("PadPilot_WebView2_Cache");
  root.createDirectory();

  static std::once_flag cleanupOnce;
  std::call_once(cleanupOnce, [&root]() {
    juce::InterProcessLock maintenanceLock("PadPilot-WebView2-Cache-Maintenance");
    if (!maintenanceLock.enter(0)) {
      return;
    }

    const std::array<juce::String, 8> relativeCachePaths {
        "Default/Cache",
        "Default/Code Cache",
        "Default/GPUCache",
        "Default/Service Worker/CacheStorage",
        "Default/Service Worker/ScriptCache",
        "DawnCache",
        "GrShaderCache",
        "ShaderCache",
    };
    const auto cutoffMs = juce::Time::currentTimeMillis() - kWebViewCacheMaxAgeMs;
    for (const auto& relativePath : relativeCachePaths) {
      const auto target = root.getChildFile(relativePath);
      if (!target.isDirectory() || target.isSymbolicLink() || !target.isAChildOf(root) ||
          target.getLastModificationTime().toMilliseconds() >= cutoffMs) {
        continue;
      }
      const auto deleted = target.deleteRecursively(false);
      padpilot::appendBackendLog(
          "editor",
          "stale WebView cache cleanup path=" + relativePath.toStdString() +
              " deleted=" + (deleted ? std::string {"true"} : std::string {"false"}));
    }
    maintenanceLock.exit();
  });
  return root;
}

#endif

juce::var createRuntimeDiagnosticsVar(const padpilot::RuntimeDiagnostics& diagnostics) {
  juce::DynamicObject::Ptr diagnosticsObj = new juce::DynamicObject();
  diagnosticsObj->setProperty("inputWakeups", static_cast<juce::int64>(diagnostics.inputWakeups));
  diagnosticsObj->setProperty("inputEventsPushed", static_cast<juce::int64>(diagnostics.inputEventsPushed));
  diagnosticsObj->setProperty("inputEventsDropped", static_cast<juce::int64>(diagnostics.inputEventsDropped));
  diagnosticsObj->setProperty("inputCommandsPushed", static_cast<juce::int64>(diagnostics.inputCommandsPushed));
  diagnosticsObj->setProperty("inputCommandsDropped", static_cast<juce::int64>(diagnostics.inputCommandsDropped));
  diagnosticsObj->setProperty("scriptWakeups", static_cast<juce::int64>(diagnostics.scriptWakeups));
  diagnosticsObj->setProperty("scriptEventsProcessed", static_cast<juce::int64>(diagnostics.scriptEventsProcessed));
  diagnosticsObj->setProperty("scriptCommandsPushed", static_cast<juce::int64>(diagnostics.scriptCommandsPushed));
  diagnosticsObj->setProperty("scriptCommandsDropped", static_cast<juce::int64>(diagnostics.scriptCommandsDropped));
  diagnosticsObj->setProperty("uiAudioCommandsPushed", static_cast<juce::int64>(diagnostics.uiAudioCommandsPushed));
  diagnosticsObj->setProperty("uiAudioCommandsDropped", static_cast<juce::int64>(diagnostics.uiAudioCommandsDropped));
  diagnosticsObj->setProperty("audioCommandsRejected", static_cast<juce::int64>(diagnostics.audioCommandsRejected));
  diagnosticsObj->setProperty("analyzerAudioSlicesPushed", static_cast<juce::int64>(diagnostics.analyzerAudioSlicesPushed));
  diagnosticsObj->setProperty("analyzerAudioSlicesDropped", static_cast<juce::int64>(diagnostics.analyzerAudioSlicesDropped));
  diagnosticsObj->setProperty("profilingEnabled", diagnostics.profilingEnabled);
  diagnosticsObj->setProperty("profiledBlocks", static_cast<juce::int64>(diagnostics.profiledBlocks));
  diagnosticsObj->setProperty("avgBlockUs", diagnostics.avgBlockUs);
  diagnosticsObj->setProperty("avgConvolverUs", diagnostics.avgConvolverUs);
  diagnosticsObj->setProperty("avgDelayUs", diagnostics.avgDelayUs);
  diagnosticsObj->setProperty("avgReverbUs", diagnostics.avgReverbUs);
  diagnosticsObj->setProperty("avgReverbPreDelayUs", diagnostics.avgReverbPreDelayUs);
  diagnosticsObj->setProperty("avgReverbCoreUs", diagnostics.avgReverbCoreUs);
  diagnosticsObj->setProperty("avgReverbMixUs", diagnostics.avgReverbMixUs);
  diagnosticsObj->setProperty("avgModulationUs", diagnostics.avgModulationUs);
  diagnosticsObj->setProperty("avgEqUs", diagnostics.avgEqUs);
  diagnosticsObj->setProperty("convolverPeakDb", diagnostics.convolverPeakDb);
  diagnosticsObj->setProperty("delayPeakDb", diagnostics.delayPeakDb);
  diagnosticsObj->setProperty("reverbPeakDb", diagnostics.reverbPeakDb);
  diagnosticsObj->setProperty("modulationPeakDb", diagnostics.modulationPeakDb);
  diagnosticsObj->setProperty("eqPeakDb", diagnostics.eqPeakDb);
  diagnosticsObj->setProperty("outputPeakDb", diagnostics.outputPeakDb);

  juce::Array<juce::var> chains;
  for (const auto& chain : diagnostics.chains) {
    juce::DynamicObject::Ptr chainObj = new juce::DynamicObject();
    chainObj->setProperty("chainId", static_cast<int>(chain.chainId));
    chainObj->setProperty("active", chain.active);
    chainObj->setProperty("muted", chain.muted);
    chainObj->setProperty("solo", chain.solo);
    chainObj->setProperty("activeNodeCount", static_cast<int>(chain.activeNodeCount));
    chainObj->setProperty("avgChainUs", chain.avgChainUs);
    chainObj->setProperty("inputPeakDb", chain.inputPeakDb);
    chainObj->setProperty("outputPeakDb", chain.outputPeakDb);
    chains.add(juce::var(chainObj.get()));
  }
  diagnosticsObj->setProperty("chains", chains);
  return juce::var(diagnosticsObj.get());
}

std::string buildRecutSampleLoadRequestBase64(const padpilot::ManagedFileRecord& file) {
  padpilot::capability::SampleSourceLoadRequest request;
  request.set_source_path(file.managedPath);
  request.set_source_name(file.sourceName);
  request.set_source_content_id(file.contentId);
  std::string bytes;
  request.SerializeToString(&bytes);
  return padpilot::proto::bytesToBase64(bytes);
}

juce::String toJsonResponse(const std::function<void(juce::DynamicObject&)>& assign) {
  juce::DynamicObject::Ptr payload = new juce::DynamicObject();
  assign(*payload);
  return juce::JSON::toString(juce::var(payload.get()), false);
}

bool parseRevision(const std::string& text, std::uint64_t& revision) {
  revision = 0;
  if (text.empty()) {
    return true;
  }

  const auto* begin = text.data();
  const auto* end = begin + text.size();
  const auto [next, error] = std::from_chars(begin, end, revision);
  return error == std::errc {} && next == end;
}

std::optional<std::vector<std::byte>> readBoundedModuleResource(const juce::File& file) {
  if (!file.existsAsFile() || file.isSymbolicLink()) {
    return std::nullopt;
  }

  auto input = file.createInputStream();
  if (input == nullptr) {
    return std::nullopt;
  }

  const auto streamLength = input->getTotalLength();
  if (streamLength <= 0 || streamLength > kMaxModuleWebResourceBytes ||
      file.isSymbolicLink() || file.getSize() != streamLength) {
    return std::nullopt;
  }

  std::vector<std::byte> bytes(static_cast<std::size_t>(streamLength));
  std::size_t offset = 0;
  while (offset < bytes.size()) {
    const auto remaining = bytes.size() - offset;
    const auto chunkSize = static_cast<int>(std::min<std::size_t>(remaining, 64U * 1024U));
    const auto bytesRead = input->read(bytes.data() + offset, chunkSize);
    if (bytesRead <= 0) {
      return std::nullopt;
    }
    offset += static_cast<std::size_t>(bytesRead);
  }

  std::byte trailingByte {};
  if (input->read(&trailingByte, 1) != 0 || file.isSymbolicLink() ||
      file.getSize() != streamLength) {
    return std::nullopt;
  }
  return bytes;
}
}  // namespace padpilot::editor_detail
